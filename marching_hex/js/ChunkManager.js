/**
 * ChunkManager — streams hex terrain chunks in/out based on camera XZ position.
 *
 * Each frame call:
 *   manager.update(cameraX, cameraZ);
 */

import { Chunk } from './Chunk.js';

export class ChunkManager {
    /**
     * @param {object} scene     Three.js Scene.
     * @param {object} cfg       TERRAIN_CONFIG reference.
     * @param {object} THREE     Three.js module.
     * @param {object} material  Shared ShaderMaterial.
     */
    constructor(scene, cfg, THREE, material) {
        this._scene    = scene;
        this._cfg      = cfg;
        this._THREE    = THREE;
        this._material = material;

        /** @type {Map<string, Chunk>} */
        this._chunks   = new Map();

        this._lastCX = null;
        this._lastCZ = null;
    }

    /**
     * Call every frame.  Only rebuilds when the camera crosses a chunk boundary.
     * @param {number} camX  Camera world X.
     * @param {number} camZ  Camera world Z.
     */
    update(camX, camZ) {
        const { hexSize, chunkCols, chunkRows, viewDistance } = this._cfg;
        const SQRT3 = Math.sqrt(3);

        // World footprint of one chunk
        const tileW = chunkCols * SQRT3 * hexSize;
        const tileH = chunkRows * 1.5  * hexSize;

        const cx = Math.floor(camX / tileW);
        const cz = Math.floor(camZ / tileH);

        if (cx === this._lastCX && cz === this._lastCZ) return;
        this._lastCX = cx;
        this._lastCZ = cz;

        // ── Determine which chunks should be loaded ────────────────────────
        const needed = new Set();
        const r = viewDistance;
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dz * dz > r * r) continue;
                needed.add(`${cx + dx},${cz + dz}`);
            }
        }

        // ── Unload distant chunks ──────────────────────────────────────────
        for (const [key, chunk] of this._chunks) {
            if (!needed.has(key)) {
                this._scene.remove(chunk.mesh);
                chunk.dispose();
                this._chunks.delete(key);
            }
        }

        // ── Load new chunks (nearest-first) ───────────────────────────────
        const toLoad = [...needed].filter(k => !this._chunks.has(k));
        toLoad.sort((a, b) => {
            const [ax, az] = a.split(',').map(Number);
            const [bx, bz] = b.split(',').map(Number);
            const da = (ax - cx) ** 2 + (az - cz) ** 2;
            const db = (bx - cx) ** 2 + (bz - cz) ** 2;
            return da - db;
        });

        for (const key of toLoad) {
            const [ncx, ncz] = key.split(',').map(Number);
            const chunk = new Chunk(ncx, ncz, this._cfg, this._THREE, this._material);
            this._scene.add(chunk.mesh);
            this._chunks.set(key, chunk);
        }
    }

    /** Remove all loaded chunks and release GPU memory. */
    disposeAll() {
        for (const chunk of this._chunks.values()) {
            this._scene.remove(chunk.mesh);
            chunk.dispose();
        }
        this._chunks.clear();
        this._lastCX = null;
        this._lastCZ = null;
    }

    get count() { return this._chunks.size; }
}
