/**
 * Chunk — a single terrain tile in the XZ plane.
 *
 * Lifecycle:
 *   const c = new Chunk(cx, cz, config, material, scalarFn);
 *   scene.add(c.mesh);
 *   // when out of view:
 *   c.dispose();
 *   scene.remove(c.mesh);
 */

import { buildChunk } from './marchingCubes.js';

export class Chunk {
    /**
     * @param {number}   cx        Chunk X grid index.
     * @param {number}   cz        Chunk Z grid index.
     * @param {object}   cfg       TERRAIN_CONFIG reference.
     * @param {object}   THREE     Three.js module.
     * @param {object}   material  Shared ShaderMaterial.
     */
    constructor(cx, cz, cfg, THREE, material) {
        this.cx = cx;
        this.cz = cz;
        this.key = `${cx},${cz}`;

        const { chunkSize, cellSize } = cfg;

        // World-space origin of this chunk (XZ plane)
        const ox = cx * chunkSize * cellSize;
        const oz = cz * chunkSize * cellSize;

        // Build flat XZ grid — vertex shader handles Y displacement
        const { positions, indices } = buildChunk(
            ox, oz,
            chunkSize,
            cellSize,
        );

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
