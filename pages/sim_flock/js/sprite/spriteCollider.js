'use strict';

// SpriteCollider owns narrowphase collision logic:
// - circle/circle
// - square/square AABB
// - circle/square
// - hard position separation
// - impulse-based velocity transfer
// - optional friction/restitution
// - enter/stay/exit/collision callbacks

export default class SpriteCollider {
    constructor(sprite, options = {}) {
        this.sprite = sprite;

        this.type = this.normalizeType(options.type || 'circle');

        this.offsetX = Number(options.offsetX) || 0;
        this.offsetY = Number(options.offsetY) || 0;

        this.resolve = options.resolve !== undefined ? !!options.resolve : true;
        this.static = options.static !== undefined ? !!options.static : false;

        // Compatibility with older config.
        // Do not use this for hard position separation.
        this.resolveStrength = options.resolveStrength ?? 1;

        this.mass = options.mass ?? 1;
        this.invMass = this.static ? 0 : 1 / Math.max(0.0001, this.mass);

        // 0 = no bounce, 1 = very bouncy.
        // For flock sprites, keep this very low.
        this.restitution = options.restitution ?? 0.02;

        // 0 = can slide/move together freely.
        // Increase slightly only if you want contact friction.
        this.friction = options.friction ?? 0;

        const spriteWidth =
            Number(sprite.width) ||
            Number(sprite.renderWidth) ||
            Number(sprite.size) ||
            0;

        const spriteHeight =
            Number(sprite.height) ||
            Number(sprite.renderHeight) ||
            Number(sprite.size) ||
            0;

        if (this.type === 'circle') {
            const defaultRadius =
                Math.max(spriteWidth, spriteHeight) > 0
                    ? Math.max(spriteWidth, spriteHeight) * 0.5
                    : 4;

            this.radius =
                options.radius !== undefined
                    ? Number(options.radius)
                    : defaultRadius;

            this.width = this.radius * 2;
            this.height = this.radius * 2;

            this.halfWidth = this.radius;
            this.halfHeight = this.radius;
        } else {
            const width =
                options.width !== undefined
                    ? Number(options.width)
                    : spriteWidth > 0
                        ? spriteWidth
                        : 8;

            const height =
                options.height !== undefined
                    ? Number(options.height)
                    : spriteHeight > 0
                        ? spriteHeight
                        : 8;

            this.width = width;
            this.height = height;

            this.halfWidth = width * 0.5;
            this.halfHeight = height * 0.5;

            // Broadphase fallback radius.
            this.radius = Math.sqrt(
                this.halfWidth * this.halfWidth +
                this.halfHeight * this.halfHeight
            );
        }

        this._callbacks = {
            enter: new Set(),
            stay: new Set(),
            exit: new Set(),
            collision: new Set()
        };

        this._prev = new Set();
        this._now = new Set();
    }

    normalizeType(type) {
        if (type === 'square' || type === 'rect' || type === 'rectangle') {
            return 'square';
        }

        if (type === 'circle') {
            return 'circle';
        }

        console.warn(`Unknown collider type "${type}", falling back to circle.`);
        return 'circle';
    }

    sync() {
        // Position is derived from sprite + offset.
        // Keep this method so CollisionWorld can sync colliders generically.
    }

    on(event, cb) {
        if (this._callbacks[event]) {
            this._callbacks[event].add(cb);
        }

        return () => this.off(event, cb);
    }

    off(event, cb) {
        if (this._callbacks[event]) {
            this._callbacks[event].delete(cb);
        }
    }

    clear() {
        this._callbacks.enter.clear();
        this._callbacks.stay.clear();
        this._callbacks.exit.clear();
        this._callbacks.collision.clear();

        this._prev.clear();
        this._now.clear();
    }

    worldPos() {
        return {
            x: (this.sprite.x || 0) + this.offsetX,
            y: (this.sprite.y || 0) + this.offsetY
        };
    }

    isCircle() {
        return this.type === 'circle';
    }

    isSquare() {
        return this.type === 'square';
    }

    getBounds() {
        const pos = this.worldPos();

        if (this.isSquare()) {
            return {
                minX: pos.x - this.halfWidth,
                minY: pos.y - this.halfHeight,
                maxX: pos.x + this.halfWidth,
                maxY: pos.y + this.halfHeight
            };
        }

        return {
            minX: pos.x - this.radius,
            minY: pos.y - this.radius,
            maxX: pos.x + this.radius,
            maxY: pos.y + this.radius
        };
    }

    intersects(other) {
        if (!other) return false;

        const info = this.collisionInfo(other);
        return !!info && info.depth > 0;
    }

    collisionInfo(other) {
        if (!other) return null;

        if (this.isCircle() && other.isCircle()) {
            return this.circleCircleInfo(other);
        }

        if (this.isSquare() && other.isSquare()) {
            return this.squareSquareInfo(other);
        }

        return this.circleSquareInfo(other);
    }

