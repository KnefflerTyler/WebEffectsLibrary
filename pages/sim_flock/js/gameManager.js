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