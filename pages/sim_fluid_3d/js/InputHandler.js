/**
 * InputHandler — wraps all DOM input events on the WebGL canvas and
 * emits clean named callbacks.  Keeps no simulation state itself.
 *
 * Mouse conventions
 * ─────────────────
 *  Left drag  (paint mode)  → onPaint(screenX, screenY, dvx, dvy)
 *  Left click (faucet/drain)→ onPlace(screenX, screenY)
 *  Right drag               → onOrbit(dAz, dEl)       (always)
 *  Right click              → onRemove(screenX, screenY)
 *  Scroll wheel             → onZoom(delta)
 *
 * Keyboard shortcuts (bound on window)
 * ─────────────────────────────────────
 *  P → paint  |  F → faucet  |  D → drain
 *  C → clear  |  R → reset camera
 */
export class InputHandler {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{
     *   onPaint:  (sx, sy, dvx, dvy) => void,
     *   onPlace:  (sx, sy) => void,
     *   onRemove: (sx, sy) => void,
     *   onOrbit:  (dAz, dEl) => void,
     *   onZoom:   (delta) => void,
     *   onClear:  () => void,
     *   onResetCamera: () => void,
     * }} callbacks
     */
    constructor(canvas, callbacks) {
        this.canvas    = canvas;
        this._cb       = callbacks;
        this._mode     = 'paint';   // 'paint' | 'faucet' | 'drain'
        this._painting = false;     // left button held in paint mode
        this._orbiting = false;     // right button held
        this._lastX    = 0;
        this._lastY    = 0;
        this._curX     = 0;
        this._curY     = 0;

        this._bindMouse();
        this._bindTouch();
        this._bindKeyboard();
    }

    // ── Public API ────────────────────────────────────────────────────────

    get mode() { return this._mode; }

    get cursorScreen() { return { x: this._curX, y: this._curY }; }

    setMode(m) {
        this._mode = m;
        this.canvas.style.cursor = m === 'paint' ? 'crosshair' : 'cell';
        document.querySelectorAll('.mode-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.mode === m));
    }

    // ── Mouse ─────────────────────────────────────────────────────────────

    _bindMouse() {
        const c = this.canvas;

        c.addEventListener('mousedown', e => {
            e.preventDefault();
            if (e.button === 0) {
                this._painting = true;
                this._lastX = e.clientX; this._lastY = e.clientY;
                if (this._mode !== 'paint') this._cb.onPlace(e.clientX, e.clientY);
            } else if (e.button === 2) {
                this._orbiting = true;
                this._lastX = e.clientX; this._lastY = e.clientY;
                this._cb.onRemove(e.clientX, e.clientY);
            }
        });

        c.addEventListener('mousemove', e => {
            this._curX = e.clientX; this._curY = e.clientY;
            const dx = e.clientX - this._lastX;
            const dy = e.clientY - this._lastY;

            if (this._painting && this._mode === 'paint')
                this._cb.onPaint(e.clientX, e.clientY, dx, dy);

            if (this._orbiting)
                this._cb.onOrbit(dx * 0.35, -dy * 0.35);

            this._lastX = e.clientX; this._lastY = e.clientY;
        });

        c.addEventListener('mouseup',    e => {
            if (e.button === 0) this._painting = false;
            if (e.button === 2) this._orbiting = false;
        });
        c.addEventListener('mouseleave', () => {
            this._painting = false; this._orbiting = false;
        });
        c.addEventListener('contextmenu', e => e.preventDefault());

        c.addEventListener('wheel', e => {
            e.preventDefault();
            this._cb.onZoom(e.deltaY * 0.004);
        }, { passive: false });
    }

    // ── Touch ─────────────────────────────────────────────────────────────

    _bindTouch() {
        const c = this.canvas;

        c.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.touches[0];
            this._lastX = t.clientX; this._lastY = t.clientY;
            this._curX  = t.clientX; this._curY  = t.clientY;
            this._painting = true;
            if (this._mode !== 'paint') this._cb.onPlace(t.clientX, t.clientY);
        }, { passive: false });

        c.addEventListener('touchmove', e => {
            e.preventDefault();
            const t = e.touches[0];
            this._curX = t.clientX; this._curY = t.clientY;
            if (this._mode === 'paint')
                this._cb.onPaint(t.clientX, t.clientY,
                    t.clientX - this._lastX, t.clientY - this._lastY);
            this._lastX = t.clientX; this._lastY = t.clientY;
        }, { passive: false });

        c.addEventListener('touchend', () => { this._painting = false; });
    }

    // ── Keyboard ──────────────────────────────────────────────────────────

    _bindKeyboard() {
        window.addEventListener('keydown', e => {
            if (e.target !== document.body && e.target.tagName !== 'CANVAS') return;
            switch (e.key.toLowerCase()) {
                case 'p': this.setMode('paint');  break;
                case 'f': this.setMode('faucet'); break;
                case 'd': this.setMode('drain');  break;
                case 'c': this._cb.onClear();     break;
                case 'r': this._cb.onResetCamera(); break;
            }
        });
    }
}
