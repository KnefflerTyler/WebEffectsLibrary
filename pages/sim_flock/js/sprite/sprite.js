'use strict';

import { SpriteAnimation } from './spriteAnimation.js';
import SpriteCollider from './spriteCollider.js';

// Sprite: holds a set of named animations and produces shader uniforms
// for the currently playing animation. Call `update(dt)` each frame.
export class Sprite {
    constructor({ x = 0, y = 0, vx = 0, vy = 0, sheetCols = 1, sheetRows = 1, alphaCutoff = 0.01, width = 0, height = 0 } = {}) {
        this.x = x;
        this.y = y;

        this.vx = vx;
        this.vy = vy;

        this.sheetCols = sheetCols;
        this.sheetRows = sheetRows;
        this.alphaCutoff = alphaCutoff;
        this.width = width;   // desired draw width in pixels (defaults to cell size once image set)
        this.height = height; // desired draw height in pixels

        this.animations = new Map();
        this.current = null;
        this.elapsed = 0; // seconds since current animation started

        this.image = null;
        this.cellWidth = 0;
        this.cellHeight = 0;

        // Optional collider attached to this sprite. Pass `collider` in
        // the constructor options to create one (see spriteCollider.js).
        this.collider = null;
        if (arguments[0] && arguments[0].collider) {
            try {
                this.collider = new SpriteCollider(this, arguments[0].collider);
            } catch (e) {
                console.warn('Failed to create SpriteCollider:', e);
            }
        }
    }

    setCollider(options) {
        if (this.collider) this.collider.clear();
        this.collider = new SpriteCollider(this, options);
        return this.collider;
    }

    removeCollider() {
        if (!this.collider) return;
        this.collider.clear();
        this.collider = null;
    }

    addAnimation(anim) {
        if (anim instanceof SpriteAnimation) {
            this.animations.set(anim.name, anim);
        } else {
            const a = new SpriteAnimation(anim);
            this.animations.set(a.name, a);
        }
    }

    setAnimation(name, { reset = true } = {}) {
        const a = this.animations.get(name);
        if (!a) throw new Error(`Unknown animation: ${name}`);
        this.current = a;
        if (reset) this.elapsed = 0;
    }

