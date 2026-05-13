import { buildHexVoxelMesh } from './hexGrid.js';

export class Chunk {
    constructor(cx, cz, cfg, THREE, material) {
        this.cx  = cx;
        this.cz  = cz;
        this.key = `${cx},${cz}`;

        const { hexSize, chunkCols, chunkRows } = cfg;
        const SQRT3 = Math.sqrt(3);

        const ox = cx * chunkCols * SQRT3 * hexSize;
        const oz = cz * chunkRows * 1.5  * hexSize;

        const { positions, normals, indices } = buildHexVoxelMesh(ox, oz, chunkCols, chunkRows, cfg);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal',   new THREE.BufferAttribute(normals,   3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Bounding sphere is exact — CPU mesh already has correct Y values.
        geometry.computeBoundingSphere();

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = true;
    }

    dispose() {
        this.mesh.geometry.dispose();
    }
}
