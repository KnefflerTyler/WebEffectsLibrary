"use strict";

import Sprite from './sprite/sprite.js';
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
            radius: options.radius ?? 2,
            color: options.color ?? '#ffffff'
        };

        // Load template once and share across all sprites for performance
        this.templateReady = this.loadSharedTemplate();

        this.createSprites();
    }

    async loadSharedTemplate() {
        try {
            const result = await loadSpriteFromJSON('assets/data/sprites/sprite_default.json');
            this.sharedTemplate = result.sprite;
            this.sharedImage = result.image;
            console.log('[Flock] Loaded shared template and image', !!this.sharedImage);
            
            // Apply to all sprites NOW (after loading completes)
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
            const common = {
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 100,
                vy: (Math.random() - 0.5) * 100,
                // Leave width/height at 0 so setImage will update them from sprite image
                width: 0,
                height: 0,
            };

            // Create simple Sprite instead of DefaultSprite to avoid 10k parallel loads
            const s = new Sprite({ ...common, sheetCols: 1, sheetRows: 1 });
            
            // Set collider immediately (circle-only) - use radius setting as fallback
            try {
                s.setCollider({ type: 'circle', radius: this.settings.radius });
            } catch (e) {
                console.warn('Failed to set sprite collider', e);
            }

            this.sprites.push(s);
        }
        
        // Template will be applied asynchronously via loadSharedTemplate()
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
            } else {
                s.setImage(image);
                try { s.setAnimation && s.setAnimation('default'); } catch (e) {}
            }
            // Note: template-provided scaling is applied inside `applyTemplate`.
            // When no template is provided (image-only), no automatic scaling is applied.
        }
    }

    // Keep `update` a no-op — Game manager handles scheduling and calls `applyForces`.
    update(dt) {
        return;
    }

    // Apply global flock forces to a single sprite (used by Game manager)
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
}