    circleCircleInfo(other) {
        const a = this.worldPos();
        const b = other.worldPos();

        let dx = a.x - b.x;
        let dy = a.y - b.y;

        let distSq = dx * dx + dy * dy;

        const minDist = this.radius + other.radius;

        if (distSq >= minDist * minDist) {
            return null;
        }

        if (distSq <= 0.000001) {
            const idA = this.sprite?._flockId ?? 1;
            const idB = other.sprite?._flockId ?? 2;
            const angle = (idA * 12.9898 + idB * 78.233) % (Math.PI * 2);

            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distSq = 1;
        }

        const dist = Math.sqrt(distSq);

        return {
            normal: {
                x: dx / dist,
                y: dy / dist
            },
            depth: minDist - dist
        };
    }

    squareSquareInfo(other) {
        const a = this.worldPos();
        const b = other.worldPos();

        const dx = a.x - b.x;
        const dy = a.y - b.y;

        const overlapX = this.halfWidth + other.halfWidth - Math.abs(dx);
        if (overlapX <= 0) return null;

        const overlapY = this.halfHeight + other.halfHeight - Math.abs(dy);
        if (overlapY <= 0) return null;

        if (overlapX < overlapY) {
            return {
                normal: {
                    x: dx < 0 ? -1 : 1,
                    y: 0
                },
                depth: overlapX
            };
        }

        return {
            normal: {
                x: 0,
                y: dy < 0 ? -1 : 1
            },
            depth: overlapY
        };
    }

    circleSquareInfo(other) {
        const thisIsCircle = this.isCircle();

        const circle = thisIsCircle ? this : other;
        const square = thisIsCircle ? other : this;

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

        let depth = 0;

        if (distSq <= 0.000001) {
            // Circle center is inside the square.
            // Push toward nearest edge.
            const left = Math.abs(cPos.x - (sPos.x - square.halfWidth));
            const right = Math.abs((sPos.x + square.halfWidth) - cPos.x);
            const top = Math.abs(cPos.y - (sPos.y - square.halfHeight));
            const bottom = Math.abs((sPos.y + square.halfHeight) - cPos.y);

            const minEdge = Math.min(left, right, top, bottom);

            if (minEdge === left) {
                nx = -1;
                ny = 0;
            } else if (minEdge === right) {
                nx = 1;
                ny = 0;
            } else if (minEdge === top) {
                nx = 0;
                ny = -1;
            } else {
                nx = 0;
                ny = 1;
            }

            depth = circle.radius + minEdge;
        } else {
            const dist = Math.sqrt(distSq);

            if (dist >= circle.radius) {
                return null;
            }

            nx /= dist;
            ny /= dist;

            depth = circle.radius - dist;
        }

        // nx/ny currently points from square toward circle.
        // collisionInfo must return normal from other -> this.
        if (thisIsCircle) {
            return {
                normal: { x: nx, y: ny },
                depth
            };
        }

        return {
            normal: { x: -nx, y: -ny },
            depth
        };
    }

    resolveCollision(other, options = {}) {
        if (!this.resolve || !other || !other.resolve) return false;

        const info = this.collisionInfo(other);
        if (!info || info.depth <= 0) return false;

        const slop = options.collisionSlop ?? 0;
        const depth = info.depth - slop;

        if (depth <= 0) return false;

        const nx = info.normal.x;
        const ny = info.normal.y;

        const thisStatic = !!this.static;
        const otherStatic = !!other.static;

        if (thisStatic && otherStatic) return false;

        this.applyPositionCorrection(other, nx, ny, depth, options);
        this.applyCollisionImpulse(other, nx, ny, options);
        this.emitCollision(other, info);

        return true;
    }

    applyPositionCorrection(other, nx, ny, depth, options = {}) {
        const a = this.sprite;
        const b = other.sprite;

        const thisStatic = !!this.static;
        const otherStatic = !!other.static;

        // Hard separation by default.
        // percentage can be lowered if correction is too sharp.
        const percent = options.positionCorrectionPercent ?? 1;

        const correction = depth * percent;

        const pushX = nx * correction;
        const pushY = ny * correction;

        if (thisStatic && !otherStatic) {
            b.x -= pushX;
            b.y -= pushY;
        } else if (!thisStatic && otherStatic) {
            a.x += pushX;
            a.y += pushY;
        } else if (!thisStatic && !otherStatic) {
            const invMassA = this.invMass;
            const invMassB = other.invMass;
            const invMassSum = invMassA + invMassB || 1;

            const ratioA = invMassA / invMassSum;
            const ratioB = invMassB / invMassSum;

            a.x += pushX * ratioA;
            a.y += pushY * ratioA;

            b.x -= pushX * ratioB;
            b.y -= pushY * ratioB;
        }
    }

