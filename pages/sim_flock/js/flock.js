"use strict";

import DefaultSprite from './sprite/sprites/default_sprite.js';
import { loadSpriteFromJSON } from './sprite/spriteLoader.js';

export class Flock {
    constructor(options = {}) {
        this.width = options.width ?? window.innerWidth;
        this.height = options.height ?? window.innerHeight;

        this.count = options.count ?? 1000;
        this.sprites = [];

        this.target = {
            x: this.width / 2,
            y: this.height / 2
        };

        this.settings = {
            attraction: options.attraction ?? 900,
            drag: options.drag ?? 0.92,
            maxSpeed: options.maxSpeed ?? 600,
            radius: options.radius ?? 8,
            color: options.color ?? '#ffffff',

            collisions: options.collisions ?? true,
            colliderType: options.colliderType ?? 'circle',
            resolveStrength: options.resolveStrength ?? 1,

            // Prevent sprites from driving into each other before collision happens
            avoidance: options.avoidance ?? true,
            avoidanceStrength: options.avoidanceStrength ?? 900,
            avoidanceLookAhead: options.avoidanceLookAhead ?? 0.08,
            avoidancePadding: options.avoidancePadding ?? 4,

            // Higher = smoother but slower
            collisionIterations: options.collisionIterations ?? 3,

            // Keep this at least as large as the largest collider diameter.
            // If radius is 8, 64/96 is fine.
            gridCellSize: options.gridCellSize ?? 96,

            // Direct positional collision correction.
            // 1 = full correction. Lower values are softer but can allow overlap.
            positionalCorrection: options.positionalCorrection ?? 1,

            // Tiny allowed overlap to reduce jitter.
            collisionSlop: options.collisionSlop ?? 0.01,

            // Collision event checking can be expensive for thousands of sprites.
            collisionEvents: options.collisionEvents ?? false,
        };

        this.sharedTemplate = null;
        this.sharedImage = null;

        // Spatial hash state. Reused every frame to avoid allocations.
        this._grid = new Map();
        this._neighborSprites = [];
        this._neighborColliders = [];

        this.templateReady = this.loadSharedTemplate();

        this.createSprites();
    }

    async loadSharedTemplate() {
        try {
            const result = await loadSpriteFromJSON('assets/data/sprites/sprite_default.json');

            this.sharedTemplate = result.sprite;
            this.sharedImage = result.image;

            console.log('[Flock] Loaded shared template and image', !!this.sharedImage);

            if (this.sprites.length > 0 && this.sharedImage) {
                console.log('[Flock] Applying shared image to', this.sprites.length, 'sprites');
                this.setSpriteImage(this.sharedImage, this.sharedTemplate);
            }

            return result;
        } catch (e) {
            console.warn('[Flock] Failed to load shared template', e);
            return null;
        }
    }

    createSprites() {
        this.sprites.length = 0;

        for (let i = 0; i < this.count; i++) {
            const s = new DefaultSprite({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 100,
                vy: (Math.random() - 0.5) * 100,
                width: 0,
                height: 0,
                sheetCols: 1,
                sheetRows: 1,
            });

            // Numeric id used by collision code/debugging.
            s._flockId = i;

            this.applyDefaultCollider(s);

            this.sprites.push(s);
        }
    }

    applyDefaultCollider(sprite) {
        try {
            if (this.settings.colliderType === 'square') {
                const size = this.settings.radius * 2;

                sprite.setCollider({
                    type: 'square',
                    width: sprite.width || size,
                    height: sprite.height || size,
                    resolve: true,
                    resolveStrength: this.settings.resolveStrength,
                    static: false,
                });
            } else {
                sprite.setCollider({
                    type: 'circle',
                    radius: this.settings.radius,
                    resolve: true,
                    resolveStrength: this.settings.resolveStrength,
                    static: false,
                });
            }

            this.syncColliderPosition(sprite);
        } catch (e) {
            console.warn('Failed to set sprite collider', e);
        }
    }

    setTarget(x, y) {
        this.target.x = x;
        this.target.y = y;
    }

    resize(width, height) {
        this.width = width;
        this.height = height;

        this.setTarget(width / 2, height / 2);
    }

    setSpriteImage(image, template = null) {
        console.log('[flock] setSpriteImage', !!image, !!template);

        for (const s of this.sprites) {
            if (template && typeof s.applyTemplate === 'function') {
                s.applyTemplate(template, image);

                // Do NOT call applyDefaultCollider here.
                // The JSON collider from applyTemplate should remain active.
                this.syncColliderPosition(s);
            } else {
                s.setImage(image);

                try {
                    s.setAnimation && s.setAnimation('default');
                } catch (e) {}

                this.applyDefaultCollider(s);
            }
        }
    }

