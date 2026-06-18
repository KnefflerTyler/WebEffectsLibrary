'use strict';

import Sprite from './sprite/sprite.js';

export class CanvasRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;

        this.ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });

        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.width = 0;
        this.height = 0;

        this.enableCulling = options.enableCulling ?? true;
        this.cullMargin = options.cullMargin ?? 80;

        this.useBatching = options.useBatching ?? true;
        this.batchThreshold = options.batchThreshold ?? 300;

        this.useFastImagePath = options.useFastImagePath ?? true;
        this.debugDrawErrors = options.debugDrawErrors ?? false;

        // Main bool check. You can set renderer.debugColliders = true/false.
        // It also respects Sprite.debugColliders for compatibility.
        this.debugColliders = options.debugColliders ?? false;

        this.backgroundTop = options.backgroundTop ?? '#0b1220';
        this.backgroundBottom = options.backgroundBottom ?? '#070a0f';
        this.background = null;

        this.stats = {
            totalSprites: 0,
            renderedSprites: 0,
            culledSprites: 0,
            drawCalls: 0,
            batches: 0,
            fallbackDraws: 0,
            colliderOutlines: 0
        };

        this._batches = new Map();
        this._visibleFallbackSprites = [];

        this.resize();
    }

    resize() {
        this.dpr = Math.max(1, window.devicePixelRatio || 1);

        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);

        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        this.background = ctx.createLinearGradient(0, 0, 0, this.height);
        this.background.addColorStop(0, this.backgroundTop);
        this.background.addColorStop(1, this.backgroundBottom);

        ctx.imageSmoothingEnabled = false;
    }

    render(sprites = []) {
        const ctx = this.ctx;
        if (!ctx) return;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        this.clearAndDrawBackground(ctx);
        this.drawSprites(sprites);
    }

    clearAndDrawBackground(ctx) {
        ctx.fillStyle = this.background;
        ctx.fillRect(0, 0, this.width, this.height);
    }

    drawSprites(sprites) {
        const stats = this.stats;

        stats.totalSprites = sprites.length;
        stats.renderedSprites = 0;
        stats.culledSprites = 0;
        stats.drawCalls = 0;
        stats.batches = 0;
        stats.fallbackDraws = 0;
        stats.colliderOutlines = 0;

        if (!sprites || sprites.length === 0) return;

        if (this.useBatching && sprites.length >= this.batchThreshold) {
            this.drawSpritesBatched(sprites);
        } else {
            this.drawSpritesSimple(sprites);
        }

        if (this.debugColliders || Sprite.debugColliders) {
            this.drawColliderOutlines(sprites);
        }
    }

    drawSpritesSimple(sprites) {
        const ctx = this.ctx;
        const stats = this.stats;

        const margin = this.enableCulling ? this.cullMargin : 999999;
        const minX = -margin;
        const minY = -margin;
        const maxX = this.width + margin;
        const maxY = this.height + margin;

        for (let i = 0; i < sprites.length; i++) {
            const p = sprites[i];
            if (!p) continue;

            if (this.enableCulling && !this.isSpriteVisible(p, minX, minY, maxX, maxY)) {
                stats.culledSprites++;
                continue;
            }

            if (this.useFastImagePath && this.canFastDraw(p)) {
                this.fastDrawSprite(ctx, p);
                stats.renderedSprites++;
                stats.drawCalls++;
                continue;
            }

            this.drawSpriteFallback(ctx, p);
        }
    }

    drawSpritesBatched(sprites) {
        const ctx = this.ctx;
        const stats = this.stats;

        const margin = this.enableCulling ? this.cullMargin : 999999;
        const minX = -margin;
        const minY = -margin;
        const maxX = this.width + margin;
        const maxY = this.height + margin;

        const batches = this._batches;
        const fallback = this._visibleFallbackSprites;

        batches.clear();
        fallback.length = 0;

        for (let i = 0; i < sprites.length; i++) {
            const p = sprites[i];
            if (!p) continue;

            if (this.enableCulling && !this.isSpriteVisible(p, minX, minY, maxX, maxY)) {
                stats.culledSprites++;
                continue;
            }

            if (this.useFastImagePath && this.canFastDraw(p)) {
                const image = this.getSpriteImage(p);

                let batch = batches.get(image);
                if (!batch) {
                    batch = [];
                    batches.set(image, batch);
                }

                batch.push(p);
            } else {
                fallback.push(p);
            }
        }

        for (const batch of batches.values()) {
            stats.batches++;

            for (let i = 0; i < batch.length; i++) {
                this.fastDrawSprite(ctx, batch[i]);
                stats.renderedSprites++;
                stats.drawCalls++;
            }
        }

        for (let i = 0; i < fallback.length; i++) {
            this.drawSpriteFallback(ctx, fallback[i]);
        }
    }

    canFastDraw(sprite) {
        const image = this.getSpriteImage(sprite);

        if (!image) return false;

        if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
            return true;
        }

        if (image instanceof HTMLCanvasElement) {
            return image.width > 0 && image.height > 0;
        }

        if (image instanceof HTMLVideoElement) {
            return image.readyState >= 2;
        }

        if (!image.complete || image.width <= 0 || image.height <= 0) {
            return false;
        }

        if (sprite.forceFallbackDraw) {
            return false;
        }

        return true;
    }

    fastDrawSprite(ctx, sprite) {
        const image = this.getSpriteImage(sprite);
        if (!image) return;

        const x = sprite.x || 0;
        const y = sprite.y || 0;

        const imageWidth = image.width || image.videoWidth || 1;
        const imageHeight = image.height || image.videoHeight || 1;

        const source = this.getSpriteSourceRect(sprite, imageWidth, imageHeight);

        // Display size should be the sprite cell size, not the full sheet size.
        const width =
            sprite.width ||
            sprite.renderWidth ||
            sprite.size ||
            source.sw ||
            imageWidth;

        const height =
            sprite.height ||
            sprite.renderHeight ||
            sprite.size ||
            source.sh ||
            imageHeight;

        const alpha = sprite.alpha ?? 1;
        const rotation = sprite.rotation || 0;

        const dx = x - width * 0.5;
        const dy = y - height * 0.5;

        const hasAlpha = alpha < 1;
        const hasRotation = rotation !== 0;

        if (!hasAlpha && !hasRotation) {
            ctx.drawImage(
                image,
                source.sx,
                source.sy,
                source.sw,
                source.sh,
                dx,
                dy,
                width,
                height
            );
            return;
        }

        ctx.save();

        if (hasAlpha) {
            ctx.globalAlpha = alpha;
        }

        if (hasRotation) {
            ctx.translate(x, y);
            ctx.rotate(rotation);

            ctx.drawImage(
                image,
                source.sx,
                source.sy,
                source.sw,
                source.sh,
                -width * 0.5,
                -height * 0.5,
                width,
                height
            );
        } else {
            ctx.drawImage(
                image,
                source.sx,
                source.sy,
                source.sw,
                source.sh,
                dx,
                dy,
                width,
                height
            );
        }

        ctx.restore();
    }

    drawSpriteFallback(ctx, sprite) {
        if (typeof sprite.draw !== 'function') return;

        if (this.debugDrawErrors) {
            try {
                sprite.draw(ctx);
            } catch (e) {
                console.error('[CanvasRenderer] sprite draw failed', e, sprite);
                return;
            }
        } else {
            sprite.draw(ctx);
        }

        this.stats.renderedSprites++;
        this.stats.drawCalls++;
        this.stats.fallbackDraws++;
    }

    drawColliderOutlines(sprites) {
        const ctx = this.ctx;
        if (!ctx) return;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);

        for (let i = 0; i < sprites.length; i++) {
            const sprite = sprites[i];
            const collider = sprite?.collider;

            if (!sprite || !collider) continue;

            this.drawSingleColliderOutline(ctx, sprite, collider);
            this.stats.colliderOutlines++;
        }

        ctx.restore();
    }

    drawSingleColliderOutline(ctx, sprite, collider) {
        const pos = this.getColliderWorldPosition(sprite, collider);
        const type = collider.type;

        if (type === 'square' || type === 'rect' || type === 'rectangle') {
            const width = this.getColliderWidth(sprite, collider);
            const height = this.getColliderHeight(sprite, collider);

            ctx.strokeRect(
                pos.x - width * 0.5,
                pos.y - height * 0.5,
                width,
                height
            );

            return;
        }

        const radius = this.getColliderRadius(sprite, collider);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    getColliderWorldPosition(sprite, collider) {
        if (typeof collider.worldPos === 'function') {
            return collider.worldPos();
        }

        return {
            x: collider.x ?? sprite.x ?? 0,
            y: collider.y ?? sprite.y ?? 0
        };
    }

    getColliderWidth(sprite, collider) {
        const width =
            collider.width ??
            ((collider.halfWidth ?? 0) * 2);

        return (
            width ||
            sprite.width ||
            sprite.renderWidth ||
            sprite.size ||
            16
        );
    }

    getColliderHeight(sprite, collider) {
        const height =
            collider.height ??
            ((collider.halfHeight ?? 0) * 2);

        return (
            height ||
            sprite.height ||
            sprite.renderHeight ||
            sprite.size ||
            16
        );
    }

    getColliderRadius(sprite, collider) {
        const spriteSize = Math.max(
            sprite.width || sprite.renderWidth || sprite.size || 0,
            sprite.height || sprite.renderHeight || sprite.size || 0
        );

        const radius =
            collider.radius ??
            spriteSize * 0.5;

        return radius || 8;
    }

    getSpriteImage(sprite) {
        return sprite.image || sprite.img || sprite.texture || sprite.bitmap || null;
    }

    getSpriteSheetData(sprite) {
        const cols =
            sprite.sheetCols ??
            sprite.cols ??
            sprite.uCols ??
            sprite.animCols ??
            1;

        const rows =
            sprite.sheetRows ??
            sprite.rows ??
            sprite.uRows ??
            sprite.animRows ??
            1;

        const row =
            sprite.row ??
            sprite.frameRow ??
            sprite.animRow ??
            sprite.uRow ??
            0;

        const startCol =
            sprite.startCol ??
            sprite.animStartCol ??
            sprite.uStartCol ??
            0;

        const endCol =
            sprite.endCol ??
            sprite.animEndCol ??
            sprite.uEndCol ??
            cols - 1;

        const animSpeed =
            sprite.animSpeed ??
            sprite.animationSpeed ??
            sprite.uAnimSpeed ??
            0;

        const frameOffset =
            sprite.frameOffset ??
            sprite.uFrameOffset ??
            sprite._flockId ??
            0;

        return {
            cols,
            rows,
            row,
            startCol,
            endCol,
            animSpeed,
            frameOffset
        };
    }

    getSpriteSourceRect(sprite, imageWidth, imageHeight) {
        // Explicit source rect takes priority.
        if (
            sprite.sx !== undefined ||
            sprite.sourceX !== undefined ||
            sprite.frameX !== undefined
        ) {
            return {
                sx: sprite.sx ?? sprite.sourceX ?? sprite.frameX ?? 0,
                sy: sprite.sy ?? sprite.sourceY ?? sprite.frameY ?? 0,
                sw: sprite.sw ?? sprite.sourceWidth ?? sprite.frameWidth ?? imageWidth,
                sh: sprite.sh ?? sprite.sourceHeight ?? sprite.frameHeight ?? imageHeight
            };
        }

        // Shader-equivalent row/column animation.
        const sheet = this.getSpriteSheetData(sprite);

        const cols = Math.max(1, sheet.cols);
        const rows = Math.max(1, sheet.rows);

        const startC = this.clamp(sheet.startCol, 0, cols - 1);
        const endC = this.clamp(sheet.endCol, 0, cols - 1);

        const frameCount = Math.max(1, endC - startC + 1);

        const time = performance.now() / 1000;

        const localFrame = Math.floor(
            this.mod(time * sheet.animSpeed + sheet.frameOffset, frameCount)
        );

        const frame = startC + localFrame;
        const row = this.clamp(sheet.row, 0, rows - 1);

        const cellWidth = imageWidth / cols;
        const cellHeight = imageHeight / rows;

        return {
            sx: frame * cellWidth,
            sy: row * cellHeight,
            sw: cellWidth,
            sh: cellHeight
        };
    }

    isSpriteVisible(sprite, minX, minY, maxX, maxY) {
        const image = this.getSpriteImage(sprite);

        const imageWidth = image?.width || image?.videoWidth || 16;
        const imageHeight = image?.height || image?.videoHeight || 16;

        const source = image
            ? this.getSpriteSourceRect(sprite, imageWidth, imageHeight)
            : { sw: 16, sh: 16 };

        const x = sprite.x || 0;
        const y = sprite.y || 0;

        const width = sprite.width || sprite.renderWidth || sprite.size || source.sw || imageWidth;
        const height = sprite.height || sprite.renderHeight || sprite.size || source.sh || imageHeight;

        const halfW = width * 0.5;
        const halfH = height * 0.5;

        return !(
            x + halfW < minX ||
            x - halfW > maxX ||
            y + halfH < minY ||
            y - halfH > maxY
        );
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    mod(value, divisor) {
        return ((value % divisor) + divisor) % divisor;
    }

    getStats() {
        return { ...this.stats };
    }

    destroy() {
        // CanvasRenderer does not allocate external resources,
        // but this keeps API compatibility with WebGLRenderer.
    }
}

export default CanvasRenderer;