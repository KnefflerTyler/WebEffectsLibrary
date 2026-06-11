'use strict';

import Sprite from './sprite.js';

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

        this.createSprites();
    }

    createSprites() {
        this.sprites.length = 0;
        for (let i = 0; i < this.count; i++) {
            const s = new Sprite({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 100,
                vy: (Math.random() - 0.5) * 100,
                // default visual size based on flock settings radius
                width: this.settings.radius * 2,
                height: this.settings.radius * 2,
            });

            this.sprites.push(s);
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
            } else {
                s.setImage(image);
                try { s.setAnimation && s.setAnimation('default'); } catch (e) {}
            }
        }
    }

    update(dt) {
        const targetX = this.target.x;
        const targetY = this.target.y;

        for (const p of this.sprites) {
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

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            // Advance sprite animation timers if available
            if (typeof p.update === 'function') p.update(dt);
        }
    }
}