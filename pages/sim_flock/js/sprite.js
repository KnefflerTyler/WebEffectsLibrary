'use strict';

import { SpriteAnimation } from './spriteAnimation.js';

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

    update(dt) {
        this.elapsed += dt;
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
            return;
        }

        // Fallback to circle if no image
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width || 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
}

export default Sprite;
