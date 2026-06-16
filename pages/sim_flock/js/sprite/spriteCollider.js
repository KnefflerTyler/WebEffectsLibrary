'use strict';

// SpriteCollider — attach one instance to a `Sprite` to provide
// collision detection and trigger events (`enter`, `stay`, `exit`).
// Supports 'circle' and 'square' AABB collision types.
export default class SpriteCollider {
    constructor(sprite, options = {}) {
        this.sprite = sprite;

        // 'circle' or 'square'
        this.type = options.type || 'circle';

        const sW = Number(sprite.width) || 0;
        const sH = Number(sprite.height) || 0;

        if (this.type === 'circle') {
            const defaultRadius = Math.max(sW, sH) > 0
                ? Math.max(sW, sH) / 2
                : 4;

            this.radius = options.radius !== undefined
                ? options.radius
                : defaultRadius;
        } else if (this.type === 'square') {
            this.halfWidth = options.width !== undefined
                ? options.width / 2
                : sW > 0
                    ? sW / 2
                    : 4;

            this.halfHeight = options.height !== undefined
                ? options.height / 2
                : sH > 0
                    ? sH / 2
                    : 4;

            // Useful for broad-phase checks or fallback behavior
            this.radius = Math.sqrt(
                this.halfWidth * this.halfWidth +
                this.halfHeight * this.halfHeight
            );
        } else {
            console.warn(`Unknown collider type "${this.type}", falling back to circle.`);

            this.type = 'circle';

            const defaultRadius = Math.max(sW, sH) > 0
                ? Math.max(sW, sH) / 2
                : 4;

            this.radius = options.radius !== undefined
                ? options.radius
                : defaultRadius;
        }

        // Local offset from sprite position
        this.offsetX = options.offsetX || 0;
        this.offsetY = options.offsetY || 0;

        // Whether this collider should physically push away from collisions
        this.resolve = options.resolve !== undefined ? !!options.resolve : true;

        // Whether this collider is immovable/static.
        // Example: walls should usually be static.
        this.static = options.static !== undefined ? !!options.static : false;

        // Optional multiplier for physical push
        this.resolveStrength = options.resolveStrength ?? 1;

        this._callbacks = {
            enter: new Set(),
            stay: new Set(),
            exit: new Set(),
            collision: new Set(),
        };

        this._prev = new Set();
    }

    on(event, cb) {
        if (this._callbacks[event]) {
            this._callbacks[event].add(cb);
        }
    }

    off(event, cb) {
        if (this._callbacks[event]) {
            this._callbacks[event].delete(cb);
        }
    }

    worldPos() {
        return {
            x: (this.sprite.x || 0) + this.offsetX,
            y: (this.sprite.y || 0) + this.offsetY,
        };
    }

    intersects(other) {
        if (!other) return false;

        const aPos = this.worldPos();
        const bPos = other.worldPos();

        // Circle-circle
        if (this.type === 'circle' && other.type === 'circle') {
            const dx = aPos.x - bPos.x;
            const dy = aPos.y - bPos.y;
            const r = this.radius + (other.radius || 4);

            return dx * dx + dy * dy <= r * r;
        }

        // Square-square AABB
        if (this.type === 'square' && other.type === 'square') {
            return (
                Math.abs(aPos.x - bPos.x) <= this.halfWidth + other.halfWidth &&
                Math.abs(aPos.y - bPos.y) <= this.halfHeight + other.halfHeight
            );
        }

        // Circle-square
        const circle = this.type === 'circle' ? this : other;
        const square = this.type === 'square' ? this : other;

        const cPos = circle.worldPos();
        const sPos = square.worldPos();

        const closestX = Math.max(
            sPos.x - square.halfWidth,
            Math.min(cPos.x, sPos.x + square.halfWidth)
        );

        const closestY = Math.max(
            sPos.y - square.halfHeight,
            Math.min(cPos.y, sPos.y + square.halfHeight)
        );

        const dx = cPos.x - closestX;
        const dy = cPos.y - closestY;

        return dx * dx + dy * dy <= circle.radius * circle.radius;
    }

