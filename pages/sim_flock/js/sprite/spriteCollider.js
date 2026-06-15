'use strict';

// SpriteCollider — attach one instance to a `Sprite` to provide
// collision detection and trigger events (`enter`, `stay`, `exit`).
// Simplified for performance: CIRCLE ONLY collisions with fast radius checks.
export default class SpriteCollider {
    constructor(sprite, options = {}) {
        this.sprite = sprite;

        // Always use circle collision (removed AABB support for performance)
        this.type = 'circle';

        // circle radius — prefer provided radius, otherwise derive from sprite size, fallback to 4
        const sW = Number(sprite.width) || 0;
        const sH = Number(sprite.height) || 0;
        const defaultRadius = Math.max(sW, sH) > 0 ? Math.max(sW, sH) / 2 : 4;
        this.radius = (options.radius !== undefined) ? options.radius : defaultRadius;

        // local offset from sprite position
        this.offsetX = options.offsetX || 0;
        this.offsetY = options.offsetY || 0;

        // callback lists
        this._callbacks = {
            enter: new Set(),
            stay: new Set(),
            exit: new Set(),
            collision: new Set(), // invoked when a pair is resolved; (other, impulseVec)
        };

        // previously intersecting colliders (by reference)
        this._prev = new Set();

        // resolution options (allow code that expects these fields)
        this.resolve = options.resolve !== undefined ? !!options.resolve : true;
        this.resolveStrength = options.resolveStrength ?? 400;
    }

    // Register callback: event = 'enter'|'stay'|'exit'
    on(event, cb) {
        if (this._callbacks[event]) this._callbacks[event].add(cb);
    }

    off(event, cb) {
        if (this._callbacks[event]) this._callbacks[event].delete(cb);
    }

    // Compute world-space position of this collider
    worldPos() {
        return {
            x: (this.sprite.x || 0) + this.offsetX,
            y: (this.sprite.y || 0) + this.offsetY,
        };
    }

    // Test intersection with another SpriteCollider (circle-only, fast)
    intersects(other) {
        if (!other) return false;
        const aPos = this.worldPos();
        const bPos = other.worldPos();

        // Simple circle-circle collision (no branching)
        const dx = aPos.x - bPos.x;
        const dy = aPos.y - bPos.y;
        const r = this.radius + (other.radius || 4);
        return dx * dx + dy * dy <= r * r;
    }

    // Check this collider against an iterable of other colliders and invoke triggers.
    // `others` should be an array or iterable of SpriteCollider instances.
    checkAgainst(others) {
        const now = new Set();

        for (const other of others) {
            if (!other || other === this) continue;
            const hit = this.intersects(other);
            if (hit) now.add(other);

            const was = this._prev.has(other);

            if (hit && !was) {
                for (const cb of this._callbacks.enter) cb(other, this);
            } else if (hit && was) {
                for (const cb of this._callbacks.stay) cb(other, this);
            } else if (!hit && was) {
                for (const cb of this._callbacks.exit) cb(other, this);
            }
        }

        // For any previous colliders not present in `now` (and not iterated because they were removed), fire exit
        for (const prev of this._prev) {
            if (!now.has(prev)) {
                for (const cb of this._callbacks.exit) cb(prev, this);
            }
        }

        this._prev = now;
    }

    // Convenience: update using the provided list (alias)
    update(others) { this.checkAgainst(others); }

    // Clear callback lists and previous state
    clear() {
        this._callbacks.enter.clear();
        this._callbacks.stay.clear();
        this._callbacks.exit.clear();
        this._callbacks.collision.clear();
        this._prev.clear();
    }
}