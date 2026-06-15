'use strict';

// SpriteCollider — attach one instance to a `Sprite` to provide
// collision detection and trigger events (`enter`, `stay`, `exit`).
// Supports 'circle' and 'square' (AABB) collision types with optimized intersection tests.
export default class SpriteCollider {
    constructor(sprite, options = {}) {
        this.sprite = sprite;

        // Support both 'circle' and 'square' collision types
        this.type = options.type || 'circle';

        // circle radius — prefer provided radius, otherwise derive from sprite size, fallback to 4
        const sW = Number(sprite.width) || 0;
        const sH = Number(sprite.height) || 0;
        
        if (this.type === 'circle') {
            const defaultRadius = Math.max(sW, sH) > 0 ? Math.max(sW, sH) / 2 : 4;
            this.radius = (options.radius !== undefined) ? options.radius : defaultRadius;
        } else if (this.type === 'square') {
            // square dimensions (half-widths for easier collision detection)
            this.halfWidth = (options.width !== undefined) ? options.width / 2 : (sW > 0 ? sW / 2 : 4);
            this.halfHeight = (options.height !== undefined) ? options.height / 2 : (sH > 0 ? sH / 2 : 4);
            // Store radius for distance checks (diagonal of the square)
            this.radius = Math.sqrt(this.halfWidth * this.halfWidth + this.halfHeight * this.halfHeight);
        }

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

    // Test intersection with another SpriteCollider (supports circle and square)
    intersects(other) {
        if (!other) return false;
        const aPos = this.worldPos();
        const bPos = other.worldPos();

        // Circle-circle collision
        if (this.type === 'circle' && other.type === 'circle') {
            const dx = aPos.x - bPos.x;
            const dy = aPos.y - bPos.y;
            const r = this.radius + (other.radius || 4);
            return dx * dx + dy * dy <= r * r;
        }

        // Square-square collision (AABB)
        if (this.type === 'square' && other.type === 'square') {
            return Math.abs(aPos.x - bPos.x) <= (this.halfWidth + other.halfWidth) &&
                   Math.abs(aPos.y - bPos.y) <= (this.halfHeight + other.halfHeight);
        }

        // Circle-square collision
        const circle = this.type === 'circle' ? this : other;
        const square = this.type === 'square' ? this : other;
        const cPos = this.type === 'circle' ? aPos : bPos;
        const sPos = this.type === 'square' ? aPos : bPos;

        // Find closest point on square to circle center
        const closestX = Math.max(sPos.x - square.halfWidth, Math.min(cPos.x, sPos.x + square.halfWidth));
        const closestY = Math.max(sPos.y - square.halfHeight, Math.min(cPos.y, sPos.y + square.halfHeight));

        // Check if closest point is within circle radius
        const dx = cPos.x - closestX;
        const dy = cPos.y - closestY;
        return dx * dx + dy * dy <= circle.radius * circle.radius;
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