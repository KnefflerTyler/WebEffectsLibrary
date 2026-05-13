/**
 * buildFlatGrid — builds a flat (y=0) XZ triangle mesh for one chunk.
 *
 * The GPU vertex shader handles all Y displacement (Perlin FBM + quantization).
 * Only positions and indices are needed; normals are computed in the shader.
 *
 * @param {number} ox       World X origin of the chunk.
 * @param {number} oz       World Z origin of the chunk.
 * @param {number} size     Number of cells per side (chunkSize).
 * @param {number} cellSize World units per cell.
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function buildFlatGrid(ox, oz, size, cellSize) {
    const vCount = (size + 1) * (size + 1);
    const positions = new Float32Array(vCount * 3);

    let vi = 0;
    for (let z = 0; z <= size; z++) {
        for (let x = 0; x <= size; x++) {
            positions[vi++] = ox + x * cellSize;
            positions[vi++] = 0;
            positions[vi++] = oz + z * cellSize;
        }
    }

    const indices = new Uint32Array(size * size * 6);
    let ii = 0;
    const w = size + 1;
    for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
            const tl = z * w + x;
            const tr = tl + 1;
            const bl = tl + w;
            const br = bl + 1;
            indices[ii++] = tl; indices[ii++] = bl; indices[ii++] = tr;
            indices[ii++] = tr; indices[ii++] = bl; indices[ii++] = br;
        }
    }

    return { positions, indices };
}
 *
 * Strategy:
 *   1. Sample Perlin FBM heights for the chunk + a 1-cell border (to detect
 *      cliff faces at chunk edges without needing data from neighbours).
 *   2. For every column (lx, lz) with height h > 0:
 *        • Top face  (+Y)  — always emitted.
 *        • 4 side faces    — only emitted where the adjacent column is shorter,
 *                            spanning from the neighbour's height up to h.
 *        • Bottom face     — never emitted (camera never sees underground).
 *
 * Each face is a quad (4 verts, 2 tris).  Winding is CCW from the outward
 * normal direction so Three.js FrontSide culls the back correctly.
 *
 * Normals are baked as a vec3 vertex attribute; lighting is done on the GPU.
 *
 * @param {number} ox       World X origin of the chunk.
 * @param {number} oz       World Z origin of the chunk.
 * @param {number} cols     Columns in X per chunk.
 * @param {number} rows     Columns in Z per chunk.
 * @param {number} cellSize World units per voxel cell.
 * @param {object} cfg      TERRAIN_CONFIG (needs noise + heightSteps fields).
 * @returns {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }}
 */

import { fbm } from './perlin.js';

export function buildVoxelChunk(ox, oz, cols, rows, cellSize, cfg) {
    const { noiseScale, octaves, persistence, lacunarity, heightSteps } = cfg;
    const s = cellSize;

    // ── Height map with 1-cell border ────────────────────────────────────────
    // Index layout: bw columns, rows from lz=-1 to lz=rows, lx=-1 to lx=cols
    const bw   = cols + 2;
    const bh   = rows + 2;
    const hmap = new Int32Array(bw * bh);

    for (let lz = 0; lz < bh; lz++) {
        for (let lx = 0; lx < bw; lx++) {
            const wx = ox + (lx - 1) * s;
            const wz = oz + (lz - 1) * s;
            const n  = fbm(wx, wz, octaves, persistence, lacunarity, noiseScale);
            // Map [-1,1] → [0, heightSteps]
            hmap[lz * bw + lx] = Math.max(0, Math.round((n * 0.5 + 0.5) * heightSteps));
        }
    }

    // Accessor: lx/lz in [-1 .. cols] / [-1 .. rows]
    function getH(lx, lz) { return hmap[(lz + 1) * bw + (lx + 1)]; }

    // ── Geometry buffers ──────────────────────────────────────────────────────
    const posArr = [];   // flat [x,y,z, ...]
    const nrmArr = [];   // flat [nx,ny,nz, ...]
    const idxArr = [];

    /**
     * Emit one quad (4 verts → 2 CCW tris) with a constant face normal.
     * Vertices must already be in the correct CCW order for the given normal.
     */
    function addQuad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz) {
        const base = posArr.length / 3;
        posArr.push(ax, ay, az,  bx, by, bz,  cx, cy, cz,  dx, dy, dz);
        nrmArr.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
        idxArr.push(base, base + 1, base + 2,  base, base + 2, base + 3);
    }

    // ── Face emission ─────────────────────────────────────────────────────────
    for (let lz = 0; lz < rows; lz++) {
        for (let lx = 0; lx < cols; lx++) {
            const h = getH(lx, lz);
            if (h <= 0) continue;

            const wx  = ox + lx * s;
            const wz  = oz + lz * s;
            const wy  = h * s;          // world Y of the top surface

            // ── Top face (+Y) ─────────────────────────────────────────────────
            // CCW from +Y: A(wx,wz) → B(wx,wz+s) → C(wx+s,wz+s) → D(wx+s,wz)
            addQuad(
                wx,   wy, wz,
                wx,   wy, wz + s,
                wx+s, wy, wz + s,
                wx+s, wy, wz,
                0, 1, 0,
            );

            // ── +Z face (north) ───────────────────────────────────────────────
            const hnz = getH(lx, lz + 1);
            if (hnz < h) {
                const yBot = hnz * s;
                addQuad(
                    wx,   yBot, wz + s,
                    wx+s, yBot, wz + s,
                    wx+s, wy,   wz + s,
                    wx,   wy,   wz + s,
                    0, 0, 1,
                );
            }

            // ── -Z face (south) ───────────────────────────────────────────────
            const hsz = getH(lx, lz - 1);
            if (hsz < h) {
                const yBot = hsz * s;
                addQuad(
                    wx+s, yBot, wz,
                    wx,   yBot, wz,
                    wx,   wy,   wz,
                    wx+s, wy,   wz,
                    0, 0, -1,
                );
            }

            // ── +X face (east) ────────────────────────────────────────────────
            const hex = getH(lx + 1, lz);
            if (hex < h) {
                const yBot = hex * s;
                addQuad(
                    wx+s, yBot, wz + s,
                    wx+s, yBot, wz,
                    wx+s, wy,   wz,
                    wx+s, wy,   wz + s,
                    1, 0, 0,
                );
            }

            // ── -X face (west) ────────────────────────────────────────────────
            const hwx = getH(lx - 1, lz);
            if (hwx < h) {
                const yBot = hwx * s;
                addQuad(
                    wx,   yBot, wz,
                    wx,   yBot, wz + s,
                    wx,   wy,   wz + s,
                    wx,   wy,   wz,
                    -1, 0, 0,
                );
            }
        }
    }

    return {
        positions: new Float32Array(posArr),
        normals:   new Float32Array(nrmArr),
        indices:   new Uint32Array(idxArr),
    };
}
