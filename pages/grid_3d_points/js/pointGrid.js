import { THREE_CDN, DEFAULTS } from './config.js';
import { POINT_VERTEX, POINT_FRAGMENT } from './shaders.js';
import { SlabManager } from './SlabManager.js';
// import { MouseLines } from './MouseLines.js';
import { MouseWeb } from './MouseWeb.js';
import { initPanelToggle } from '../../shared/settings.js';

/**
 * Mount an infinite 3-D point grid into a container element.
 *
 * The camera flies forward along -Z continuously. Slabs (XY planes of grid
 * points) are streamed in ahead of the camera and despawned behind it.
 * Moving the mouse over the container draws attraction lines from nearby
 * grid points to the cursor.
 *
 * @param {string} [containerId='pageBackground']
 * @param {Partial<typeof DEFAULTS>} [options] - Override any default config value
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startPointGrid(containerId = 'pageBackground', options = {}) {
    const THREE = await import(THREE_CDN);
    const cfg   = { ...DEFAULTS, ...options };

    // ── Container ─────────────────────────────────────────────────────────────
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`No element found with id "${containerId}"`);

    // Ensure the canvas's position:absolute resolves to this container
    if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const canvas          = renderer.domElement;
    canvas.style.display  = 'block';
    canvas.style.position = 'absolute';
    canvas.style.inset    = '0';
    canvas.style.zIndex   = '-1';

    renderer.setSize(container.clientWidth, container.clientHeight);

    // ── Scene & Camera ────────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        70,
        container.clientWidth / container.clientHeight,
        0.1,
        300,
    );
    camera.position.set(1, 1, 0);

    // ── Point material ────────────────────────────────────────────────────────
    const uFarDist = cfg.numSlabs * cfg.spacing;

    const pointMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite:  false,
        vertexShader:   POINT_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        uniforms: {
            uCameraZ: { value: 0.0 },
            uFarDist: { value: uFarDist },
            uColor:   { value: new THREE.Color(cfg.color) },
        },
    });

    // ── Slab manager ──────────────────────────────────────────────────────────
    const pointMask   = cfg.pointMask   ?? [1];
    const dirSequence = cfg.dirSequence ?? null;

    const slabManager = new SlabManager(THREE, scene, pointMaterial, {
        spacing:     cfg.spacing,
        xyExtent:    cfg.xyExtent,
        numSlabs:    cfg.numSlabs,
        behindSlabs: cfg.behindSlabs,
        pointMask,
    });

    // ── Mouse lines (commented out — swap back in to use) ────────────────────
    // const mouseLines = new MouseLines(
    //     THREE, scene, camera, canvas, container,
    //     slabManager.slabs,
    //     pointMaterial.uniforms.uColor.value,
    //     {
    //         spacing:   cfg.spacing,
    //         xyExtent:  cfg.xyExtent,
    //         hitRadius: cfg.hitRadius,
    //         maxLines:  cfg.maxLines,
    //     },
    // );

    // ── Mouse web ─────────────────────────────────────────────────────────────
    const mouseLines = new MouseWeb(
        THREE, scene, camera, canvas, container,
        slabManager.slabs,
        pointMaterial.uniforms.uColor.value,
        {
            spacing:        cfg.spacing,
            xyExtent:       cfg.xyExtent,
            hitRadius:      cfg.hitRadius,
            maxLines:       cfg.maxLines,
            mouseColor:     cfg.mouseColor,
            isPointValid:   slabManager.isPointValid,
            dirSequence,
            ...cfg.web,
        },
    );

    // ── Resize ────────────────────────────────────────────────────────────────
    function onResize() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);
    onResize();

    // ── Render loop ───────────────────────────────────────────────────────────
    const clock   = new THREE.Clock();
    let rafId     = null;
    let running   = true;

    function animate() {
        if (!running) return;
        rafId = requestAnimationFrame(animate);

        const delta = clock.getDelta();

        camera.position.z -= cfg.speed * delta;
        pointMaterial.uniforms.uCameraZ.value = camera.position.z;

        slabManager.maybeResetOrigin(camera);
        slabManager.update(camera);
        mouseLines.update();

        renderer.render(scene, camera);
    }

    animate();

    // Expose cfg for external settings control
    window.__pgCfg        = cfg;
    window.__pgMouseLines = mouseLines;
    window.__pgPointMat   = pointMaterial;

    // ── Public API ────────────────────────────────────────────────────────────
    function stop() {
        running = false;
        if (rafId !== null) cancelAnimationFrame(rafId);

        resizeObserver.disconnect();
        mouseLines.dispose();
        slabManager.dispose();
        pointMaterial.dispose();
        renderer.dispose();

        canvas.parentNode?.removeChild(canvas);
    }

    /**
     * Change the color of both grid points and mouse-web lines at runtime.
     * @param {number|string} hex - e.g. 0xff0000 or '#ff0000'
     */
    function setColor(hex) {
        pointMaterial.uniforms.uColor.value.set(hex);
        mouseLines.setColor(hex);
    }

    return { stop, setColor };
}

