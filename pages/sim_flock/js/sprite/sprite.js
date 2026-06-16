'use strict';

import { SpriteAnimation } from './spriteAnimation.js';
import SpriteCollider from './spriteCollider.js';

// Sprite: holds a set of named animations and produces shader uniforms
// for the currently playing animation. Call `update(dt)` each frame.
export class Sprite {
    constructor({
        x = 0,
        y = 0,
        vx = 0,
        vy = 0,
        sheetCols = 1,
        sheetRows = 1,
        alphaCutoff = 0.01,
        width = 0,
        height = 0,
        collider = null,
    } = {}) {
        this.x = x;
        this.y = y;

        this.vx = vx;
        this.vy = vy;

        this.sheetCols = sheetCols;
        this.sheetRows = sheetRows;
        this.alphaCutoff = alphaCutoff;

        this.width = width;
        this.height = height;

        this.animations = new Map();
        this.current = null;
        this.elapsed = 0;

        this.image = null;
        this.cellWidth = 0;
        this.cellHeight = 0;

        this.collider = null;

        if (collider) {
            try {
                this.collider = new SpriteCollider(this, collider);
            } catch (e) {
                console.warn('Failed to create SpriteCollider:', e);
            }
        }
    }

    setCollider(options) {
        if (this.collider) {
            this.collider.clear();
        }

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
            return;
        }

        const a = new SpriteAnimation(anim);
        this.animations.set(a.name, a);
    }

    setAnimation(name, { reset = true } = {}) {
        const a = this.animations.get(name);

        if (!a) {
            throw new Error(`Unknown animation: ${name}`);
        }

        this.current = a;

        if (reset) {
            this.elapsed = 0;
        }
    }

    // IMPORTANT:
    // This only updates animation time and velocity-based movement.
    // Collision resolution should happen globally in your main loop,
    // not inside each individual sprite update.
    update(dt) {
        this.elapsed += dt;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    getUniforms() {
        if (!this.current) return {};

        const anim = this.current;
        const fps = anim.fps;
        const start = anim.startCol;
        const end = anim.endCol;
        const frameCount = Math.max(1, end - start + 1);

        if (!anim.loop) {
            const frameIndex = Math.min(
                Math.floor(this.elapsed * fps),
                frameCount - 1
            );

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
            console.log(
                '[sprite] setImage called with',
                !!img,
                img?.width,
                'x',
                img?.height
            );

            Sprite._hasLoggedSetImage = true;
        }

        if (img && this.sheetCols > 0 && this.sheetRows > 0) {
            this.cellWidth = Math.floor(img.width / this.sheetCols);
            this.cellHeight = Math.floor(img.height / this.sheetRows);

            if (!this.width) {
                this.width = this.cellWidth;
            }

            if (!this.height) {
                this.height = this.cellHeight;
            }
        }
    }

    // Apply a template Sprite, usually loaded from JSON, to this sprite.
    applyTemplate(template, img) {
        if (!template) return;

        this.sheetCols = template.sheetCols ?? this.sheetCols;
        this.sheetRows = template.sheetRows ?? this.sheetRows;

        this.animations = new Map();

        for (const [name, anim] of template.animations) {
            this.animations.set(
                name,
                new SpriteAnimation({
                    name: anim.name,
                    row: anim.row,
                    startCol: anim.startCol,
                    endCol: anim.endCol,
                    fps: anim.fps,
                    loop: anim.loop,
                })
            );
        }

        if (img) {
            this.setImage(img);
        }

        const colFromTemplate = template.templateCollider ?? template.collider;

        if (colFromTemplate) {
            try {
                this.setCollider({
                    ...colFromTemplate,
                    resolveStrength:
                        colFromTemplate.resolveStrength ??
                        template.templateResolveStrength ??
                        template.resolveStrength ??
                        1,
                });
            } catch (e) {
                console.warn('applyTemplate: failed to set collider from template', e);
            }
        }

        const scale = template.templateScale ?? template.scale ?? 1;

        if (scale && scale !== 1) {
            if (this.width) {
                this.width = Math.round(this.width * scale);
            }

            if (this.height) {
                this.height = Math.round(this.height * scale);
            }

            if (this.collider) {
                if (typeof this.collider.radius === 'number') {
                    this.collider.radius *= scale;
                }

                if (typeof this.collider.halfWidth === 'number') {
                    this.collider.halfWidth *= scale;
                }

                if (typeof this.collider.halfHeight === 'number') {
                    this.collider.halfHeight *= scale;
                }
            }
        }

        const resolveStrength =
            template.templateResolveStrength ??
            template.resolveStrength;

        if (resolveStrength !== undefined && this.collider) {
            this.collider.resolveStrength = resolveStrength;
        }

        if (this.animations.has('default')) {
            this.setAnimation('default');
        }
    }

    draw(ctx) {
        if (!Sprite._hasLoggedDraw) {
            console.log(
                '[sprite] first draw at',
                this.x,
                this.y,
                'size',
                this.width,
                this.height,
                'sheet',
                this.sheetCols,
                'x',
                this.sheetRows
            );

            Sprite._hasLoggedDraw = true;
        }

        if (this.image) {
            this._drawImageSprite(ctx);
            return;
        }

        this._drawFallbackSprite(ctx);
    }

    _drawImageSprite(ctx) {
        const anim = this.current;

        let frame = 0;
        let row = 0;

        if (anim) {
            const fps = anim.fps;
            const start = anim.startCol;
            const end = anim.endCol;
            const frameCount = Math.max(1, end - start + 1);

            if (!anim.loop) {
                const frameIndex = Math.min(
                    Math.floor(this.elapsed * fps),
                    frameCount - 1
                );

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

        ctx.drawImage(
            this.image,
            sx,
            sy,
            this.cellWidth,
            this.cellHeight,
            dx,
            dy,
            this.width,
            this.height
        );

        this._drawDebugCollider(ctx);
    }

    _drawFallbackSprite(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width || 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        this._drawDebugCollider(ctx);
    }

    _drawDebugCollider(ctx) {
        if (!this.collider || !Sprite.debugColliders) return;

        const pos = this.collider.worldPos();

        ctx.save();
        ctx.strokeStyle = 'rgba(255,0,0,0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);

        if (this.collider.type === 'square' || this.collider.type === 'rect') {
            const w =
                this.collider.width ??
                this.collider.halfWidth * 2 ??
                this.width ??
                8;

            const h =
                this.collider.height ??
                this.collider.halfHeight * 2 ??
                this.height ??
                8;

            ctx.strokeRect(
                pos.x - w / 2,
                pos.y - h / 2,
                w,
                h
            );
        } else {
            const r =
                this.collider.radius ??
                Math.max(this.width, this.height) / 2 ??
                4;

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

export default Sprite;

// Toggle to render collider outlines for debugging
Sprite.debugColliders = false;