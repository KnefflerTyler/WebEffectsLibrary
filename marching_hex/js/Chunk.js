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

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;   // chunk origin may be outside frustum

        if (cfg.wireframe) {
            const wMat = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.08,
            });
            const wGeo = new THREE.WireframeGeometry(geometry);
            this.wire  = new THREE.LineSegments(wGeo, wMat);
            this.mesh.add(this.wire);
        }
    }

    dispose() {
        this.mesh.geometry.dispose();
        if (this.wire) {
            this.wire.geometry.dispose();
            this.wire.material.dispose();
        }
    }
}
