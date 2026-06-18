'use strict';

import DefaultSprite from './sprite/sprites/default_sprite.js';
import { loadSpriteFromJSON } from './sprite/spriteLoader.js';
import CollisionWorld from './physics/collisionWorld.js';

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
            attraction: options.attraction ?? 180,
            drag: options.drag ?? 0.88,
            maxSpeed: options.maxSpeed ?? 220,

            settleSpeed: options.settleSpeed ?? 10,
            targetStopRadius: options.targetStopRadius ?? 48,

            radius: options.radius ?? 8,
            color: options.color ?? '#ffffff',

            collisions: options.collisions ?? true,
            colliderType: options.colliderType ?? 'circle',

            collisionIterations: options.collisionIterations ?? 8,
            gridCellSize: options.gridCellSize ?? 24,
            collisionSlop: options.collisionSlop ?? 0,
            contactDamping: options.contactDamping ?? 0.55,

            boundsBounce: options.boundsBounce ?? false,
            collisionEvents: options.collisionEvents ?? false
        };

        this.sharedTemplate = null;
        this.sharedImage = null;

        this.collisionWorld = new CollisionWorld({
            gridCellSize: this.settings.gridCellSize,
            iterations: this.settings.collisionIterations,
            collisionSlop: this.settings.collisionSlop,
            contactDamping: this.settings.contactDamping,
            collisionEvents: this.settings.collisionEvents
        });

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
            const sprite = new DefaultSprite({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 80,
                vy: (Math.random() - 0.5) * 80,
                width: 0,
                height: 0,
                sheetCols: 1,
                sheetRows: 1
            });

            sprite._flockId = i;

            this.applyDefaultCollider(sprite);

            this.sprites.push(sprite);
        }
    }

    applyDefaultCollider(sprite) {
        if (!sprite || typeof sprite.setCollider !== 'function') return;

        try {
            if (this.settings.colliderType === 'square') {
                const size = this.settings.radius * 2;

                sprite.setCollider({
                    type: 'square',
                    width: sprite.width || size,
                    height: sprite.height || size,
                    resolve: true,
                    static: false,
                    contactDamping: this.settings.contactDamping
                });
            } else {
                sprite.setCollider({
                    type: 'circle',
                    radius: this.settings.radius,
                    resolve: true,
                    static: false,
                    contactDamping: this.settings.contactDamping
                });
            }

            this.syncCollider(sprite);
        } catch (e) {
            console.warn('Failed to set sprite collider', e);
        }
    }

    setSpriteImage(image, template = null) {
        console.log('[flock] setSpriteImage', !!image, !!template);

        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];

            if (template && typeof sprite.applyTemplate === 'function') {
                sprite.applyTemplate(template, image);
            } else {
                sprite.setImage(image);

                try {
                    if (typeof sprite.setAnimation === 'function') {
                        sprite.setAnimation('default');
                    }
                } catch (e) {}

                this.applyDefaultCollider(sprite);
            }

            this.syncCollider(sprite);
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

    update(dt) {
        dt = Math.min(dt, 1 / 30);

        this.configureCollisionWorld();

        this.applyForcesToAll(dt);
        this.updateSprites(dt);
        this.keepAllInBounds();

        if (this.settings.collisions) {
            this.resolveCollisions();

            // Collision correction can push sprites outside the screen.
            this.keepAllInBounds();
        }
    }

    configureCollisionWorld() {
        this.collisionWorld.configure({
            gridCellSize: this.settings.gridCellSize,
            iterations: this.settings.collisionIterations,
            collisionSlop: this.settings.collisionSlop,
            contactDamping: this.settings.contactDamping,
            collisionEvents: this.settings.collisionEvents
        });
    }

    applyForcesToAll(dt) {
        for (let i = 0; i < this.sprites.length; i++) {
            this.applyForces(this.sprites[i], dt);
        }
    }

    updateSprites(dt) {
        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];

            if (!sprite) continue;

            if (typeof sprite.update === 'function') {
                sprite.update(dt);
            }

            this.syncCollider(sprite);
        }
    }

    applyForces(sprite, dt) {
        if (!sprite || sprite.collider?.static) return;

        const dx = this.target.x - sprite.x;
        const dy = this.target.y - sprite.y;

        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;

        const stopRadius = this.settings.targetStopRadius;

        // Stop pulling inward near the target so the cluster can settle.
        if (dist > stopRadius) {
            const nx = dx / dist;
            const ny = dy / dist;

            const pullScale = Math.min(1, (dist - stopRadius) / stopRadius);

            sprite.vx += nx * this.settings.attraction * pullScale * dt;
            sprite.vy += ny * this.settings.attraction * pullScale * dt;
        }

        sprite.vx *= this.settings.drag;
        sprite.vy *= this.settings.drag;

        this.limitSpeed(sprite);
        this.snapTinyVelocity(sprite);
    }

    limitSpeed(sprite) {
        const vx = sprite.vx || 0;
        const vy = sprite.vy || 0;

        const speedSq = vx * vx + vy * vy;
        const maxSpeed = this.settings.maxSpeed;

        if (speedSq <= maxSpeed * maxSpeed) return;

        const speed = Math.sqrt(speedSq);

        sprite.vx = (vx / speed) * maxSpeed;
        sprite.vy = (vy / speed) * maxSpeed;
    }

    snapTinyVelocity(sprite) {
        const vx = sprite.vx || 0;
        const vy = sprite.vy || 0;

        const speedSq = vx * vx + vy * vy;
        const settleSpeed = this.settings.settleSpeed;

        if (speedSq < settleSpeed * settleSpeed) {
            sprite.vx = 0;
            sprite.vy = 0;
        }
    }

    syncCollider(sprite) {
        const collider = sprite?.collider;

        if (collider && typeof collider.sync === 'function') {
            collider.sync();
        }
    }

    syncAllColliders() {
        this.collisionWorld.syncAll(this.sprites);
    }

    resolveCollisions() {
        this.collisionWorld.resolve(this.sprites);
    }

    keepAllInBounds() {
        for (let i = 0; i < this.sprites.length; i++) {
            this.keepInBounds(this.sprites[i]);
        }
    }

    keepInBounds(sprite) {
        const collider = sprite?.collider;
        if (!sprite || !collider || typeof collider.getBounds !== 'function') return;

        const bounce = this.settings.boundsBounce;
        const bounds = collider.getBounds();

        if (bounds.minX < 0) {
            sprite.x += -bounds.minX;
            sprite.vx = bounce ? Math.abs(sprite.vx || 0) : 0;
        }

        if (bounds.maxX > this.width) {
            sprite.x += this.width - bounds.maxX;
            sprite.vx = bounce ? -Math.abs(sprite.vx || 0) : 0;
        }

        if (bounds.minY < 0) {
            sprite.y += -bounds.minY;
            sprite.vy = bounce ? Math.abs(sprite.vy || 0) : 0;
        }

        if (bounds.maxY > this.height) {
            sprite.y += this.height - bounds.maxY;
            sprite.vy = bounce ? -Math.abs(sprite.vy || 0) : 0;
        }

        this.syncCollider(sprite);
    }

    draw(ctx) {
        for (let i = 0; i < this.sprites.length; i++) {
            const sprite = this.sprites[i];

            if (sprite && typeof sprite.draw === 'function') {
                sprite.draw(ctx);
            }
        }
    }
}

export default Flock;