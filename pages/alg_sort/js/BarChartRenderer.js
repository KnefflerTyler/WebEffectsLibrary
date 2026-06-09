'use strict';

export class BarChartRenderer {
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

    render(values, state = {}) {
        const ctx = this.ctx;
        if (!ctx) return;

        const algorithmName = state.algorithmName ?? 'Sorting';
        const sortedMask = state.sortedMask ?? [];
        const currentIndex = state.currentIndex;
        const comparisonIndex = state.comparisonIndex;
        const stepType = state.stepType ?? null;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);

        const background = ctx.createLinearGradient(0, 0, 0, this.height);
        background.addColorStop(0, '#0b1220');
        background.addColorStop(1, '#070a0f');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, this.width, this.height);

        const count = values.length;
        if (!count) return;

        const padX = Math.max(16, Math.floor(this.width * 0.04));
        const padY = Math.max(28, Math.floor(this.height * 0.12));
        const chartW = this.width - padX * 2;
        const chartH = this.height - padY * 2;
        const maxVal = Math.max(...values, 1);
        const minVal = Math.min(...values, 0);
        const range = Math.max(1, maxVal - minVal);
        const barGap = Math.max(1, Math.floor(chartW / count * 0.18));
        const barW = chartW / count;

        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 4; i++) {
            const y = padY + Math.round((chartH / 4) * i);
            ctx.fillRect(padX, y, chartW, 1);
        }

        for (let i = 0; i < count; i++) {
            const value = values[i];
            const normalized = (value - minVal) / range;
            const barH = Math.max(4, normalized * chartH);
            const x = padX + i * barW + barGap * 0.5;
            const y = this.height - padY - barH;
            const w = Math.max(2, barW - barGap);

            let color = '#8b949e';
            if (sortedMask[i]) color = '#20c997';
            if (i === currentIndex) {
                color = stepType === 'compare' ? '#ff922b' : '#4a9eff';
            } else if (i === comparisonIndex) {
                color = '#4ac7ff';
            }

            const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
            if (color === '#20c997') {
                gradient.addColorStop(0, '#64e0b9');
                gradient.addColorStop(1, '#20c997');
            } else if (color === '#4a9eff') {
                gradient.addColorStop(0, '#7fb8ff');
                gradient.addColorStop(1, '#4a9eff');
            } else if (color === '#4ac7ff') {
                gradient.addColorStop(0, '#7ee3ff');
                gradient.addColorStop(1, '#4ac7ff');
            } else if (color === '#ff922b') {
                gradient.addColorStop(0, '#ffb35c');
                gradient.addColorStop(1, '#ff922b');
            } else {
                gradient.addColorStop(0, '#b4bdc7');
                gradient.addColorStop(1, '#8b949e');
            }

            ctx.fillStyle = gradient;
            this._roundRect(ctx, x, y, w, barH, 4);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(algorithmName, padX, 30);

        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.font = '500 12px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(`${count} bars`, padX, 48);
    }

    _roundRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }
}
