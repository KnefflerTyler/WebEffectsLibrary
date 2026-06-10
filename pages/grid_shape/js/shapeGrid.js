import { THREE_CDN, DEFAULTS } from './config.js';
import { LINE_VERTEX, LINE_FRAGMENT } from './shaders.js';
import { buildGridGeometry } from './gridGeometry.js';
import { createSpotlightAgents, updateSpotlightAgents } from './spotlight.js';
import { RippleSystem } from './ripple.js';
import { initPanelToggle, makeWirer } from '../../../shared/settings.js';

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

    //  Container 
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`No element found with id "${containerId}"`);
    if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }

    //  Renderer 
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);

    const canvas          = renderer.domElement;
    canvas.style.display  = 'block';
    canvas.style.position = 'absolute';
    canvas.style.inset    = '0';
    canvas.style.zIndex   = '-1';
    container.appendChild(canvas);

    //  Scene â€” orthographic camera, 1 world unit = 1 pixel 
    const scene         = new THREE.Scene();
    let camera;
    let linesMesh       = null;
    let currentPosArray = null;
    let alphaBuf        = null;
    let spotlightAgents = null;
    let canvasW = 0, canvasH = 0;

    //  Sub-systems 
    const rippleSystem = new RippleSystem(cfg);

    //  Mouse state (world / pixel coords) 
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
        if (!cfg.mouseReveal) return;
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        updateMouseWorld();
        rippleSystem.onMouseMove(mouse.wx, mouse.wy);
    }

    container.addEventListener('mousemove',  onMouseMove);
    container.addEventListener('mouseleave', () => {
        if (!cfg.mouseReveal) return;
        mouse.wx = mouse.wy = Infinity;
        lastClientX = lastClientY = Infinity;
    });
    window.addEventListener('scroll', updateMouseWorld, { passive: true });

    //  Build / rebuild 
    function buildGrid(w, h) {
        canvasW = w;
        canvasH = h;
        camera  = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, -1, 1);

        const posArray  = buildGridGeometry(cfg.shape, w, h, cfg.cellSize, cfg);
        const vertCount = posArray.length / 3;

        if (linesMesh) {
            scene.remove(linesMesh);
            linesMesh.geometry.dispose();
            linesMesh.material.dispose();
        }

        currentPosArray = posArray;
        alphaBuf        = new Float32Array(vertCount);
        const alphaGpu  = new Float32Array(vertCount);

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
                uMaxOpacity: { value: cfg.maxOpacity ?? 1.0 },
            },
        });

        linesMesh = new THREE.LineSegments(geo, mat);
        scene.add(linesMesh);

        renderer.setSize(w, h);
        updateMouseWorld();

        if (cfg.spotlight) {
            spotlightAgents = createSpotlightAgents(cfg.spotlightCount, w, h, cfg);
        }
    }

    //  Resize 
    function onResize() {
        buildGrid(container.clientWidth, container.clientHeight);
    }
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);
    onResize();

    //  Render loop 
    let rafId    = null;
    let running  = true;
    let lastTime = performance.now();

    function animate() {
        if (!running) return;
        rafId = requestAnimationFrame(animate);

        const now = performance.now();
        const dt  = Math.min((now - lastTime) / 1000, 0.1);
        lastTime  = now;

        // Advance ripple system
        if (cfg.ripple) rippleSystem.tick(dt);

        if (linesMesh && alphaBuf && currentPosArray) {
            const alphaAttr  = linesMesh.geometry.attributes.aAlpha;
            const alphaArr   = alphaAttr.array;
            const radius     = cfg.hoverRadius;
            const kIn        = 1 - Math.exp(-cfg.fadeInSpeed  * dt);
            const kOut       = 1 - Math.exp(-cfg.fadeOutSpeed * dt);
            const { wx, wy } = mouse;
            const infinite   = wx === Infinity;
            const vertCount  = alphaBuf.length;
            const rippleOn    = cfg.ripple && rippleSystem.ripples.length > 0;
            const slRadius    = cfg.spotlightRadius ?? radius;

            // Advance spotlight agents
            if (cfg.spotlight && spotlightAgents) {
                updateSpotlightAgents(
                    spotlightAgents, dt, canvasW, canvasH, cfg,
                    cfg.ripple ? rippleSystem.ripples : null,
                );
            }

            // Ripple Ã— spotlight collision
            if (cfg.ripple && cfg.spotlight && cfg.spotlightRippleCollision && spotlightAgents) {
                rippleSystem.checkSpotlightCollisions(spotlightAgents, dt);
            }

            // Per-vertex alpha update
            for (let i = 0; i < vertCount; i++) {
                const px = currentPosArray[i * 3];
                const py = currentPosArray[i * 3 + 1];
                let target = 0;

                if (!infinite && cfg.mouseReveal) {
                    const dx   = px - wx;
                    const dy   = py - wy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    target = Math.max(target, Math.max(0, 1 - dist / radius));
                }

                if (cfg.spotlight && spotlightAgents) {
                    for (const agent of spotlightAgents) {
                        const dx   = px - agent.x;
                        const dy   = py - agent.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        target = Math.max(target, Math.max(0, 1 - dist / slRadius));
                    }
                }

                const k = target > alphaBuf[i] ? kIn : kOut;
                alphaBuf[i] += (target - alphaBuf[i]) * k;

                alphaArr[i] = rippleOn
                    ? Math.max(alphaBuf[i], rippleSystem.alphaAt(px, py))
                    : alphaBuf[i];
            }

            alphaAttr.needsUpdate = true;
        }

        renderer.render(scene, camera);
    }

    animate();

    //  Settings panel 
    (function initSettings() {
        const NS = 'sg:';
        if (!document.getElementById('spBtn')) return;
        initPanelToggle();
        const { wire, apply, restore } = makeWirer(NS);
        wire('cfgShape',      null,            v => { cfg.shape    = v; onResize(); });
        wire('cfgCellSize',   'valCellSize',   v => { cfg.cellSize = +v; onResize(); });
        wire('cfgColor',      null,            v => linesMesh && linesMesh.material.uniforms.uColor.value.set(v));
        wire('cfgOpacity',    'valOpacity',    v => linesMesh && (linesMesh.material.uniforms.uMinOpacity.value = +v));
        wire('cfgMaxOpacity', 'valMaxOpacity', v => linesMesh && (linesMesh.material.uniforms.uMaxOpacity.value = +v));
        wire('cfgRipple',     null,            v => { cfg.ripple    = v; });
        wire('cfgSpotlight',  null,            v => { cfg.spotlight = v; });
        restore();
        document.getElementById('spApply')?.addEventListener('click', apply);
    })();

    return {
        stop() {
            running = false;
            if (rafId !== null) cancelAnimationFrame(rafId);
            rippleSystem.cancelStopTimer();
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
startShapeGrid('pageBackground', { spotlight: true });
