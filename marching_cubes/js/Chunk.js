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
     * @param {Function} scalarFn  (wx, wy, wz) → number.
     */
    constructor(cx, cz, cfg, THREE, material, scalarFn) {
        this.cx = cx;
        this.cz = cz;
        this.key = `${cx},${cz}`;

        const { chunkSize, cellSize } = cfg;

        // World-space origin of this chunk (XZ plane)
        const ox = cx * chunkSize * cellSize;
        const oz = cz * chunkSize * cellSize;

        // Build quad-mesh height field
        const { positions, normals, indices } = buildChunk(
            scalarFn,
            ox, oz,
            chunkSize,
            cellSize,
        );

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal',   new THREE.BufferAttribute(normals,   3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;   // chunk origin may be outside frustum

        // Optional wireframe overlay
        if (cfg.wireframe) {
            const wMat = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.08,
            });
            const wGeo = new THREE.WireframeGeometry(geometry);
            this.wire = new THREE.LineSegments(wGeo, wMat);
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
