'use strict';

import SpatialHashGrid from './spatialHashGrid.js';

export class CollisionWorld {
    constructor(options = {}) {
        this.grid = new SpatialHashGrid(options.gridCellSize ?? 32);

        this.iterations = options.iterations ?? 8;
        this.collisionSlop = options.collisionSlop ?? 0;
        this.contactDamping = options.contactDamping ?? 0.55;
        this.collisionEvents = options.collisionEvents ?? false;
    }

    configure(options = {}) {
        if (options.gridCellSize !== undefined) {
            this.grid.setCellSize(options.gridCellSize);
        }

        if (options.iterations !== undefined) {
            this.iterations = options.iterations;
        }

        if (options.collisionSlop !== undefined) {
            this.collisionSlop = options.collisionSlop;
        }

        if (options.contactDamping !== undefined) {
            this.contactDamping = options.contactDamping;
        }

        if (options.collisionEvents !== undefined) {
            this.collisionEvents = options.collisionEvents;
        }
    }

    syncAll(sprites) {
        for (let i = 0; i < sprites.length; i++) {
            const collider = sprites[i]?.collider;

            if (collider && typeof collider.sync === 'function') {
                collider.sync();
            }
        }
    }

    resolve(sprites) {
        if (!sprites || sprites.length <= 1) return;

        this.syncAll(sprites);

        for (let iteration = 0; iteration < this.iterations; iteration++) {
            this.grid.build(sprites);

            this.grid.forEachPair((a, b) => {
                const ca = a.collider;
                const cb = b.collider;

                if (!ca || !cb) return;
                if (typeof ca.resolveCollision !== 'function') return;

                ca.resolveCollision(cb, {
                    collisionSlop: this.collisionSlop,
                    contactDamping: this.contactDamping
                });
            });

            this.syncAll(sprites);
        }

        if (this.collisionEvents) {
            this.updateEvents(sprites);
        }
    }

    updateEvents(sprites) {
        this.grid.build(sprites);

        this.grid.forEachPair((a, b) => {
            const ca = a.collider;
            const cb = b.collider;

            if (!ca || !cb) return;

            if (typeof ca.trackAgainst === 'function') {
                ca.trackAgainst(cb);
            }

            if (typeof cb.trackAgainst === 'function') {
                cb.trackAgainst(ca);
            }
        });

        for (let i = 0; i < sprites.length; i++) {
            const collider = sprites[i]?.collider;

            if (collider && typeof collider.finishEventFrame === 'function') {
                collider.finishEventFrame();
            }
        }
    }
}

export default CollisionWorld;