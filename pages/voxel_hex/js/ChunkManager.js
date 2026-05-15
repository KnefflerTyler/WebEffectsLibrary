import { Chunk } from './Chunk.js';

// Maximum chunks to build per animation frame.  Keeps frame time smooth
// by spreading the geometry-build cost across multiple frames.
const CHUNKS_PER_FRAME = 2;

export class ChunkManager {
    constructor(scene, cfg, THREE, material) {
        this._scene     = scene;
        this._cfg       = cfg;
        this._THREE     = THREE;
        this._material  = material;
        this._chunks    = new Map();
        this._lastCX    = null;
        this._lastCZ    = null;
        this._loadQueue = [];
    }

    update(camX, camZ) {
        const { hexSize, chunkCols, chunkRows, viewDistance } = this._cfg;
        const SQRT3 = Math.sqrt(3);

        const tileW = chunkCols * SQRT3 * hexSize;
        const tileH = chunkRows * 1.5  * hexSize;

        const cx = Math.floor(camX / tileW);
        const cz = Math.floor(camZ / tileH);

        // Rebuild the queue whenever the camera crosses a chunk boundary.
        if (cx !== this._lastCX || cz !== this._lastCZ) {
            this._lastCX = cx;
            this._lastCZ = cz;

            const needed = new Set();
            const r = viewDistance;
            for (let dz = -r; dz <= r; dz++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dz * dz > r * r) continue;
                    needed.add(`${cx + dx},${cz + dz}`);
                }
            }

            for (const [key, chunk] of this._chunks) {
                if (!needed.has(key)) {
                    this._scene.remove(chunk.mesh);
                    chunk.dispose();
                    this._chunks.delete(key);
                }
            }

            const toLoad = [...needed].filter(k => !this._chunks.has(k));
            toLoad.sort((a, b) => {
                const [ax, az] = a.split(',').map(Number);
                const [bx, bz] = b.split(',').map(Number);
                return ((ax - cx) ** 2 + (az - cz) ** 2) - ((bx - cx) ** 2 + (bz - cz) ** 2);
            });
            this._loadQueue = toLoad;
        }

        // Drain a small batch from the queue each frame.
        const batch = Math.min(this._cfg.chunksPerFrame ?? CHUNKS_PER_FRAME, this._loadQueue.length);
        for (let i = 0; i < batch; i++) {
            const key = this._loadQueue.shift();
            if (this._chunks.has(key)) continue;
            const [ncx, ncz] = key.split(',').map(Number);
            const chunk = new Chunk(ncx, ncz, this._cfg, this._THREE, this._material);
            this._scene.add(chunk.mesh);
            this._chunks.set(key, chunk);
        }
    }

    disposeAll() {
        for (const chunk of this._chunks.values()) {
            this._scene.remove(chunk.mesh);
            chunk.dispose();
        }
        this._chunks.clear();
        this._loadQueue = [];
        this._lastCX    = null;
        this._lastCZ    = null;
    }

    get count() { return this._chunks.size; }
}