    update(dt, colliders) {
        this.elapsed += dt;

        // If colliders list not provided, just update animation timer
        if (!colliders) return;

        // Move by current velocity
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Handle collisions locally: move this sprite away and apply impulse
        if (this.collider) {
            const others = colliders.filter(c => c && c !== this.collider);
            for (const other of others) {
                if (!other) continue;
                if (!this.collider.intersects(other)) continue;

                const apos = this.collider.worldPos();
                const bpos = other.worldPos();
                let dx = apos.x - bpos.x;
                let dy = apos.y - bpos.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) {
                    dx = (Math.random() - 0.5) * 1e-3;
                    dy = (Math.random() - 0.5) * 1e-3;
                    dist = Math.sqrt(dx * dx + dy * dy) || 1e-3;
                }
                const nx = dx / dist;
                const ny = dy / dist;

                // Compute overlap (circle-only, simplified)
                const overlap = (this.collider.radius + (other.radius || 4)) - dist;
                if (overlap <= 0) continue;

                // Move this sprite away by the overlap amount
                this.x += nx * overlap;
                this.y += ny * overlap;

                // Apply velocity impulse based on the other collider's resolveStrength
                const strength = other.resolveStrength ?? 400;
                const impulse = strength * overlap * dt;
                this.vx += nx * impulse;
                this.vy += ny * impulse;

                // Emit collision callback for this collider
                const impulseVec = { x: nx * impulse, y: ny * impulse };
                for (const cb of this.collider._callbacks.collision) cb(other, impulseVec);
            }

            // Update enter/stay/exit triggers
            this.collider.checkAgainst(others);
        }
    }

    // Returns a plain object of uniforms that can be merged into a
    // Three.js material's `uniforms` each frame.
    getUniforms() {
        if (!this.current) return {};

        const anim = this.current;
        const fps = anim.fps;
        const start = anim.startCol;
        const end = anim.endCol;
        const frameCount = Math.max(1, end - start + 1);

        if (!anim.loop) {
            const frameIndex = Math.min(Math.floor(this.elapsed * fps), frameCount - 1);
            const absFrame = start + frameIndex;
            return {
                uTime: 0.0,
                uAnimSpeed: fps,
                uCols: this.sheetCols,
                uRows: this.sheetRows,
                uRow: anim.row,
                uStartCol: absFrame,
                uEndCol: absFrame,
                uFrameOffset: 0.0,
                uAlphaCutoff: this.alphaCutoff,
            };
        }

        return {
            uTime: this.elapsed,
            uAnimSpeed: fps,
            uCols: this.sheetCols,
            uRows: this.sheetRows,
            uRow: anim.row,
            uStartCol: start,
            uEndCol: end,
            uFrameOffset: 0.0,
            uAlphaCutoff: this.alphaCutoff,
        };
    }

    setImage(img) {
        this.image = img;
        if (!Sprite._hasLoggedSetImage) {
            console.log('[sprite] setImage called with', !!img, img?.width, 'x', img?.height);
            Sprite._hasLoggedSetImage = true;
        }
        if (img && this.sheetCols > 0 && this.sheetRows > 0) {
            this.cellWidth = Math.floor(img.width / this.sheetCols);
            this.cellHeight = Math.floor(img.height / this.sheetRows);
            if (!this.width) this.width = this.cellWidth;
            if (!this.height) this.height = this.cellHeight;
        }
    }

    // Apply a template Sprite (usually loaded from JSON) to this sprite.
    // Copies sheet dimensions and animations, and sets the provided image.
    applyTemplate(template, img) {
        if (!template) return;

        this.sheetCols = template.sheetCols ?? this.sheetCols;
        this.sheetRows = template.sheetRows ?? this.sheetRows;

        // copy animations
        this.animations = new Map();
        for (const [name, anim] of template.animations) {
            // shallow copy properties into a new SpriteAnimation
            this.animations.set(name, new SpriteAnimation({
                name: anim.name,
                row: anim.row,
                startCol: anim.startCol,
                endCol: anim.endCol,
                fps: anim.fps,
                loop: anim.loop,
            }));
        }

        if (img) this.setImage(img);

        // If the template supplies collider metadata (from JSON), apply it.
        const colFromTemplate = template.templateCollider ?? template.collider;
        if (colFromTemplate) {
            try {
                this.setCollider(colFromTemplate);
            } catch (e) {
                console.warn('applyTemplate: failed to set collider from template', e);
            }
        }

        // Apply template-level scale (if provided) to visual size and collider.
        const scale = template.templateScale ?? template.scale ?? 1;
        if (scale && scale !== 1) {
            if (this.width) this.width = Math.round(this.width * scale);
            if (this.height) this.height = Math.round(this.height * scale);
            if (this.collider && typeof this.collider.radius === 'number') {
                this.collider.radius = this.collider.radius * scale;
            }
        }

        // If the template defines a default resolveStrength, apply to collider resolveStrength
        if (template.templateResolveStrength !== undefined && this.collider) {
            this.collider.resolveStrength = template.templateResolveStrength;
        }

        // activate default animation if available
        if (this.animations.has('default')) this.setAnimation('default');
    }

    draw(ctx) {
        if (!Sprite._hasLoggedDraw) {
            console.log('[sprite] first draw at', this.x, this.y, 'size', this.width, this.height, 'sheet', this.sheetCols, 'x', this.sheetRows);
            Sprite._hasLoggedDraw = true;
        }
        if (this.image) {
            const anim = this.current;
            let frame = 0;
            let row = 0;
            if (anim) {
                const fps = anim.fps;
                const start = anim.startCol;
                const end = anim.endCol;
                const frameCount = Math.max(1, end - start + 1);

                if (!anim.loop) {
                    const frameIndex = Math.min(Math.floor(this.elapsed * fps), frameCount - 1);
                    frame = start + frameIndex;
                } else {
                    frame = start + Math.floor((this.elapsed * fps) % frameCount);
                }

                row = anim.row;
            }

            const sx = frame * this.cellWidth;
            const sy = row * this.cellHeight;

            const dx = Math.round(this.x - this.width / 2);
            const dy = Math.round(this.y - this.height / 2);

                ctx.drawImage(this.image, sx, sy, this.cellWidth, this.cellHeight, dx, dy, this.width, this.height);

                // Debug: draw collider outlines when enabled (image path)
                if (this.collider && Sprite.debugColliders) {
                    const pos = this.collider.worldPos();
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255,0,0,0.9)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 2]);
                    const r = this.collider.radius ?? Math.max(this.width, this.height) / 2 ?? 4;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                return;
            }

            // Fallback to circle if no image
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width || 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Debug: draw collider outlines when enabled (no image path)
            if (this.collider && Sprite.debugColliders) {
                const pos = this.collider.worldPos();
                ctx.save();
                ctx.strokeStyle = 'rgba(255,0,0,0.9)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 2]);
                const r = this.collider.radius ?? Math.max(this.width, this.height) / 2 ?? 4;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

}

export default Sprite;

// Toggle to render collider outlines for debugging
Sprite.debugColliders = false;
