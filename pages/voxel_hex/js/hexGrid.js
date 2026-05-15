/**
 * buildHexVoxelMesh — CPU-side hex voxel terrain mesh with true vertical walls.
 *
 * Pointy-top layout:  dx = sqrt(3)*hexSize,  dz = 1.5*hexSize
 * For each hex cell:
 *   • 6 top triangles (fan from centre, normal = 0,1,0)
 *   • vertical wall quads on each of the 6 edges where the geometric neighbour
 *     is lower (outward horizontal normal baked per-vertex)
 *
 * Neighbour height is sampled by evaluating the height function at the
 * neighbour's geometric centre — guaranteed to match what that chunk produces.
 *
 * @returns {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }}
 */

import { fbm } from './perlin.js';

const SQRT3 = Math.sqrt(3);

function sampleHeight(wx, wz, cfg) {
    const { noiseScale, octaves, persistence, lacunarity, heightScale, cellSize } = cfg;
    const cs  = (cellSize > 0 && isFinite(cellSize)) ? cellSize : 1;
    const raw = fbm(wx, wz, octaves, persistence, lacunarity, noiseScale);
    return Math.round(raw * heightScale / cs) * cs;
}

export function buildHexVoxelMesh(ox, oz, cols, rows, cfg) {
    const { hexSize } = cfg;
    const dx = SQRT3 * hexSize;   // centre-to-centre X step
    const dz = 1.5   * hexSize;   // centre-to-centre Z step

    const posArr  = [];
    const normArr = [];
    const idxArr  = [];

    function tri(ax,ay,az, bx,by,bz, cx,cy,cz, nx,ny,nz) {
        const i = posArr.length / 3;
        posArr.push(ax,ay,az, bx,by,bz, cx,cy,cz);
        normArr.push(nx,ny,nz, nx,ny,nz, nx,ny,nz);
        idxArr.push(i, i+1, i+2);
    }

    function quad(ax,ay,az, bx,by,bz, cx,cy,cz, dx2,dy,dz2, nx,ny,nz) {
        const i = posArr.length / 3;
        posArr.push(ax,ay,az, bx,by,bz, cx,cy,cz, dx2,dy,dz2);
        normArr.push(nx,ny,nz, nx,ny,nz, nx,ny,nz, nx,ny,nz);
        idxArr.push(i, i+1, i+2,   i, i+2, i+3);
    }

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // Hex centre in world space (pointy-top, odd rows shifted right 0.5*dx)
            const cx = ox + col * dx + (row & 1) * (dx * 0.5);
            const cz = oz + row * dz;
            const h  = sampleHeight(cx, cz, cfg);

            // Pre-compute the 6 corner positions at y=h
            const corners = [];
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i;
                corners.push({ x: cx + hexSize * Math.sin(a), z: cz - hexSize * Math.cos(a) });
            }

            // Top face — 6 CCW triangles fanning from centre (same winding as marching_hex)
            for (let i = 0; i < 6; i++) {
                const ci = corners[i], cj = corners[(i + 1) % 6];
                tri(cx, h, cz,   cj.x, h, cj.z,   ci.x, h, ci.z,   0, 1, 0);
            }

            // Walls — one quad per edge when neighbour is lower
            for (let i = 0; i < 6; i++) {
                // Outward normal for this edge (perpendicular bisector of the edge)
                const edgeAngle = (Math.PI / 3) * i + Math.PI / 6;
                const nx = Math.sin(edgeAngle);
                const nz = -Math.cos(edgeAngle);

                // Geometric neighbour centre (works across chunk boundaries since
                // height is deterministic from world position)
                const ncx = cx + SQRT3 * hexSize * Math.sin(edgeAngle);
                const ncz = cz - SQRT3 * hexSize * Math.cos(edgeAngle);
                const hN  = sampleHeight(ncx, ncz, cfg);

                if (hN < h) {
                    const ci = corners[i], cj = corners[(i + 1) % 6];
                    // CCW winding for outward horizontal normal (verified by cross-product):
                    // A=ci@h, B=cj@h, C=cj@hN, D=ci@hN  →  normal = (nz-component of edge, 0, ...)
                    quad(ci.x, h,  ci.z,
                         cj.x, h,  cj.z,
                         cj.x, hN, cj.z,
                         ci.x, hN, ci.z,
                         nx, 0, nz);
                }
            }
        }
    }

    return {
        positions: new Float32Array(posArr),
        normals:   new Float32Array(normArr),
        indices:   new Uint32Array(idxArr),
    };
}

