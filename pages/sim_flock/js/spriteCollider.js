'use strict';

// SpriteCollider — attach one instance to a `Sprite` to provide
// collision detection and trigger events (`enter`, `stay`, `exit`).
// The class only detects overlaps and invokes callbacks; it does
// not perform any collision response or behaviour.
export default class SpriteCollider {
    constructor(sprite, options = {}) {
        this.sprite = sprite;

        // shape: 'circle' or 'aabb'
        this.type = options.type || 'circle';

        // circle options — prefer provided radius, otherwise derive from sprite size, fallback to 4
        const sW = Number(sprite.width) || 0;
        const sH = Number(sprite.height) || 0;
        const defaultRadius = Math.max(sW, sH) > 0 ? Math.max(sW, sH) / 2 : 4;
        this.radius = (options.radius !== undefined) ? options.radius : defaultRadius;

        // aabb options (width/height centered on sprite)
        this.width = (options.width !== undefined) ? options.width : (sW > 0 ? sW : 8);
        this.height = (options.height !== undefined) ? options.height : (sH > 0 ? sH : 8);

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

        // resolution options
        this.resolve = options.resolve !== undefined ? !!options.resolve : true;
        this.resolveStrength = options.resolveStrength ?? 400; // applied as impulse multiplier
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

    // Test intersection with another SpriteCollider
    intersects(other) {
        if (!other) return false;
        const aPos = this.worldPos();
        const bPos = other.worldPos();

        // circle-circle
        if (this.type === 'circle' && other.type === 'circle') {
            const dx = aPos.x - bPos.x;
            const dy = aPos.y - bPos.y;
            const r = this.radius + other.radius;
            return dx * dx + dy * dy <= r * r;
        }

        // aabb-aabb
        if (this.type === 'aabb' && other.type === 'aabb') {
            const aLeft = aPos.x - this.width / 2;
            const aRight = aPos.x + this.width / 2;
            const aTop = aPos.y - this.height / 2;
            const aBottom = aPos.y + this.height / 2;

            const bLeft = bPos.x - other.width / 2;
            const bRight = bPos.x + other.width / 2;
            const bTop = bPos.y - other.height / 2;
            const bBottom = bPos.y + other.height / 2;

            return !(aRight < bLeft || aLeft > bRight || aBottom < bTop || aTop > bBottom);
        }

        // circle - aabb (both orders)
        let circle, aabb, cPos;
        if (this.type === 'circle' && other.type === 'aabb') {
            circle = this; aabb = other; cPos = aPos;
        } else if (this.type === 'aabb' && other.type === 'circle') {
            circle = other; aabb = this; cPos = bPos;
        }

        if (circle && aabb) {
            const aLeft = aPos.x - aabb.width / 2;
            const aRight = aPos.x + aabb.width / 2;
            const aTop = aPos.y - aabb.height / 2;
            const aBottom = aPos.y + aabb.height / 2;

            // closest point on AABB to circle center
            const closestX = Math.max(aLeft, Math.min(cPos.x, aRight));
            const closestY = Math.max(aTop, Math.min(cPos.y, aBottom));

            const dx = cPos.x - closestX;
            const dy = cPos.y - closestY;
            return dx * dx + dy * dy <= circle.radius * circle.radius;
        }

        // unknown types -> no collision
        return false;
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

    // Static: resolve pairwise collisions for an array of colliders.
    // Handles each unordered pair exactly once and applies position corrections
    // and velocity impulses to move sprites apart. `dt` is optional.
    static resolvePairs(colliders, dt = 1/60) {
        const n = colliders.length;
        for (let i = 0; i < n; i++) {
            const a = colliders[i];
            if (!a || !a.resolve) continue;
            for (let j = i + 1; j < n; j++) {
                const b = colliders[j];
                if (!b || !b.resolve) continue;
                if (!a.intersects(b)) continue;

                // Compute separation vector (approximate for mixed shapes)
                const apos = a.worldPos();
                const bpos = b.worldPos();
                let dx = apos.x - bpos.x;
                let dy = apos.y - bpos.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) {
                    // jitter to avoid divide by zero
                    dx = (Math.random() - 0.5) * 1e-3;
                    dy = (Math.random() - 0.5) * 1e-3;
                    dist = Math.sqrt(dx * dx + dy * dy) || 1e-3;
                }
                const nx = dx / dist;
                const ny = dy / dist;

                // Compute overlap amount depending on types; fall back to small push
                let overlap = 0;
                if (a.type === 'circle' && b.type === 'circle') {
                    overlap = (a.radius + b.radius) - dist;
                } else {
                    // approximate overlap by projecting onto axis between centers
                    // compute minimal bounding extents along axis
                    const aExtent = Math.max(a.width || 0, a.height || 0, a.radius || 0);
                    const bExtent = Math.max(b.width || 0, b.height || 0, b.radius || 0);
                    overlap = (aExtent + bExtent) - dist;
                }

                if (overlap <= 0) continue;

                // Positional correction: move each sprite half the overlap
                const correction = overlap * 0.5;
                a.sprite.x += nx * correction;
                a.sprite.y += ny * correction;
                b.sprite.x -= nx * correction;
                b.sprite.y -= ny * correction;

                // Velocity impulse: push sprites away proportional to resolveStrength
                const combinedStrength = (a.resolveStrength + b.resolveStrength) * 0.5;
                const impulse = combinedStrength * overlap * (dt || 1/60);
                // Apply opposite impulses
                if (typeof a.sprite.vx === 'number') a.sprite.vx += nx * impulse;
                if (typeof a.sprite.vy === 'number') a.sprite.vy += ny * impulse;
                if (typeof b.sprite.vx === 'number') b.sprite.vx -= nx * impulse;
                if (typeof b.sprite.vy === 'number') b.sprite.vy -= ny * impulse;

                // Notify collision listeners with impulse vector applied to each
                const aImpulse = { x: nx * impulse, y: ny * impulse };
                const bImpulse = { x: -nx * impulse, y: -ny * impulse };
                for (const cb of a._callbacks.collision) cb(b, aImpulse);
                for (const cb of b._callbacks.collision) cb(a, bImpulse);
            }
        }
    }

    // Clear callback lists and previous state
    clear() {
        this._callbacks.enter.clear();
        this._callbacks.stay.clear();
        this._callbacks.exit.clear();
        this._callbacks.collision.clear();
        this._prev.clear();
    }
}