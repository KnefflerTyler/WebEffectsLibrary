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
    } = {}) {
        this.sprites = sprites;
        this.target = target || { x: 0, y: 0 };
        this.flock = flock || null;

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

        this.flock.update(dt);
    }
}