    // Returns collision information for resolving overlap.
    // normal points from `other` toward `this`.
    collisionInfo(other) {
        if (!other || !this.intersects(other)) return null;

        const aPos = this.worldPos();
        const bPos = other.worldPos();

        const dx = aPos.x - bPos.x;
        const dy = aPos.y - bPos.y;

        // Square-square AABB resolution
        if (this.type === 'square' && other.type === 'square') {
            const overlapX = this.halfWidth + other.halfWidth - Math.abs(dx);
            const overlapY = this.halfHeight + other.halfHeight - Math.abs(dy);

            if (overlapX <= 0 || overlapY <= 0) return null;

            if (overlapX < overlapY) {
                return {
                    normal: {
                        x: dx < 0 ? -1 : 1,
                        y: 0,
                    },
                    depth: overlapX,
                };
            }

            return {
                normal: {
                    x: 0,
                    y: dy < 0 ? -1 : 1,
                },
                depth: overlapY,
            };
        }

        // Circle-circle resolution
        if (this.type === 'circle' && other.type === 'circle') {
            const distSq = dx * dx + dy * dy;
            const r = this.radius + other.radius;

            if (distSq <= 0) {
                return {
                    normal: { x: 1, y: 0 },
                    depth: r,
                };
            }

            const dist = Math.sqrt(distSq);

            return {
                normal: {
                    x: dx / dist,
                    y: dy / dist,
                },
                depth: r - dist,
            };
        }

        // Circle-square resolution
        const circle = this.type === 'circle' ? this : other;
        const square = this.type === 'square' ? this : other;

        const cPos = circle.worldPos();
        const sPos = square.worldPos();

        const closestX = Math.max(
            sPos.x - square.halfWidth,
            Math.min(cPos.x, sPos.x + square.halfWidth)
        );

        const closestY = Math.max(
            sPos.y - square.halfHeight,
            Math.min(cPos.y, sPos.y + square.halfHeight)
        );

        let nx = cPos.x - closestX;
        let ny = cPos.y - closestY;

        const distSq = nx * nx + ny * ny;

        let info;

        if (distSq <= 0) {
            // Circle center is inside the square.
            // Push toward the nearest edge.
            const left = Math.abs(cPos.x - (sPos.x - square.halfWidth));
            const right = Math.abs((sPos.x + square.halfWidth) - cPos.x);
            const top = Math.abs(cPos.y - (sPos.y - square.halfHeight));
            const bottom = Math.abs((sPos.y + square.halfHeight) - cPos.y);

            const min = Math.min(left, right, top, bottom);

            if (min === left) {
                nx = -1;
                ny = 0;
            } else if (min === right) {
                nx = 1;
                ny = 0;
            } else if (min === top) {
                nx = 0;
                ny = -1;
            } else {
                nx = 0;
                ny = 1;
            }

            info = {
                normal: { x: nx, y: ny },
                depth: circle.radius + min,
            };
        } else {
            const dist = Math.sqrt(distSq);

            info = {
                normal: {
                    x: nx / dist,
                    y: ny / dist,
                },
                depth: circle.radius - dist,
            };
        }

        // collisionInfo should always return a normal from `other` toward `this`.
        // The circle-square math naturally points from square to circle.
        // If `this` is the square, flip it.
        if (this.type === 'square') {
            info.normal.x *= -1;
            info.normal.y *= -1;
        }

        return info;
    }
    
    resolveCollision(other) {
        if (!this.resolve || !other || !other.resolve) return false;

        const info = this.collisionInfo(other);
        if (!info || info.depth <= 0) return false;

        const nx = info.normal.x;
        const ny = info.normal.y;

        const pushX = nx * info.depth * this.resolveStrength;
        const pushY = ny * info.depth * this.resolveStrength;

        const thisStatic = this.static;
        const otherStatic = other.static;

        // If both are static, do nothing.
        if (thisStatic && otherStatic) {
            return false;
        }

        // -----------------------------
        // 1. POSITION SEPARATION
        // -----------------------------

        if (thisStatic && !otherStatic) {
            other.sprite.x -= pushX;
            other.sprite.y -= pushY;
        } else if (!thisStatic && otherStatic) {
            this.sprite.x += pushX;
            this.sprite.y += pushY;
        } else {
            this.sprite.x += pushX * 0.5;
            this.sprite.y += pushY * 0.5;

            other.sprite.x -= pushX * 0.5;
            other.sprite.y -= pushY * 0.5;
        }

        // -----------------------------
        // 2. VELOCITY BLOCKING
        // -----------------------------
        // This is the missing part.
        // Remove velocity that points into the other collider.

        const a = this.sprite;
        const b = other.sprite;

        const avx = a.vx || 0;
        const avy = a.vy || 0;
        const bvx = b.vx || 0;
        const bvy = b.vy || 0;

        // Relative velocity from other -> this
        const rvx = avx - bvx;
        const rvy = avy - bvy;

        // Velocity along collision normal
        const velAlongNormal = rvx * nx + rvy * ny;

        // If velAlongNormal > 0, they are already separating.
        // If <= 0, they are moving into each other.
        if (velAlongNormal < 0) {
            const restitution = 0; // 0 = no bounce, just stop

            let impulse = -(1 + restitution) * velAlongNormal;

            if (!thisStatic && !otherStatic) {
                impulse *= 0.5;
            }

            const impulseX = impulse * nx;
            const impulseY = impulse * ny;

            if (thisStatic && !otherStatic) {
                b.vx -= impulseX;
                b.vy -= impulseY;
            } else if (!thisStatic && otherStatic) {
                a.vx += impulseX;
                a.vy += impulseY;
            } else {
                a.vx += impulseX;
                a.vy += impulseY;

                b.vx -= impulseX;
                b.vy -= impulseY;
            }
        }

        // Optional: reduce sliding/jitter slightly
        const damping = 0.98;

        if (!thisStatic) {
            a.vx *= damping;
            a.vy *= damping;
        }

        if (!otherStatic) {
            b.vx *= damping;
            b.vy *= damping;
        }

        for (const cb of this._callbacks.collision) {
            cb(other, this, info);
        }

        for (const cb of other._callbacks.collision) {
            cb(this, other, {
                normal: {
                    x: -info.normal.x,
                    y: -info.normal.y,
                },
                depth: info.depth,
            });
        }

        return true;
    }

    checkAgainst(others) {
        const now = new Set();

        for (const other of others) {
            if (!other || other === this) continue;

            const hit = this.intersects(other);

            if (hit) {
                now.add(other);
            }

            const was = this._prev.has(other);

            if (hit && !was) {
                for (const cb of this._callbacks.enter) {
                    cb(other, this);
                }
            } else if (hit && was) {
                for (const cb of this._callbacks.stay) {
                    cb(other, this);
                }
            } else if (!hit && was) {
                for (const cb of this._callbacks.exit) {
                    cb(other, this);
                }
            }
        }

        for (const prev of this._prev) {
            if (!now.has(prev)) {
                for (const cb of this._callbacks.exit) {
                    cb(prev, this);
                }
            }
        }

        this._prev = now;
    }

    update(others) {
        this.checkAgainst(others);
    }

    clear() {
        this._callbacks.enter.clear();
        this._callbacks.stay.clear();
        this._callbacks.exit.clear();
        this._callbacks.collision.clear();
        this._prev.clear();
    }
}