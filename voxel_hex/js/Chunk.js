import { buildHexChunk } from './hexGrid.js';

export class Chunk {
    constructor(cx, cz, cfg, THREE, material) {
        this.cx  = cx;
        this.cz  = cz;
        this.key = `${cx},${cz}`;

        const { hexSize, chunkCols, chunkRows } = cfg;
        const SQRT3 = Math.sqrt(3);

        const ox = cx * chunkCols * SQRT3 * hexSize;
        const oz = cz * chunkRows * 1.5  * hexSize;

        const { positions, indices } = buildHexChunk(ox, oz, chunkCols, chunkRows, hexSize);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Expand bounding sphere by heightScale to cover GPU-displaced Y range.
        geometry.computeBoundingSphere();
        geometry.boundingSphere.radius += cfg.heightScale;

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = true;
    }

    dispose() {
        this.mesh.geometry.dispose();
    }
}
