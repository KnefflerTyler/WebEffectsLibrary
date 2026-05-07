/**
 * SlabManager — streaming XY-plane slabs of grid points.
 *
 * Each "slab" is a THREE.Points object containing one full XY plane of
 * points at a fixed world-space Z value. Slabs are created ahead of the
 * camera and despawned once they pass behind it, keeping memory bounded.
 */
export class SlabManager {
    /**
     * @param {object} THREE            - The Three.js namespace
     * @param {THREE.Scene}    scene    - Scene to add / remove slabs from
     * @param {THREE.Material} material - Shared point material
     * @param {object} config
     * @param {number}   config.spacing     - World-unit gap between grid points
     * @param {number}   config.xyExtent    - Half-width of each slab in grid steps
     * @param {number}   config.numSlabs    - Slabs to keep ahead of camera
     * @param {number}   config.behindSlabs - Slabs to keep alive behind camera
     * @param {number[]} [config.pointMask] - Repeating 0/1 sequence applied L→R top→bottom
     *                                        to each slab; 0 = omit point, 1 = include it.
     *                                        Defaults to [0,1,0,1,0,0,1,0,1].
     */
    constructor(THREE, scene, material, { spacing, xyExtent, numSlabs, behindSlabs,
                                         pointMask = [0,1,0,1,0,0,1,0,1] }) {
        this._THREE       = THREE;
        this._scene       = scene;
        this._material    = material;
        this._spacing     = spacing;
        this._xyExtent    = xyExtent;
        this._numSlabs    = numSlabs;
        this._behindSlabs = behindSlabs;
        this._pointMask   = pointMask;
        this._maskWidth   = xyExtent * 2 + 1;

        /** @type {Map<number, THREE.Points>} */
        this.slabs = new Map();

        /**
         * Returns true if the grid point (gx, gy, zIdx) is included by the mask.
         * The mask is treated as a single 1-D sequence tiling across all points
         * in the order: z-slab → row (top→bottom) → col (left→right).
         * @param {number} gx
         * @param {number} gy
         * @param {number} zIdx
         */
        this.isPointValid = (gx, gy, zIdx) => {
            const w   = this._maskWidth;
            const row = xyExtent - gy;        // top→bottom row index
            const col = gx + xyExtent;        // left→right col index
            const global = zIdx * w * w + row * w + col;
            // Use positive modulo so negative zIdx values still work
            const mi = ((global % pointMask.length) + pointMask.length) % pointMask.length;
            return pointMask[mi] !== 0;
        };

        this._currentMin  = null;
        this._currentMax  = null;
        this._resetPeriod = numSlabs * spacing;
    }

    // -------------------------------------------------------------------------
    // Private helpers

    _createSlab(zIdx) {
        if (this.slabs.has(zIdx)) return;

        const { _THREE: THREE, _scene: scene, _material: material,
                _spacing: spacing, _xyExtent: xyExtent } = this;

        const z = zIdx * spacing;
        const positions = [];
        const mask  = this._pointMask;
        const mLen  = mask.length;
        const width = this._maskWidth;
        for (let row = 0; row < width; row++) {
            const y = xyExtent - row;
            for (let col = 0; col < width; col++) {
                const x = col - xyExtent;
                const global = zIdx * width * width + row * width + col;
                const mi = ((global % mLen) + mLen) % mLen;
                if (mask[mi] === 0) continue;
                positions.push(x * spacing, y * spacing, z);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const pts = new THREE.Points(geo, material);
        scene.add(pts);
        this.slabs.set(zIdx, pts);
    }

    _removeSlab(zIdx) {
        const pts = this.slabs.get(zIdx);
        if (!pts) return;
        this._scene.remove(pts);
        pts.geometry.dispose();
        this.slabs.delete(zIdx);
    }

    // -------------------------------------------------------------------------
    // Public API

    /**
     * Spawn / despawn slabs to keep a window of slabs centred on the camera.
     * Call once per frame after moving the camera.
     * @param {THREE.Camera} camera
     */
    update(camera) {
        const { _spacing: spacing, _numSlabs: numSlabs, _behindSlabs: behindSlabs } = this;

        const camZIdx    = Math.floor(camera.position.z / spacing);
        const newMinZIdx = camZIdx - numSlabs;    // furthest slab ahead
        const newMaxZIdx = camZIdx + behindSlabs; // buffer behind camera

        if (this._currentMin === null) {
            for (let z = newMinZIdx; z <= newMaxZIdx; z++) this._createSlab(z);
        } else {
            for (let z = newMinZIdx; z < this._currentMin; z++) this._createSlab(z);
            for (let z = newMaxZIdx + 1; z <= this._currentMax; z++) this._removeSlab(z);
            for (let z = this._currentMax + 1; z <= newMaxZIdx; z++) this._createSlab(z);
            for (let z = this._currentMin; z < newMinZIdx; z++) this._removeSlab(z);
        }

        this._currentMin = newMinZIdx;
        this._currentMax = newMaxZIdx;
    }

    /**
     * Shift camera and all live slabs back along Z by one full period to prevent
     * floating-point precision loss over long flight times.
     * Call once per frame before update().
     * @param {THREE.Camera} camera
     */
    maybeResetOrigin(camera) {
        if (camera.position.z > -this._resetPeriod) return;

        const { _resetPeriod: resetPeriod, _numSlabs: numSlabs } = this;

        camera.position.z += resetPeriod;
        this._material.uniforms.uCameraZ.value = camera.position.z;

        const shiftIdx = numSlabs;
        const rebuilt  = new Map();
        for (const [zIdx, pts] of this.slabs) {
            pts.position.z += resetPeriod;
            rebuilt.set(zIdx + shiftIdx, pts);
        }
        this.slabs.clear();
        for (const [k, v] of rebuilt) this.slabs.set(k, v);

        if (this._currentMin !== null) this._currentMin += shiftIdx;
        if (this._currentMax !== null) this._currentMax += shiftIdx;
    }

    /** Remove all slabs and dispose their geometries. */
    dispose() {
        for (const zIdx of [...this.slabs.keys()]) this._removeSlab(zIdx);
    }
}
