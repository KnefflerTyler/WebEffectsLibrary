/**
 * Chunk — a single hexagonal terrain tile.
 *
 * Lifecycle:
 *   const c = new Chunk(cx, cz, config, THREE, material);
 *   scene.add(c.mesh);
 *   // when out of view:
 *   c.dispose();
 *   scene.remove(c.mesh);
 */

import { buildHexChunk } from './hexGrid.js';

export class Chunk {
    /**
     * @param {number} cx        Chunk X grid index.
     * @param {number} cz        Chunk Z grid index.
     * @param {object} cfg       TERRAIN_CONFIG reference.
     * @param {object} THREE     Three.js module.
     * @param {object} material  Shared ShaderMaterial.
     */
    constructor(cx, cz, cfg, THREE, material) {
        this.cx  = cx;
        this.cz  = cz;
        this.key = `${cx},${cz}`;

        const { hexSize, chunkCols, chunkRows } = cfg;
        const SQRT3 = Math.sqrt(3);

        // World-space XZ origin of this chunk
        const ox = cx * chunkCols * SQRT3 * hexSize;
        const oz = cz * chunkRows * 1.5  * hexSize;

        const { positions, indices } = buildHexChunk(ox, oz, chunkCols, chunkRows, hexSize);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Compute bounds from the flat XZ geometry, then expand the bounding
        // sphere's radius by heightScale so the GPU-displaced Y vertices are
        // always contained — this lets Three.js correctly frustum-cull chunks.
        geometry.computeBoundingSphere();
        geometry.boundingSphere.radius += cfg.heightScale;

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = true;
    }

    dispose() {
        this.mesh.geometry.dispose();
    }
}
