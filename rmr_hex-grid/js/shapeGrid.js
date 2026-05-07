import { THREE_CDN, DEFAULTS } from './config.js';
import { LINE_VERTEX, LINE_FRAGMENT } from './shaders.js';

// ── Shared edge-deduplication helpers ────────────────────────────────────────
const PREC  = 10;
const round = v => Math.round(v * PREC) / PREC;

function edgeKey(x1, y1, x2, y2) {
    const ax = round(x1), ay = round(y1);
    const bx = round(x2), by = round(y2);
    if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay}|${bx},${by}`;
    return `${bx},${by}|${ax},${ay}`;
}

function addEdge(seen, verts, x1, y1, x2, y2) {
    const key = edgeKey(x1, y1, x2, y2);
    if (!seen.has(key)) {
        seen.add(key);
        verts.push(x1, y1, 0, x2, y2, 0);
    }
}

// ── Layout builders ───────────────────────────────────────────────────────────

function buildHex(w, h, S) {
    // Flat-top hexagons.  S = circumradius.
    const hx      = 1.5 * S;
    const hy      = Math.sqrt(3) * S;
    const cols    = Math.ceil(w / hx) + 2;
    const rows    = Math.ceil(h / hy) + 2;
    const originX = -((cols - 1) * hx) / 2;
    const originY = -((rows - 1) * hy) / 2;

    const seen = new Set(), verts = [];
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const cx = originX + col * hx;
            const cy = originY + row * hy + (col % 2 === 1 ? hy / 2 : 0);
            const vx = [], vy = [];
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3;
                vx[i] = cx + S * Math.cos(a);
                vy[i] = cy + S * Math.sin(a);
            }
            for (let i = 0; i < 6; i++) {
                const j = (i + 1) % 6;
                addEdge(seen, verts, vx[i], vy[i], vx[j], vy[j]);
            }
        }
    }
    return new Float32Array(verts);
}

function buildSquare(w, h, S) {
    // Axis-aligned squares.  S = side length.
    const cols    = Math.ceil(w / S) + 2;
    const rows    = Math.ceil(h / S) + 2;
    const originX = -((cols - 1) * S) / 2;
    const originY = -((rows - 1) * S) / 2;

    const seen = new Set(), verts = [];
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const x0 = originX + col * S;
            const y0 = originY + row * S;
            const x1 = x0 + S, y1 = y0 + S;
            addEdge(seen, verts, x0, y0, x1, y0);
            addEdge(seen, verts, x1, y0, x1, y1);
            addEdge(seen, verts, x1, y1, x0, y1);
            addEdge(seen, verts, x0, y1, x0, y0);
        }
    }
    return new Float32Array(verts);
}

function buildTriangle(w, h, S) {
    // Equilateral triangles, alternating up/down rows.  S = side length.
    // Slot (r,c): up-pointing when (r+c) is even, down-pointing when odd.
    const ht      = S * Math.sqrt(3) / 2;
    const slotW   = S / 2;
    const nCols   = Math.ceil(w / slotW) + 4;
    const nRows   = Math.ceil(h / ht)   + 2;
    const originX = -(nCols * slotW) / 2;
    const originY = -(nRows * ht)    / 2;

    const seen = new Set(), verts = [];
    for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < nCols; c++) {
            const x0 = originX + c * slotW;
            const y0 = originY + r * ht;
            const y1 = y0 + ht;
            const xR = x0 + S;

            if ((r + c) % 2 === 0) {
                // Up-pointing ▲: base at y0, apex at y1
                addEdge(seen, verts, x0, y0, xR, y0);
                addEdge(seen, verts, x0, y0, x0 + slotW, y1);
                addEdge(seen, verts, xR, y0, x0 + slotW, y1);
            } else {
                // Down-pointing ▽: base at y1, apex at y0
                addEdge(seen, verts, x0, y1, xR, y1);
                addEdge(seen, verts, x0, y1, x0 + slotW, y0);
                addEdge(seen, verts, xR, y1, x0 + slotW, y0);
            }
        }
    }
    return new Float32Array(verts);
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Render a static tessellating shape grid that fills the full viewport.
 * Controlled by cfg.shape: 'hex' | 'square' | 'triangle'.
 *
 * @param {string} [containerId='pageBackground']
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startShapeGrid(containerId = 'pageBackground', options = {}) {
    const THREE = await import(THREE_CDN);
    const cfg   = { ...DEFAULTS, ...options };

    // ── Container ─────────────────────────────────────────────────────────────
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`No element found with id "${containerId}"`);
    if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);

    const canvas          = renderer.domElement;
    canvas.style.display  = 'block';
    canvas.style.position = 'absolute';
    canvas.style.inset    = '0';
    canvas.style.zIndex   = '-1';
    container.appendChild(canvas);

    // ── Scene — orthographic camera, 1 world unit = 1 pixel ──────────────────
    const scene = new THREE.Scene();
    let camera;
    let linesMesh      = null;
    let currentPosArray = null; // Float32Array of vertex positions (world pixels)
    let alphaBuf        = null; // Float32Array CPU-side lerp state, one value per vertex
    let canvasW = 0, canvasH = 0;

    // ── Mouse state (world / pixel coords) ───────────────────────────────────
    const mouse     = { wx: Infinity, wy: Infinity };
    let lastClientX = Infinity;
    let lastClientY = Infinity;

    function updateMouseWorld() {
        if (lastClientX === Infinity) return;
        const rect = canvas.getBoundingClientRect();
        mouse.wx   = (lastClientX - rect.left) - canvasW / 2;
        mouse.wy   = canvasH / 2 - (lastClientY - rect.top);
    }

    function onMouseMove(e) {
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        updateMouseWorld();
    }

    container.addEventListener('mousemove',  onMouseMove);
    container.addEventListener('mouseleave', () => {
        mouse.wx = mouse.wy = Infinity;
        lastClientX = lastClientY = Infinity;
    });
    window.addEventListener('scroll', updateMouseWorld, { passive: true });

    // ── Build / rebuild ───────────────────────────────────────────────────────
    function buildGrid(w, h) {
        canvasW = w;
        canvasH = h;
        camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, -1, 1);

        const S = cfg.cellSize;
        let posArray;
        switch (cfg.shape) {
            case 'square':   posArray = buildSquare(w, h, S);   break;
            case 'triangle': posArray = buildTriangle(w, h, S); break;
            default:         posArray = buildHex(w, h, S);      break;
        }

        if (linesMesh) {
            scene.remove(linesMesh);
            linesMesh.geometry.dispose();
            linesMesh.material.dispose();
        }

        const vertCount  = posArray.length / 3;
        currentPosArray  = posArray;
        alphaBuf         = new Float32Array(vertCount);
        const alphaGpu   = new Float32Array(vertCount);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        geo.setAttribute('aAlpha',
            new THREE.BufferAttribute(alphaGpu, 1).setUsage(THREE.DynamicDrawUsage));

        const mat = new THREE.ShaderMaterial({
            transparent:    true,
            depthWrite:     false,
            vertexShader:   LINE_VERTEX,
            fragmentShader: LINE_FRAGMENT,
            uniforms: {
                uColor:      { value: new THREE.Color(cfg.color) },
                uHoverColor: { value: new THREE.Color(cfg.hoverColor) },
                uMinOpacity: { value: cfg.opacity },
            },
        });

        linesMesh = new THREE.LineSegments(geo, mat);
        scene.add(linesMesh);

        renderer.setSize(w, h);
        updateMouseWorld();
    }

    // ── Resize ────────────────────────────────────────────────────────────────
    function onResize() {
        buildGrid(container.clientWidth, container.clientHeight);
    }
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);
    onResize();

    // ── Render loop ───────────────────────────────────────────────────────────
    let rafId   = null;
    let running = true;
    let lastTime = performance.now();

    function animate() {
        if (!running) return;
        rafId = requestAnimationFrame(animate);

        const now = performance.now();
        const dt  = Math.min((now - lastTime) / 1000, 0.1);
        lastTime  = now;

        if (linesMesh && alphaBuf && currentPosArray) {
            const alphaAttr = linesMesh.geometry.attributes.aAlpha;
            const alphaArr  = alphaAttr.array;
            const radius    = cfg.hoverRadius;
            const kIn       = 1 - Math.exp(-cfg.fadeInSpeed  * dt);
            const kOut      = 1 - Math.exp(-cfg.fadeOutSpeed * dt);
            const { wx, wy } = mouse;
            const infinite  = wx === Infinity;
            const vertCount = alphaBuf.length;

            for (let i = 0; i < vertCount; i++) {
                let target = 0;
                if (!infinite) {
                    const px   = currentPosArray[i * 3];
                    const py   = currentPosArray[i * 3 + 1];
                    const dx   = px - wx;
                    const dy   = py - wy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    target = Math.max(0, 1 - dist / radius);
                }
                const k = target > alphaBuf[i] ? kIn : kOut;
                alphaBuf[i] += (target - alphaBuf[i]) * k;
                alphaArr[i]  = alphaBuf[i];
            }

            alphaAttr.needsUpdate = true;
        }

        renderer.render(scene, camera);
    }

    animate();

    return {
        stop() {
            running = false;
            if (rafId !== null) cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
            container.removeEventListener('mousemove',  onMouseMove);
            window.removeEventListener('scroll', updateMouseWorld);
            if (linesMesh) {
                scene.remove(linesMesh);
                linesMesh.geometry.dispose();
                linesMesh.material.dispose();
            }
            renderer.dispose();
            canvas.remove();
        },
    };
}

window.startShapeGrid = startShapeGrid;
startShapeGrid('pageBody');
