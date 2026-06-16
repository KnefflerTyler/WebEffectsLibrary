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

            // Collision settings
            collisions: options.collisions ?? true,
            colliderType: options.colliderType ?? 'circle',
            resolveStrength: options.resolveStrength ?? 1,
        };

        this.sharedTemplate = null;
        this.sharedImage = null;

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
        // 1. Apply flock forces
        for (const sprite of this.sprites) {
            this.applyForces(sprite, dt);
        }

        // 2. Move sprites
        for (const sprite of this.sprites) {
            sprite.update(dt);
        }

        // 3. Keep sprites inside screen bounds
        for (const sprite of this.sprites) {
            this.keepInBounds(sprite);
        }

        // 4. Resolve collisions globally, once per pair
        if (this.settings.collisions) {
            this.resolveCollisions();
        }

        // 5. Fire collider enter/stay/exit events
        this.updateCollisionEvents();
    }

    resolveCollisions() {
        const colliders = this.sprites
            .map(sprite => sprite.collider)
            .filter(Boolean);

        for (let i = 0; i < colliders.length; i++) {
            for (let j = i + 1; j < colliders.length; j++) {
                colliders[i].resolveCollision(colliders[j]);
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
        const r = sprite.collider?.radius ?? this.settings.radius ?? 4;

        if (sprite.x < r) {
            sprite.x = r;
            sprite.vx = Math.abs(sprite.vx);
        }

        if (sprite.x > this.width - r) {
            sprite.x = this.width - r;
            sprite.vx = -Math.abs(sprite.vx);
        }

        if (sprite.y < r) {
            sprite.y = r;
            sprite.vy = Math.abs(sprite.vy);
        }

        if (sprite.y > this.height - r) {
            sprite.y = this.height - r;
            sprite.vy = -Math.abs(sprite.vy);
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

        // Limit max speed
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