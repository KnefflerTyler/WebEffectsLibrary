/**
 * ChunkManager — streams terrain chunks in and out of the scene based on the
 * camera's XZ position and the configured view distance.
 *
 * Each frame call:
 *   manager.update(cameraX, cameraZ);
 */

import { Chunk } from './Chunk.js';

export class ChunkManager {
    /**
     * @param {object}   scene     Three.js Scene.
     * @param {object}   cfg       TERRAIN_CONFIG reference.
     * @param {object}   THREE     Three.js module.
     * @param {object}   material  Shared ShaderMaterial (all chunks share it).
     * @param {Function} scalarFn  (wx, wy, wz) → number.
     */
    constructor(scene, cfg, THREE, material, scalarFn) {
        this._scene    = scene;
        this._cfg      = cfg;
        this._THREE    = THREE;
        this._material = material;
        this._scalar   = scalarFn;

        /** @type {Map<string, Chunk>} */
        this._chunks   = new Map();

        // Track the last chunk-grid cell the camera was in so we only
        // re-evaluate the load set when it actually changes.
        this._lastCX = null;
        this._lastCZ = null;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Call every frame.  Only rebuilds the chunk set when the camera moves to
     * a new chunk cell, keeping per-frame cost near zero when standing still.
     *
     * @param {number} camX  Camera world X.
     * @param {number} camZ  Camera world Z.
     */
    update(camX, camZ) {
        const { chunkSize, cellSize, viewDistance } = this._cfg;
        const tileW = chunkSize * cellSize;

        const cx = Math.floor(camX / tileW);
        const cz = Math.floor(camZ / tileW);

        if (cx === this._lastCX && cz === this._lastCZ) return;
        this._lastCX = cx;
        this._lastCZ = cz;

        // ── Determine which chunks should be loaded ────────────────────────
        const needed = new Set();
        const r = viewDistance;
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                // Circular view distance (optional — comment out for square)
                if (dx * dx + dz * dz > r * r) continue;
                needed.add(`${cx + dx},${cz + dz}`);
            }
        }

        // ── Unload chunks that left the view distance ──────────────────────
        for (const [key, chunk] of this._chunks) {
            if (!needed.has(key)) {
                this._scene.remove(chunk.mesh);
                chunk.dispose();
                this._chunks.delete(key);
            }
        }

        // ── Load new chunks (sorted nearest-first for best perceived latency)─
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
            const chunk = new Chunk(
                ncx, ncz,
                this._cfg,
                this._THREE,
                this._material,
                this._scalar,
            );
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

    /** Number of currently loaded chunks (useful for debug overlay). */
    get count() { return this._chunks.size; }
}