// Expose on window so it can be called from the browser console or
// injected into any page without requiring an ES-module import.
window.startPointGrid = startPointGrid;

// Auto-start when this module is loaded as the page entry point.
// The DOM is ready by the time module scripts execute.
const _instance = startPointGrid('pageBackground');

// ── Settings panel ────────────────────────────────────────────────────────────

(async function initSettings() {
    const NS = 'pg:';
    const { stop, setColor } = await _instance;

    if (!document.getElementById('spBtn')) return;
    initPanelToggle();

    // Speed
    const speedEl  = document.getElementById('cfgSpeed');
    const speedVal = document.getElementById('valSpeed');
    if (speedEl) {
        speedEl.addEventListener('input', () => {
            localStorage.setItem(NS + 'cfgSpeed', speedEl.value);
            window.__pgCfg && (window.__pgCfg.speed = +speedEl.value);
            if (speedVal) speedVal.textContent = (+speedEl.value).toFixed(1);
        });
        const sv = localStorage.getItem(NS + 'cfgSpeed');
        if (sv !== null) { speedEl.value = sv; if (speedVal) speedVal.textContent = (+sv).toFixed(1); window.__pgCfg && (window.__pgCfg.speed = +sv); }
    }

    // Background color
    const bgColorEl = document.getElementById('cfgBgColor');
    if (bgColorEl) {
        bgColorEl.addEventListener('input', () => { localStorage.setItem(NS + 'cfgBgColor', bgColorEl.value); document.body.style.background = bgColorEl.value; });
        const bv = localStorage.getItem(NS + 'cfgBgColor');
        if (bv !== null) { bgColorEl.value = bv; document.body.style.background = bv; }
    }

    // Point color
    const colorEl = document.getElementById('cfgColor');
    if (colorEl) {
        colorEl.addEventListener('input', () => { localStorage.setItem(NS + 'cfgColor', colorEl.value); window.__pgPointMat && window.__pgPointMat.uniforms.uColor.value.set(colorEl.value); });
        const cv = localStorage.getItem(NS + 'cfgColor');
        if (cv !== null) { colorEl.value = cv; window.__pgPointMat && window.__pgPointMat.uniforms.uColor.value.set(cv); }
    }

    // Mouse web color
    const mouseColorEl = document.getElementById('cfgMouseColor');
    if (mouseColorEl) {
        mouseColorEl.addEventListener('input', () => { localStorage.setItem(NS + 'cfgMouseColor', mouseColorEl.value); window.__pgMouseLines && window.__pgMouseLines.setColor(mouseColorEl.value); });
        const mv = localStorage.getItem(NS + 'cfgMouseColor');
        if (mv !== null) { mouseColorEl.value = mv; window.__pgMouseLines && window.__pgMouseLines.setColor(mv); }
    }
})();
