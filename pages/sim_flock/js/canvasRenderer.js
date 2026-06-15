'use strict';

export class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.width = 0;
        this.height = 0;

        // Performance optimizations
        this.enableCulling = true; // viewport culling
        this.cullMargin = 50; // pixels outside viewport to still render
        this.batchRendering = true; // group similar sprites
        this.useBatching = true; // batch sprites by image to reduce draw calls
        
        // Stats tracking
        this.stats = {
            totalSprites: 0,
            renderedSprites: 0,
            culledSprites: 0,
            drawCalls: 0
        };

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
    }

    render(sprites = []) {
        const ctx = this.ctx;
        if (!ctx) return;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        ctx.clearRect(0, 0, this.width, this.height);

        const background = ctx.createLinearGradient(0, 0, 0, this.height);
        background.addColorStop(0, '#0b1220');
        background.addColorStop(1, '#070a0f');

        ctx.fillStyle = background;
        ctx.fillRect(0, 0, this.width, this.height);

        this.drawSprites(sprites);
    }

    drawSprites(sprites) {
        const ctx = this.ctx;
        
        this.stats.totalSprites = sprites.length;
        this.stats.renderedSprites = 0;
        this.stats.culledSprites = 0;

        if (!CanvasRenderer._hasLoggedSprites) {
            try {
                console.log('[CanvasRenderer] drawSprites called. count=', Array.isArray(sprites) ? sprites.length : typeof sprites, 'firstHasDraw=', sprites && sprites[0] ? typeof sprites[0].draw : 'none');
            } catch (e) {
                console.log('[CanvasRenderer] drawSprites info unavailable', e);
            }
            CanvasRenderer._hasLoggedSprites = true;
        }

        if (this.enableCulling) {
            this.drawSpritesWithCulling(sprites);
        } else {
            this.drawSpritesSimple(sprites);
        }
    }

    // Simple draw without optimizations
    drawSpritesSimple(sprites) {
        const ctx = this.ctx;
        for (const p of sprites) {
            if (p && typeof p.draw === 'function') {
                try {
                    p.draw(ctx);
                    this.stats.renderedSprites++;
                } catch (e) {
                    console.error('[CanvasRenderer] p.draw threw', e);
                }
            }
        }
    }

    // Optimized draw with viewport culling
    drawSpritesWithCulling(sprites) {
        const ctx = this.ctx;
        const margin = this.cullMargin;
        const minX = -margin;
        const minY = -margin;
        const maxX = this.width + margin;
        const maxY = this.height + margin;

        // Batch sprites by image to reduce state changes
        if (this.useBatching && sprites.length > 1000) {
            this.drawSpritesBatched(sprites, minX, minY, maxX, maxY);
            return;
        }

        for (const p of sprites) {
            if (!p || typeof p.draw !== 'function') continue;

            // Viewport culling: skip sprites outside visible area
            const spriteSize = Math.max(p.width || 0, p.height || 0) || 10;
            const halfSize = spriteSize / 2;
            
            if (p.x + halfSize < minX || p.x - halfSize > maxX ||
                p.y + halfSize < minY || p.y - halfSize > maxY) {
                this.stats.culledSprites++;
                continue;
            }

            try {
                p.draw(ctx);
                this.stats.renderedSprites++;
            } catch (e) {
                console.error('[CanvasRenderer] p.draw threw', e);
            }
        }
    }

    // Batched rendering: group sprites by image and draw together
    drawSpritesBatched(sprites, minX, minY, maxX, maxY) {
        const ctx = this.ctx;
        this.stats.drawCalls = 0;
        
        // Group sprites by image source
        const batches = new Map();
        for (const p of sprites) {
            if (!p) continue;
            
            // Cull early
            const spriteSize = Math.max(p.width || 0, p.height || 0) || 10;
            const halfSize = spriteSize / 2;
            if (p.x + halfSize < minX || p.x - halfSize > maxX ||
                p.y + halfSize < minY || p.y - halfSize > maxY) {
                this.stats.culledSprites++;
                continue;
            }
            
            const imgKey = p.image ? (p.image.src || 'default') : 'fallback';
            if (!batches.has(imgKey)) {
                batches.set(imgKey, []);
            }
            batches.get(imgKey).push(p);
        }
        
        // Draw each batch
        for (const [imgKey, batch] of batches) {
            this.stats.drawCalls++;
            for (const p of batch) {
                try {
                    if (typeof p.draw === 'function') {
                        p.draw(ctx);
                        this.stats.renderedSprites++;
                    }
                } catch (e) {
                    console.error('[CanvasRenderer] batched draw threw', e);
                }
            }
        }
    }

    getStats() {
        return { ...this.stats };
    }
}