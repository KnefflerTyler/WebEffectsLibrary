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
            collisionIterations: options.collisionIterations ?? 2,

            // Spatial grid cell size for neighbor lookup
            gridCellSize: options.gridCellSize ?? 96,
        };

        this.sharedTemplate = null;
        this.sharedImage = null;

        this._grid = new Map();

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
        // 1. Apply target/mouse attraction
        for (const sprite of this.sprites) {
            this.applyForces(sprite, dt);
        }

        // 2. Prevent sprites from moving into each other before movement
        if (this.settings.collisions && this.settings.avoidance) {
            this.applyCollisionAvoidance(dt);
        }

        // 3. Move sprites
        for (const sprite of this.sprites) {
            sprite.update(dt);
        }

        // 4. Keep sprites inside screen bounds
        for (const sprite of this.sprites) {
            this.keepInBounds(sprite);
        }

        // 5. Final correction for any remaining overlaps
        if (this.settings.collisions) {
            this.resolveCollisions();
        }

        // 6. Fire enter/stay/exit events
        this.updateCollisionEvents();
    }

    applyCollisionAvoidance(dt) {
        this.buildSpatialGrid();

        const lookAhead = this.settings.avoidanceLookAhead;
        const padding = this.settings.avoidancePadding;
        const strength = this.settings.avoidanceStrength;

        for (const sprite of this.sprites) {
            if (!sprite.collider || sprite.collider.static) continue;

            const neighbors = this.getNearbySprites(sprite);

            for (const other of neighbors) {
                if (!other || other === sprite) continue;
                if (!other.collider) continue;

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
                    dx = Math.random() - 0.5;
                    dy = Math.random() - 0.5;
                    distSq = dx * dx + dy * dy || 1;
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
    }

    buildSpatialGrid() {
        this._grid.clear();

        const cellSize = this.settings.gridCellSize;

        for (const sprite of this.sprites) {
            const cx = Math.floor(sprite.x / cellSize);
            const cy = Math.floor(sprite.y / cellSize);
            const key = `${cx},${cy}`;

            let bucket = this._grid.get(key);

            if (!bucket) {
                bucket = [];
                this._grid.set(key, bucket);
            }

            bucket.push(sprite);
        }
    }

    getNearbySprites(sprite) {
        const result = [];

        const cellSize = this.settings.gridCellSize;

        const cx = Math.floor(sprite.x / cellSize);
        const cy = Math.floor(sprite.y / cellSize);

        for (let y = cy - 1; y <= cy + 1; y++) {
            for (let x = cx - 1; x <= cx + 1; x++) {
                const bucket = this._grid.get(`${x},${y}`);

                if (!bucket) continue;

                for (const other of bucket) {
                    if (other !== sprite) {
                        result.push(other);
                    }
                }
            }
        }

        return result;
    }

    getCollisionRadius(sprite) {
        const c = sprite.collider;

        if (!c) {
            return this.settings.radius ?? 4;
        }

        if (c.type === 'square' || c.type === 'rect') {
            return Math.max(
                c.halfWidth ?? sprite.width / 2 ?? this.settings.radius,
                c.halfHeight ?? sprite.height / 2 ?? this.settings.radius
            );
        }

        return c.radius ?? this.settings.radius ?? 4;
    }

    resolveCollisions() {
        const colliders = this.sprites
            .map(sprite => sprite.collider)
            .filter(Boolean);

        for (let iteration = 0; iteration < this.settings.collisionIterations; iteration++) {
            for (let i = 0; i < colliders.length; i++) {
                for (let j = i + 1; j < colliders.length; j++) {
                    colliders[i].resolveCollision(colliders[j]);
                }
            }
        }
    }

    updateCollisionEvents() {
        const colliders = this.sprites
            .map(sprite => sprite.collider)
            .filter(Boolean);

        for (const collider of colliders) {
            collider.checkAgainst(colliders);
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
        const speedSq = p.vx * p.vx + p.vy * p.vy;
        const maxSpeed = this.settings.maxSpeed;

        if (speedSq > maxSpeed * maxSpeed) {
            const speed = Math.sqrt(speedSq);

            p.vx = (p.vx / speed) * maxSpeed;
            p.vy = (p.vy / speed) * maxSpeed;
        }
    }

    draw(ctx) {
        for (const sprite of this.sprites) {
            sprite.draw(ctx);
        }
    }
}

export default Flock;