    applyCollisionImpulse(other, nx, ny, options = {}) {
        const a = this.sprite;
        const b = other.sprite;

        const thisStatic = !!this.static;
        const otherStatic = !!other.static;

        if (thisStatic && otherStatic) return;

        const avx = a.vx || 0;
        const avy = a.vy || 0;
        const bvx = b.vx || 0;
        const bvy = b.vy || 0;

        // Relative velocity from other -> this.
        const rvx = avx - bvx;
        const rvy = avy - bvy;

        // Normal points from other toward this.
        // Negative means closing into each other.
        // Zero means moving together.
        // Positive means separating.
        const velAlongNormal = rvx * nx + rvy * ny;

        const epsilon = options.contactEpsilon ?? 0.0001;

        if (velAlongNormal > -epsilon) {
            this.applyFrictionImpulse(other, nx, ny, 0, options);
            return;
        }

        const restitution =
            options.restitution ??
            Math.min(this.restitution ?? 0, other.restitution ?? 0);

        const invMassA = thisStatic ? 0 : this.invMass;
        const invMassB = otherStatic ? 0 : other.invMass;

        const invMassSum = invMassA + invMassB;
        if (invMassSum <= 0) return;

        // Physics impulse scalar.
        const j = -(1 + restitution) * velAlongNormal / invMassSum;

        const impulseX = j * nx;
        const impulseY = j * ny;

        if (!thisStatic) {
            a.vx += impulseX * invMassA;
            a.vy += impulseY * invMassA;
        }

        if (!otherStatic) {
            b.vx -= impulseX * invMassB;
            b.vy -= impulseY * invMassB;
        }

        this.applyFrictionImpulse(other, nx, ny, j, options);
    }

    applyFrictionImpulse(other, nx, ny, normalImpulse = 0, options = {}) {
        const friction =
            options.friction ??
            Math.min(this.friction ?? 0, other.friction ?? 0);

        if (friction <= 0) return;

        const a = this.sprite;
        const b = other.sprite;

        const thisStatic = !!this.static;
        const otherStatic = !!other.static;

        if (thisStatic && otherStatic) return;

        const avx = a.vx || 0;
        const avy = a.vy || 0;
        const bvx = b.vx || 0;
        const bvy = b.vy || 0;

        const rvx = avx - bvx;
        const rvy = avy - bvy;

        const normalSpeed = rvx * nx + rvy * ny;

        let tx = rvx - normalSpeed * nx;
        let ty = rvy - normalSpeed * ny;

        const tangentLenSq = tx * tx + ty * ty;
        if (tangentLenSq <= 0.000001) return;

        const tangentLen = Math.sqrt(tangentLenSq);

        tx /= tangentLen;
        ty /= tangentLen;

        const tangentSpeed = rvx * tx + rvy * ty;

        const invMassA = thisStatic ? 0 : this.invMass;
        const invMassB = otherStatic ? 0 : other.invMass;

        const invMassSum = invMassA + invMassB;
        if (invMassSum <= 0) return;

        let jt = -tangentSpeed / invMassSum;

        // Coulomb-style clamp.
        // If normalImpulse is 0 because objects are resting/moving together,
        // still allow a tiny friction cap so sliding can settle if wanted.
        const maxFriction =
            normalImpulse > 0
                ? normalImpulse * friction
                : friction;

        jt = Math.max(-maxFriction, Math.min(maxFriction, jt));

        const impulseX = jt * tx;
        const impulseY = jt * ty;

        if (!thisStatic) {
            a.vx += impulseX * invMassA;
            a.vy += impulseY * invMassA;
        }

        if (!otherStatic) {
            b.vx -= impulseX * invMassB;
            b.vy -= impulseY * invMassB;
        }
    }

    emitCollision(other, info) {
        for (const cb of this._callbacks.collision) {
            cb(other, this, info);
        }

        const flipped = {
            normal: {
                x: -info.normal.x,
                y: -info.normal.y
            },
            depth: info.depth
        };

        for (const cb of other._callbacks.collision) {
            cb(this, other, flipped);
        }
    }

    trackAgainst(other) {
        if (!other || other === this) return;

        const hit = this.intersects(other);

        if (hit) {
            this._now.add(other);
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
        }
    }

    finishEventFrame() {
        for (const prev of this._prev) {
            if (!this._now.has(prev)) {
                for (const cb of this._callbacks.exit) {
                    cb(prev, this);
                }
            }
        }

        this._prev = this._now;
        this._now = new Set();
    }

    checkAgainst(others) {
        this._now.clear();

        for (const other of others) {
            if (!other || other === this) continue;
            this.trackAgainst(other);
        }

        this.finishEventFrame();
    }

    update(others) {
        this.checkAgainst(others);
    }
}