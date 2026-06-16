"use strict";

// GameManager - High-performance sprite orchestration for many entities
//
// Important collision architecture:
// - Sprite.update(dt) only updates animation/movement.
// - Collision resolution happens globally after movement.
// - Every collider pair is resolved once per frame.

export default class GameManager {
    constructor({
        sprites = [],
        target = null,
        flock = null,
        weightBudget = 50,
        maxQueueAge = 0.01,
        useWeightedQueue = true,
        distanceCulling = true,
        maxUpdateDistance = 2000,
        distantUpdateInterval = 5,
        collisions = true,
        collisionIterations = 1,
    } = {}) {
        this.sprites = sprites;
        this.target = target || { x: 0, y: 0 };
        this.flock = flock || null;

        this.weightBudget = weightBudget;
        this.maxQueueAge = maxQueueAge;

        this.useWeightedQueue = useWeightedQueue;

        this.distanceCulling = distanceCulling;
        this.maxUpdateDistance = maxUpdateDistance;
        this.distantUpdateInterval = distantUpdateInterval;

        this.collisions = collisions;

        // More than 1 can help packed sprites separate better.
        // Keep at 1 for performance with many sprites.
        this.collisionIterations = collisionIterations;

        this.basePriority = (s, g) => {
            const tx = g.target.x ?? 0;
            const ty = g.target.y ?? 0;

            const dx = (s.x ?? 0) - tx;
            const dy = (s.y ?? 0) - ty;

            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            return 1 / (1 + dist);
        };

        this.costFunction = () => 1;

        this.weightFunction = (s, g, now) => {
            const base = g.basePriority(s, g) || 0;
            const last = s._lastUpdateTime || 0;
            const age = Math.max(0, now - last);

            const norm = g.maxQueueAge > 0
                ? age / g.maxQueueAge
                : age;

            const ageFactor = Math.pow(1 + norm, 4);

            return base * ageFactor;
        };
    }

    getSpritesList() {
        return this.flock?.sprites || this.sprites || [];
    }

    setSprites(arr) {
        this.sprites = arr || [];

        const now = performance.now() / 1000;

        for (const s of this.sprites) {
            s._lastUpdateTime = s._lastUpdateTime || now;
        }
    }

    setFlock(flock) {
        this.flock = flock || null;

        const now = performance.now() / 1000;

        for (const s of this.getSpritesList()) {
            s._lastUpdateTime = s._lastUpdateTime || now;
        }
    }

    setTarget(x, y) {
        this.target.x = x;
        this.target.y = y;

        if (this.flock && typeof this.flock.setTarget === "function") {
            this.flock.setTarget(x, y);
        }
    }

    update(dt) {
        const now = performance.now() / 1000;
        const spritesList = this.getSpritesList();

        if (!spritesList.length) return;

        // Keep flock target synced with manager target.
        if (this.flock) {
            this.flock.target.x = this.target.x;
            this.flock.target.y = this.target.y;
        }

        if (this.useWeightedQueue) {
            this.updateWeighted(dt, now, spritesList);
        } else {
            this.updateAll(dt, now, spritesList);
        }

        // IMPORTANT:
        // Resolve collisions globally after all movement.
        // This replaces the old s.update(spriteDt, localColliders) flow.
        if (this.collisions) {
            this.resolveCollisions(spritesList);
            this.updateCollisionEvents(spritesList);
        }
    }

    updateAll(dt, now, spritesList) {
        const spriteDt = Math.min(dt, 0.033);

        for (const s of spritesList) {
            if (typeof s.update !== "function") continue;

            if (this.flock && typeof this.flock.applyForces === "function") {
                this.flock.applyForces(s, spriteDt);
            }

            s.update(spriteDt);
            s._lastUpdateTime = now;
        }
    }

    updateWeighted(dt, now, spritesList) {
        const queue = [];

        for (const s of spritesList) {
            if (typeof s.update !== "function") continue;

            if (this.shouldSkipByDistance(s, now)) {
                continue;
            }

            const last = s._lastUpdateTime || 0;
            const age = Math.max(0, now - last);

            queue.push({
                sprite: s,
                weight: this.weightFunction(s, this, now),
                age,
            });
        }

        queue.sort((a, b) => b.weight - a.weight);

        let budget = this.weightBudget;
        const maxOverspend = Math.max(0, this.weightBudget);

        for (const entry of queue) {
            const s = entry.sprite;
            const cost = Math.max(0.0001, this.costFunction(s));

            if (cost > budget) {
                if (entry.age < this.maxQueueAge) {
                    continue;
                }

                if (budget - cost < -maxOverspend) {
                    continue;
                }
            }

            const spriteDtRaw = Math.max(entry.age, dt);

            // Cap to avoid unstable physics jumps.
            const spriteDt = Math.min(spriteDtRaw, 0.033);

            if (this.flock && typeof this.flock.applyForces === "function") {
                this.flock.applyForces(s, spriteDt);
            }

            try {
                // New Sprite.update signature:
                // Do NOT pass localColliders here.
                s.update(spriteDt);
            } catch (e) {
                console.error("[Game] sprite.update threw", e);
            }

            s._lastUpdateTime = now;
            budget -= cost;

            if (budget <= -maxOverspend) {
                break;
            }
        }
    }

    shouldSkipByDistance(sprite, now) {
        if (!this.distanceCulling) return false;

        const dx = (sprite.x ?? 0) - this.target.x;
        const dy = (sprite.y ?? 0) - this.target.y;

        const distSq = dx * dx + dy * dy;
        const maxDistSq = this.maxUpdateDistance * this.maxUpdateDistance;

        if (distSq <= maxDistSq) return false;

        const framesSinceUpdate = Math.floor(
            (now - (sprite._lastUpdateTime || 0)) * 60
        );

        return framesSinceUpdate < this.distantUpdateInterval;
    }

    getColliders(spritesList = this.getSpritesList()) {
        return spritesList
            .map(sprite => sprite.collider)
            .filter(Boolean);
    }

    resolveCollisions(spritesList = this.getSpritesList()) {
        const colliders = this.getColliders(spritesList);

        if (colliders.length <= 1) return;

        for (let iteration = 0; iteration < this.collisionIterations; iteration++) {
            for (let i = 0; i < colliders.length; i++) {
                for (let j = i + 1; j < colliders.length; j++) {
                    const a = colliders[i];
                    const b = colliders[j];

                    if (!a || !b) continue;
                    if (typeof a.resolveCollision !== "function") continue;

                    a.resolveCollision(b);
                }
            }
        }
    }

    updateCollisionEvents(spritesList = this.getSpritesList()) {
        const colliders = this.getColliders(spritesList);

        for (const collider of colliders) {
            if (typeof collider.checkAgainst === "function") {
                collider.checkAgainst(colliders);
            }
        }
    }

    draw(ctx) {
        const spritesList = this.getSpritesList();

        for (const sprite of spritesList) {
            if (typeof sprite.draw === "function") {
                sprite.draw(ctx);
            }
        }
    }

    debugColliders() {
        const spritesList = this.getSpritesList();
        const colliders = this.getColliders(spritesList);

        console.log("[GameManager] sprites:", spritesList.length);
        console.log("[GameManager] colliders:", colliders.length);

        if (colliders[0]) {
            console.log("[GameManager] first collider:", {
                type: colliders[0].type,
                radius: colliders[0].radius,
                halfWidth: colliders[0].halfWidth,
                halfHeight: colliders[0].halfHeight,
                resolve: colliders[0].resolve,
                static: colliders[0].static,
            });
        }
    }
}