    update(dt) {
        // Avoid huge physics steps after tab switching/debug pauses.
        dt = Math.min(dt, 1 / 30);

        // 1. Apply target/mouse attraction
        for (let i = 0; i < this.sprites.length; i++) {
            this.applyForces(this.sprites[i], dt);
        }

        // 2. Prevent sprites from moving into each other before movement
        if (this.settings.collisions && this.settings.avoidance) {
            this.applyCollisionAvoidance(dt);
        }

        // 3. Move sprites
        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];

            sprite.update(dt);
            this.syncColliderPosition(sprite);
        }

        // 4. Keep sprites inside screen bounds
        for (let i = 0; i < this.sprites.length; i++) {
            this.keepInBounds(this.sprites[i]);
        }

        // 5. Final correction for any remaining overlaps.
        // This now uses spatial hashing, not all-pairs collision.
        if (this.settings.collisions) {
            this.resolveCollisions();
        }

        // 6. Optional enter/stay/exit events.
        // Disabled by default because event tracking can be expensive at 1000+ sprites.
        if (this.settings.collisionEvents) {
            this.updateCollisionEvents();
        }
    }

    applyCollisionAvoidance(dt) {
        this.buildSpatialGrid();

        const lookAhead = this.settings.avoidanceLookAhead;
        const padding = this.settings.avoidancePadding;
        const strength = this.settings.avoidanceStrength;

        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];
            if (!sprite.collider || sprite.collider.static) continue;

            const neighbors = this.getNearbySprites(sprite, this._neighborSprites);

            for (let n = 0; n < neighbors.length; n++) {
                const other = neighbors[n];
                if (!other || other === sprite) continue;
                if (!other.collider) continue;

                // Only handle each pair once.
                if ((sprite._flockId ?? 0) > (other._flockId ?? 0)) continue;

                const rA = this.getCollisionRadius(sprite);
                const rB = this.getCollisionRadius(other);

                const minDist = rA + rB + padding;

                // Predict where both sprites are about to be
                const ax = sprite.x + (sprite.vx || 0) * lookAhead;
                const ay = sprite.y + (sprite.vy || 0) * lookAhead;

                const bx = other.x + (other.vx || 0) * lookAhead;
                const by = other.y + (other.vy || 0) * lookAhead;

                let dx = ax - bx;
                let dy = ay - by;

                let distSq = dx * dx + dy * dy;

                if (distSq <= 0.000001) {
                    const angle = ((sprite._flockId ?? i) * 12.9898) % (Math.PI * 2);
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    distSq = 1;
                }

                const dist = Math.sqrt(distSq);

                // Not predicted to collide
                if (dist >= minDist) continue;

                const nx = dx / dist;
                const ny = dy / dist;

                const overlap = minDist - dist;
                const force = overlap * strength * dt;

                const aStatic = sprite.collider.static;
                const bStatic = other.collider.static;

                // Separation steering before actual overlap
                if (!aStatic && !bStatic) {
                    sprite.vx += nx * force * 0.5;
                    sprite.vy += ny * force * 0.5;

                    other.vx -= nx * force * 0.5;
                    other.vy -= ny * force * 0.5;
                } else if (!aStatic && bStatic) {
                    sprite.vx += nx * force;
                    sprite.vy += ny * force;
                } else if (aStatic && !bStatic) {
                    other.vx -= nx * force;
                    other.vy -= ny * force;
                }

                // Remove velocity that is moving directly into the other sprite.
                this.removeClosingVelocity(sprite, other, nx, ny);
            }

            this.limitSpeed(sprite);
        }
    }

    removeClosingVelocity(a, b, nx, ny) {
        const avx = a.vx || 0;
        const avy = a.vy || 0;
        const bvx = b.vx || 0;
        const bvy = b.vy || 0;

        // Relative velocity from b -> a
        const rvx = avx - bvx;
        const rvy = avy - bvy;

        const closingSpeed = rvx * nx + rvy * ny;

        // Positive means separating already
        if (closingSpeed >= 0) return;

        const impulse = -closingSpeed;

        const aStatic = a.collider?.static;
        const bStatic = b.collider?.static;

        if (!aStatic && !bStatic) {
            a.vx += nx * impulse * 0.5;
            a.vy += ny * impulse * 0.5;

            b.vx -= nx * impulse * 0.5;
            b.vy -= ny * impulse * 0.5;
        } else if (!aStatic && bStatic) {
            a.vx += nx * impulse;
            a.vy += ny * impulse;
        } else if (aStatic && !bStatic) {
            b.vx -= nx * impulse;
            b.vy -= ny * impulse;
        }

        this.limitSpeed(a);
        this.limitSpeed(b);
    }

    // Fast deterministic numeric hash for grid coordinates.
    // Hash collisions are acceptable; they only create extra narrowphase checks.
    hashCell(cx, cy) {
        return ((cx * 73856093) ^ (cy * 19349663)) | 0;
    }

    cellCoord(value) {
        return Math.floor(value / this.settings.gridCellSize);
    }

    buildSpatialGrid() {
        this._grid.clear();

        const cellSize = this.settings.gridCellSize;

        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];
            if (!sprite.collider) continue;

            // Center-cell insert is fast and avoids duplicate pairs.
            // Use a cell size >= the largest collider diameter.
            const cx = Math.floor(sprite.x / cellSize);
            const cy = Math.floor(sprite.y / cellSize);
            const key = this.hashCell(cx, cy);

            let bucket = this._grid.get(key);

            if (!bucket) {
                bucket = [];
                this._grid.set(key, bucket);
            }

            bucket.push(sprite);
        }
    }

    getNearbySprites(sprite, out = this._neighborSprites) {
        out.length = 0;

        const cx = this.cellCoord(sprite.x);
        const cy = this.cellCoord(sprite.y);

        for (let y = cy - 1; y <= cy + 1; y++) {
            for (let x = cx - 1; x <= cx + 1; x++) {
                const bucket = this._grid.get(this.hashCell(x, y));

                if (!bucket) continue;

                for (let i = 0; i < bucket.length; i++) {
                    const other = bucket[i];
                    if (other !== sprite) {
                        out.push(other);
                    }
                }
            }
        }

        return out;
    }

    getCollisionRadius(sprite) {
        const c = sprite.collider;

        if (!c) {
            return this.settings.radius ?? 4;
        }

        if (c.type === 'square' || c.type === 'rect' || c.type === 'rectangle') {
            return Math.max(
                c.halfWidth ?? (c.width ?? sprite.width ?? this.settings.radius * 2) * 0.5,
                c.halfHeight ?? (c.height ?? sprite.height ?? this.settings.radius * 2) * 0.5
            );
        }

        return c.radius ?? this.settings.radius ?? 4;
    }

    getColliderHalfWidth(sprite) {
        const c = sprite.collider;
        return c?.halfWidth ?? (c?.width ?? sprite.width ?? this.settings.radius * 2) * 0.5;
    }

    getColliderHalfHeight(sprite) {
        const c = sprite.collider;
        return c?.halfHeight ?? (c?.height ?? sprite.height ?? this.settings.radius * 2) * 0.5;
    }

    isRectCollider(sprite) {
        const type = sprite.collider?.type;
        return type === 'square' || type === 'rect' || type === 'rectangle';
    }

    syncColliderPosition(sprite) {
        const c = sprite.collider;
        if (!c) return;

        // Some collider implementations compute world position from owner.
        // These assignments also support colliders that store x/y directly.
        if ('x' in c) c.x = sprite.x;
        if ('y' in c) c.y = sprite.y;
    }

    moveSprite(sprite, dx, dy) {
        if (!sprite || sprite.collider?.static) return;

        sprite.x += dx;
        sprite.y += dy;

        this.syncColliderPosition(sprite);
    }

    resolveCollisions() {
        const iterations = this.settings.collisionIterations;

        for (let iteration = 0; iteration < iterations; iteration++) {
            // Rebuild each iteration because the previous pass changed positions.
            this.buildSpatialGrid();

            for (let i = 0; i < this.sprites.length; i++) {
                const a = this.sprites[i];
                if (!a.collider) continue;

                const neighbors = this.getNearbySprites(a, this._neighborSprites);

                for (let n = 0; n < neighbors.length; n++) {
                    const b = neighbors[n];
                    if (!b.collider || a === b) continue;

                    // Only solve each pair once.
                    if ((a._flockId ?? 0) > (b._flockId ?? 0)) continue;

                    this.solvePairPosition(a, b);
                }
            }
        }
    }

    solvePairPosition(a, b) {
        if (this.isRectCollider(a) || this.isRectCollider(b)) {
            // Use AABB for square/rect colliders.
            // Mixed circle/rect can be added later; for now this keeps square collider behavior stable.
            return this.solveAabbPair(a, b);
        }

        return this.solveCirclePair(a, b);
    }

    solveCirclePair(a, b) {
        const rA = this.getCollisionRadius(a);
        const rB = this.getCollisionRadius(b);
        const minDist = rA + rB;

        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy;

        if (distSq <= 0.000001) {
            const angle = ((a._flockId ?? 1) * 12.9898 + (b._flockId ?? 2) * 78.233) % (Math.PI * 2);
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distSq = 1;
        }

        if (distSq >= minDist * minDist) return false;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;

        const rawOverlap = minDist - dist;
        const overlap = Math.max(0, rawOverlap - this.settings.collisionSlop);

        if (overlap <= 0) return false;

        this.applyPositionCorrection(a, b, nx, ny, overlap);

        // Stop them from immediately moving back into each other.
        this.removeClosingVelocity(a, b, nx, ny);

        return true;
    }

    solveAabbPair(a, b) {
        const aHalfW = this.getColliderHalfWidth(a);
        const aHalfH = this.getColliderHalfHeight(a);
        const bHalfW = this.getColliderHalfWidth(b);
        const bHalfH = this.getColliderHalfHeight(b);

        const dx = a.x - b.x;
        const dy = a.y - b.y;

        const overlapX = aHalfW + bHalfW - Math.abs(dx);
        if (overlapX <= 0) return false;

        const overlapY = aHalfH + bHalfH - Math.abs(dy);
        if (overlapY <= 0) return false;

        let nx = 0;
        let ny = 0;
        let overlap = 0;

        if (overlapX < overlapY) {
            nx = dx < 0 ? -1 : 1;
            overlap = Math.max(0, overlapX - this.settings.collisionSlop);
        } else {
            ny = dy < 0 ? -1 : 1;
            overlap = Math.max(0, overlapY - this.settings.collisionSlop);
        }

        if (overlap <= 0) return false;

        this.applyPositionCorrection(a, b, nx, ny, overlap);
        this.removeClosingVelocity(a, b, nx, ny);

        return true;
    }
    
    applyPositionCorrection(a, b, nx, ny, overlap) {
        const ca = a.collider;
        const cb = b.collider;

        const aStatic = !!ca?.static;
        const bStatic = !!cb?.static;

        if (aStatic && bStatic) return;

        // HARD POSITIONAL SEPARATION:
        // Do not use resolveStrength here.
        // This correction moves objects fully outside of overlap.
        const correction = overlap;

        if (!aStatic && !bStatic) {
            this.moveSprite(a, nx * correction * 0.5, ny * correction * 0.5);
            this.moveSprite(b, -nx * correction * 0.5, -ny * correction * 0.5);
        } else if (!aStatic && bStatic) {
            this.moveSprite(a, nx * correction, ny * correction);
        } else if (aStatic && !bStatic) {
            this.moveSprite(b, -nx * correction, -ny * correction);
        }
    }

    updateCollisionEvents() {
        // Spatial event pass. This avoids all-pairs checkAgainst(colliders).
        this.buildSpatialGrid();

        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];
            const collider = sprite.collider;
            if (!collider || typeof collider.checkAgainst !== 'function') continue;

            const neighbors = this.getNearbySprites(sprite, this._neighborSprites);
            this._neighborColliders.length = 0;

            for (let n = 0; n < neighbors.length; n++) {
                const otherCollider = neighbors[n].collider;
                if (otherCollider) this._neighborColliders.push(otherCollider);
            }

            collider.checkAgainst(this._neighborColliders);
        }
    }

    keepInBounds(sprite) {
        const r = this.getCollisionRadius(sprite);

        if (sprite.x < r) {
            sprite.x = r;
            sprite.vx = Math.abs(sprite.vx || 0);
        }

        if (sprite.x > this.width - r) {
            sprite.x = this.width - r;
            sprite.vx = -Math.abs(sprite.vx || 0);
        }

        if (sprite.y < r) {
            sprite.y = r;
            sprite.vy = Math.abs(sprite.vy || 0);
        }

        if (sprite.y > this.height - r) {
            sprite.y = this.height - r;
            sprite.vy = -Math.abs(sprite.vy || 0);
        }

        this.syncColliderPosition(sprite);
    }

    applyForces(p, dt) {
        const targetX = this.target.x;
        const targetY = this.target.y;

        const dx = targetX - p.x;
        const dy = targetY - p.y;

        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;

        const nx = dx / dist;
        const ny = dy / dist;

        // Pull particle toward mouse
        p.vx += nx * this.settings.attraction * dt;
        p.vy += ny * this.settings.attraction * dt;

        // Slow it down so it does not accelerate forever
        p.vx *= this.settings.drag;
        p.vy *= this.settings.drag;

        this.limitSpeed(p);
    }

    limitSpeed(p) {
        const vx = p.vx || 0;
        const vy = p.vy || 0;
        const speedSq = vx * vx + vy * vy;
        const maxSpeed = this.settings.maxSpeed;

        if (speedSq > maxSpeed * maxSpeed) {
            const speed = Math.sqrt(speedSq);

            p.vx = (vx / speed) * maxSpeed;
            p.vy = (vy / speed) * maxSpeed;
        }
    }

    draw(ctx) {
        for (let i = 0; i < this.sprites.length; i++) {
            this.sprites[i].draw(ctx);
        }
    }
}

export default Flock;