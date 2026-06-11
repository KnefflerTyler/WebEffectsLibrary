'use strict';

export class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.width = 0;
        this.height = 0;

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

        if (!CanvasRenderer._hasLoggedSprites) {
            try {
                console.log('[CanvasRenderer] drawSprites called. count=', Array.isArray(sprites) ? sprites.length : typeof sprites, 'firstHasDraw=', sprites && sprites[0] ? typeof sprites[0].draw : 'none');
            } catch (e) {
                console.log('[CanvasRenderer] drawSprites info unavailable', e);
            }
            CanvasRenderer._hasLoggedSprites = true;
        }

        for (const p of sprites) {
            if (p && typeof p.draw === 'function') {
                try {
                    p.draw(ctx);
                } catch (e) {
                    console.error('[CanvasRenderer] p.draw threw', e);
                }
            }
        }
    }
}