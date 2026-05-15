/**
 * buildVoxelMesh — CPU-side voxel terrain mesh with true vertical walls.
 *
 * Evaluates Perlin fBm on the CPU, quantizes heights to cfg.cellSize steps,
 * then emits:
 *   • one horizontal top quad per cell  (normal = 0,1,0)
 *   • vertical wall quads wherever a neighbour is lower (normals ±X / ±Z)
 *
 * Normals are baked per-vertex so the GPU shader is a simple MVP pass-through.
 *
 * Winding is CCW with face normal pointing outward (Three.js FrontSide default).
 *
 * @returns {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }}
 */

import { fbm } from './perlin.js';

function sampleHeight(wx, wz, cfg) {
    const { noiseScale, octaves, persistence, lacunarity, heightScale, cellSize } = cfg;
    const cs  = (cellSize > 0 && isFinite(cellSize)) ? cellSize : 1;
    const raw = fbm(wx, wz, octaves, persistence, lacunarity, noiseScale);
    return Math.round(raw * heightScale / cs) * cs;
}

export function buildVoxelMesh(ox, oz, chunkSize, cfg) {
    const { cellSize } = cfg;
    const S = chunkSize;

    // Height map covering cells (gx, gz) ∈ [-1, S] for wall neighbour lookups.
    const W = S + 2;
    const heights = new Float32Array(W * W);
    for (let z = 0; z < W; z++) {
        for (let x = 0; x < W; x++) {
            // Sample at the cell centre so each cell has one canonical height.
            const wx = ox + (x - 1) * cellSize + cellSize * 0.5;
            const wz = oz + (z - 1) * cellSize + cellSize * 0.5;
            heights[z * W + x] = sampleHeight(wx, wz, cfg);
        }
    }

    function h(gx, gz) { return heights[(gz + 1) * W + (gx + 1)]; }

    const posArr  = [];
    const normArr = [];
    const idxArr  = [];

    // Emit one quad (2 triangles, CCW for outward normal n).
    function quad(ax, ay, az,  bx, by, bz,  cx, cy, cz,  dx, dy, dz,  nx, ny, nz) {
        const i = posArr.length / 3;
        posArr.push(ax, ay, az,  bx, by, bz,  cx, cy, cz,  dx, dy, dz);
        normArr.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
        idxArr.push(i, i+1, i+2,   i, i+2, i+3);
    }

    for (let gz = 0; gz < S; gz++) {
        for (let gx = 0; gx < S; gx++) {
            const ht = h(gx, gz);
            const x0 = ox + gx * cellSize,  x1 = x0 + cellSize;
            const z0 = oz + gz * cellSize,  z1 = z0 + cellSize;

            // Top face — normal (0,1,0)
            quad(x0,ht,z0,  x0,ht,z1,  x1,ht,z1,  x1,ht,z0,   0,1,0);

            // North wall (−Z face) — normal (0,0,−1)
            const hN = h(gx, gz - 1);
            if (hN < ht) quad(x0,ht,z0, x1,ht,z0, x1,hN,z0, x0,hN,z0,  0,0,-1);

            // South wall (+Z face) — normal (0,0,+1)
            const hS = h(gx, gz + 1);
            if (hS < ht) quad(x1,ht,z1, x0,ht,z1, x0,hS,z1, x1,hS,z1,  0,0,1);

            // West wall (−X face) — normal (−1,0,0)
            const hW = h(gx - 1, gz);
            if (hW < ht) quad(x0,hW,z0, x0,hW,z1, x0,ht,z1, x0,ht,z0,  -1,0,0);

            // East wall (+X face) — normal (+1,0,0)
            const hE = h(gx + 1, gz);
            if (hE < ht) quad(x1,hE,z1, x1,hE,z0, x1,ht,z0, x1,ht,z1,  1,0,0);
        }
    }

    return {
        positions: new Float32Array(posArr),
        normals:   new Float32Array(normArr),
        indices:   new Uint32Array(idxArr),
    };
}

