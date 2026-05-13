/**
 * Chunk — one voxel terrain tile.
 *
 * Geometry is a flat XZ grid built on the CPU; the GPU vertex shader handles
 * all Y displacement (Perlin FBM + voxel quantization).
 */

import { buildFlatGrid } from './voxelChunk.js';

export class Chunk {
    constructor(cx, cz, cfg, THREE, material) {
        this.cx  = cx;
        this.cz  = cz;
        this.key = `${cx},${cz}`;

        const { cellSize, chunkSize } = cfg;

        const ox = cx * chunkSize * cellSize;
        const oz = cz * chunkSize * cellSize;

        const { positions, indices } = buildFlatGrid(ox, oz, chunkSize, cellSize);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Expand bounding sphere to cover the GPU-displaced Y range so
        // frustum culling remains correct (same technique as marching_cubes).
        geometry.computeBoundingSphere();
        geometry.boundingSphere.radius += cfg.heightScale;

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = true;
    }

    dispose() {
        this.mesh.geometry.dispose();
    }
}
