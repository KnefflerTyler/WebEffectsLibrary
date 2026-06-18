'use strict';

export class SpatialHashGrid {
    constructor(cellSize = 32) {
        this.cellSize = Math.max(1, cellSize);
        this.invCellSize = 1 / this.cellSize;

        this.cells = new Map();
        this.pairSet = new Set();
    }

    setCellSize(cellSize) {
        this.cellSize = Math.max(1, cellSize);
        this.invCellSize = 1 / this.cellSize;
    }

    clear() {
        this.cells.clear();
        this.pairSet.clear();
    }

    hashCell(cx, cy) {
        return ((cx * 73856093) ^ (cy * 19349663)) | 0;
    }

    cellCoord(value) {
        return Math.floor(value * this.invCellSize);
    }

    insert(sprite, bounds) {
        if (!sprite || !bounds) return;

        const minCX = this.cellCoord(bounds.minX);
        const maxCX = this.cellCoord(bounds.maxX);
        const minCY = this.cellCoord(bounds.minY);
        const maxCY = this.cellCoord(bounds.maxY);

        for (let cy = minCY; cy <= maxCY; cy++) {
            for (let cx = minCX; cx <= maxCX; cx++) {
                const key = this.hashCell(cx, cy);

                let bucket = this.cells.get(key);
                if (!bucket) {
                    bucket = [];
                    this.cells.set(key, bucket);
                }

                bucket.push(sprite);
            }
        }
    }

    build(sprites) {
        this.clear();

        for (let i = 0; i < sprites.length; i++) {
            const sprite = sprites[i];
            const collider = sprite?.collider;

            if (!sprite || !collider) continue;

            if (typeof collider.sync === 'function') {
                collider.sync();
            }

            if (typeof collider.getBounds !== 'function') continue;

            this.insert(sprite, collider.getBounds());
        }
    }

    forEachPair(callback) {
        this.pairSet.clear();

        for (const bucket of this.cells.values()) {
            const len = bucket.length;

            for (let i = 0; i < len; i++) {
                const a = bucket[i];
                if (!a?.collider) continue;

                for (let j = i + 1; j < len; j++) {
                    const b = bucket[j];

                    if (!b?.collider || a === b) continue;

                    const idA = a._flockId ?? 0;
                    const idB = b._flockId ?? 0;

                    if (idA === idB) continue;

                    const minId = idA < idB ? idA : idB;
                    const maxId = idA < idB ? idB : idA;
                    const pairKey = `${minId}:${maxId}`;

                    if (this.pairSet.has(pairKey)) continue;
                    this.pairSet.add(pairKey);

                    callback(a, b);
                }
            }
        }
    }
}

export default SpatialHashGrid;