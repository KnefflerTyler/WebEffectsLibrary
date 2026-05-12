import { THREE_CDN, DEFAULTS } from './config.js';
import { POINT_VERTEX, POINT_FRAGMENT } from './shaders.js';

/**
 * Mount a static 2-D point grid that reacts to mouse proximity.
 *
 * The grid is sized to match the viewport aspect ratio so every cell is
 * square and the grid fills the full screen edge-to-edge.  Points glow
 * as the mouse approaches them; the effect fades linearly over `radius`
 * grid steps.
 *
 * @param {string} [containerId='pageBackground']
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startGridBreath(containerId = 'pageBackground', options = {}) {
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

    // ── Scene & orthographic camera ───────────────────────────────────────────
    const scene  = new THREE.Scene();

    // The camera is rebuilt on every resize to keep 1 world unit = 1 grid step.
    let camera;

    // ── Grid geometry (rebuilt on resize) ────────────────────────────────────
    let points    = null; // THREE.Points
    let alphaBuf  = null; // Float32Array — internal lerped hover alpha (NOT the GPU buffer)
    let cols      = 0;
    let rows      = 0;
    let totalPts  = 0;

    // ── Mouse state (in world units) ─────────────────────────────────────────
    const mouse     = { wx: Infinity, wy: Infinity };
    let lastClientX = Infinity;
    let lastClientY = Infinity;

    function updateMouseWorld() {
        if (lastClientX === Infinity || !camera) return;
        const rect = canvas.getBoundingClientRect();
        const nx   =  ((lastClientX - rect.left) / rect.width)  * 2 - 1;
        const ny   = -((lastClientY - rect.top)  / rect.height) * 2 + 1;
        mouse.wx   = nx * camera.right;
        mouse.wy   = ny * camera.top;
    }

    function worldFromEvent(e) {
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        updateMouseWorld();
        // Spawn on move-start transition (was stopped, now moving).
        if (cfg.ripple && !mouseMoving) spawnRipple();
        mouseMoving = true;
        // Reset the stop timer; fire a ripple when motion ceases.
        clearTimeout(stopTimer);
        stopTimer = setTimeout(() => {
            mouseMoving = false;
            spawnRipple();
        }, cfg.rippleStopDelay);
    }

    container.addEventListener('mousemove',  worldFromEvent);
    container.addEventListener('mouseleave', () => {
        mouse.wx = mouse.wy = Infinity;
        lastClientX = lastClientY = Infinity;
    });
    window.addEventListener('scroll', updateMouseWorld, { passive: true });
    container.addEventListener('scroll', updateMouseWorld, { passive: true });

    // ── Ripple state ──────────────────────────────────────────────────────────
    const ripples = []; // { x, y, age }
    let mouseMoving   = false;
    let stopTimer     = null;

    function spawnRipple() {
        if (!cfg.ripple || mouse.wx === Infinity) return;
        ripples.push({ x: mouse.wx, y: mouse.wy, age: 0 });
    }

    // ── Build / rebuild grid ──────────────────────────────────────────────────
    function buildGrid(w, h) {
        const { spacing, gridDensity, color, hoverColor, pointSize } = cfg;

        // Derive column / row counts so cells are square and the grid covers
        // the full viewport.  gridDensity applies to the shorter axis.
        const aspect = w / h;
        if (aspect >= 1) {
            rows = gridDensity;
            cols = Math.round(gridDensity * aspect);
        } else {
            cols = gridDensity;
            rows = Math.round(gridDensity / aspect);
        }
        totalPts = cols * rows;

        // Orthographic half-extents in world units (1 unit = 1 grid step).
        const halfW = (cols - 1) / 2;
        const halfH = (rows - 1) / 2;

        // Rebuild camera.
        camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -1, 1);

        // Position buffer: evenly spaced from -(halfW) to +(halfW) etc.
        const posBuf      = new Float32Array(totalPts * 3);
        alphaBuf          = new Float32Array(totalPts); // internal hover lerp state
        const alphaGpuBuf = new Float32Array(totalPts); // written to GPU each frame
        const scaleGpuBuf = new Float32Array(totalPts).fill(1); // written to GPU each frame

        let i = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                posBuf[i * 3]     = c - halfW;
                posBuf[i * 3 + 1] = r - halfH;
                posBuf[i * 3 + 2] = 0;
                alphaBuf[i]       = 0;
                i++;
            }
        }

        // Dispose previous geometry if any.
        if (points) {
            scene.remove(points);
            points.geometry.dispose();
            points.material.dispose();
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position',
            new THREE.BufferAttribute(posBuf,      3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aAlpha',
            new THREE.BufferAttribute(alphaGpuBuf, 1).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aScale',
            new THREE.BufferAttribute(scaleGpuBuf, 1).setUsage(THREE.DynamicDrawUsage));

        const mat = new THREE.ShaderMaterial({
            transparent:    true,
            depthWrite:     false,
            vertexShader:   POINT_VERTEX,
            fragmentShader: POINT_FRAGMENT,
            uniforms: {
                uPointSize:  { value: pointSize },
                uColor:      { value: new THREE.Color(color) },
                uHoverColor: { value: new THREE.Color(hoverColor) },
            },
        });

        points = new THREE.Points(geo, mat);
        scene.add(points);

        renderer.setSize(w, h);
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
        const dt  = Math.min((now - lastTime) / 1000, 0.1); // seconds, capped
        lastTime  = now;

        // Age and prune expired ripples.
        if (cfg.ripple) {
            for (const rip of ripples) rip.age += dt;
            for (let j = ripples.length - 1; j >= 0; j--) {
                if (ripples[j].age >= cfg.rippleLifetime) ripples.splice(j, 1);
            }
        }

        // Update per-point alpha/scale: hover lerp + ripple contributions.
        if (points && alphaBuf) {
            const geo        = points.geometry;
            const posBuf     = geo.attributes.position.array;
            const alphaAttr  = geo.attributes.aAlpha;
            const scaleAttr  = geo.attributes.aScale;
            const alphaArr   = alphaAttr.array;
            const scaleArr   = scaleAttr.array;
            const radius     = cfg.radius;
            const kIn        = 1 - Math.exp(-cfg.fadeInSpeed  * dt);
            const kOut       = 1 - Math.exp(-cfg.fadeOutSpeed * dt);
            const { wx, wy } = mouse;
            const infinite   = wx === Infinity;
            const rippleOn   = cfg.ripple && ripples.length > 0;
            const halfWidth  = cfg.rippleWidth * 0.5;

            for (let i = 0; i < totalPts; i++) {
                const px = posBuf[i * 3];
                const py = posBuf[i * 3 + 1];

                // 1. Lerp hover alpha toward proximity target.
                let target = 0;
                if (!infinite) {
                    const dx   = px - wx;
                    const dy   = py - wy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    target = Math.max(0, 1 - dist / radius);
                }
                const k = target > alphaBuf[i] ? kIn : kOut;
                alphaBuf[i] += (target - alphaBuf[i]) * k;

                // 2. Accumulate ripple contributions.
                let rAlpha = 0, rScale = 0;
                if (rippleOn) {
                    for (const rip of ripples) {
                        const dx   = px - rip.x;
                        const dy   = py - rip.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const ringR    = rip.age * cfg.rippleSpeed;
                        const ringDist = Math.abs(dist - ringR);
                        if (ringDist < halfWidth) {
                            const t    = 1 - ringDist / halfWidth;
                            const fade = 1 - rip.age / cfg.rippleLifetime;
                            rAlpha = Math.max(rAlpha, t * cfg.rippleAlpha * fade);
                            rScale = Math.max(rScale, t * cfg.rippleScale * fade);
                        }
                    }
                }

                // 3. Write combined results to GPU attributes.
                alphaArr[i] = Math.max(alphaBuf[i], rAlpha);
                scaleArr[i] = 1 + Math.max(cfg.hoverScale * alphaBuf[i], rScale);
            }

            alphaAttr.needsUpdate = true;
            scaleAttr.needsUpdate = true;
        }

        renderer.render(scene, camera);
    }

    animate();

    // ── Settings panel ────────────────────────────────────────────────────────
    (function initSettings() {
        const NS    = 'gb:';
        const btn   = document.getElementById('spBtn');
        const panel = document.getElementById('spPanel');
        if (!btn || !panel) return;

        btn.addEventListener('click', () => {
            btn.classList.toggle('sp-open');
            panel.classList.toggle('sp-open');
        });
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && e.target !== btn) {
                btn.classList.remove('sp-open');
                panel.classList.remove('sp-open');
            }
        });

        const reg = [];
        function wire(id, valId, onInput) {
            const el  = document.getElementById(id);
            const val = valId ? document.getElementById(valId) : null;
            if (!el) return;
            reg.push({ id, el, val, onInput });
            el.addEventListener('input', () => {
                const v = el.type === 'checkbox' ? el.checked : el.value;
                localStorage.setItem(NS + id, el.type === 'checkbox' ? String(v) : v);
                if (val) { const dec = el.step && el.step.includes('.') ? el.step.split('.')[1].length : 0; val.textContent = (+v).toFixed(dec); }
                onInput(v, el);
            });
        }

        wire('cfgBgColor',     null,             v => { document.body.style.background = v; });
        wire('cfgColor',       null,             v => points && points.material.uniforms.uColor.value.set(v));
        wire('cfgHoverColor',  null,             v => points && points.material.uniforms.uHoverColor.value.set(v));
        wire('cfgPointSize',   'valPointSize',   v => { cfg.pointSize = +v; onResize(); });
        wire('cfgHoverScale',  'valHoverScale',  v => { cfg.hoverScale = +v; });
        wire('cfgRadius',      'valRadius',      v => { cfg.radius = +v; });
        wire('cfgDensity',     'valDensity',     v => { cfg.gridDensity = +v; onResize(); });
        wire('cfgRipple',      null,             v => { cfg.ripple = v; });
        wire('cfgRippleSpeed', 'valRippleSpeed', v => { cfg.rippleSpeed = +v; });

        reg.forEach(({ id, el, val, onInput }) => {
            const stored = localStorage.getItem(NS + id);
            if (stored === null) return;
            if (el.type === 'checkbox') el.checked = stored === 'true';
            else el.value = stored;
            if (val) { const dec = el.step && el.step.includes('.') ? el.step.split('.')[1].length : 0; val.textContent = (+stored).toFixed(dec); }
            onInput(el.type === 'checkbox' ? (stored === 'true') : stored, el);
        });
    })();

    return {
        stop() {
            running = false;
            if (rafId !== null) cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
            container.removeEventListener('mousemove',  worldFromEvent);
            window.removeEventListener('scroll', updateMouseWorld);
            container.removeEventListener('scroll', updateMouseWorld);
            if (points) {
                scene.remove(points);
                points.geometry.dispose();
                points.material.dispose();
            }
            renderer.dispose();
            canvas.remove();
        },
    };
}

// Auto-start when loaded directly via <script type="module">.
startGridBreath('pageBackground');
window.startGridBreath = startGridBreath;
