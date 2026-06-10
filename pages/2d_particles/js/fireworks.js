import { THREE_CDN, DEFAULTS } from './config.js';
import { PARTICLE_VERTEX, PARTICLE_FRAGMENT } from './shaders.js';
import { initPanelToggle, makeWirer } from '../../../shared/settings.js';

// Maximum vertex-pool sizes (pre-allocated; never reallocated at runtime)
const MAX_ROCKET_PTS = 700;   // rockets Ã— trail_length
const MAX_SPARKS     = 5000;  // explosion sparks across all active rockets

/**
 * Mount a GPU-driven fireworks simulation using Three.js ShaderMaterial.
 *
 * Two pre-allocated THREE.Points objects share the same vert/frag shaders:
 *   - rocket points  â€” rocket head + per-rocket trail
 *   - spark points   â€” explosion debris with shimmer and gravity
 *
 * Simulation runs on the CPU; only the packed attribute arrays are uploaded
 * each frame.  Both layers use additive blending so overlapping glows
 * brighten naturally against the dark background.
 *
 * @param {string} [containerId='pageBackground']
 * @param {Partial<typeof DEFAULTS>} [options]
 * @returns {Promise<{ stop: () => void, launch: (x?: number) => void }>}
 */
export async function startFireworks(containerId = 'pageBackground', options = {}) {
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

    //  Scene & orthographic camera 
    // World coords: x=0 left, x=W right, y=0 bottom, y=H top.
    // Rockets launch near y=0 and travel toward y=H.
    const scene = new THREE.Scene();
    let W = 0, H = 0, camera = null;

    function setSize(w, h) {
        W = w; H = h;
        // OrthographicCamera(left, right, top, bottom, near, far)
        camera = new THREE.OrthographicCamera(0, W, H, 0, -1, 1);
        renderer.setSize(W, H);
    }

    const resizeObserver = new ResizeObserver(() =>
        setSize(container.clientWidth, container.clientHeight));
    resizeObserver.observe(container);
    setSize(container.clientWidth, container.clientHeight);

    //  Shared ShaderMaterial 
    function makeMat() {
        return new THREE.ShaderMaterial({
            transparent:    true,
            depthWrite:     false,
            blending:       THREE.AdditiveBlending,
            vertexShader:   PARTICLE_VERTEX,
            fragmentShader: PARTICLE_FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
            },
        });
    }

    //  Pre-allocated GPU buffers: rockets & trails 
    const rPos   = new Float32Array(MAX_ROCKET_PTS * 3);
    const rAlpha = new Float32Array(MAX_ROCKET_PTS);
    const rSize  = new Float32Array(MAX_ROCKET_PTS);
    const rHue   = new Float32Array(MAX_ROCKET_PTS);
    const rPhase = new Float32Array(MAX_ROCKET_PTS);

    const rGeo      = new THREE.BufferGeometry();
    const rPosAttr   = new THREE.BufferAttribute(rPos,   3).setUsage(THREE.DynamicDrawUsage);
    const rAlphaAttr = new THREE.BufferAttribute(rAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    const rSizeAttr  = new THREE.BufferAttribute(rSize,  1).setUsage(THREE.DynamicDrawUsage);
    const rHueAttr   = new THREE.BufferAttribute(rHue,   1).setUsage(THREE.DynamicDrawUsage);
    const rPhaseAttr = new THREE.BufferAttribute(rPhase, 1).setUsage(THREE.DynamicDrawUsage);
    rGeo.setAttribute('position', rPosAttr);
    rGeo.setAttribute('aAlpha',   rAlphaAttr);
    rGeo.setAttribute('aSize',    rSizeAttr);
    rGeo.setAttribute('aHue',     rHueAttr);
    rGeo.setAttribute('aPhase',   rPhaseAttr);

    const rMat    = makeMat();
    const rPoints = new THREE.Points(rGeo, rMat);
    scene.add(rPoints);

    //  Pre-allocated GPU buffers: sparks 
    const sPos   = new Float32Array(MAX_SPARKS * 3);
    const sAlpha = new Float32Array(MAX_SPARKS);
    const sSize  = new Float32Array(MAX_SPARKS);
    const sHue   = new Float32Array(MAX_SPARKS);
    const sPhase = new Float32Array(MAX_SPARKS);

    const sGeo      = new THREE.BufferGeometry();
    const sPosAttr   = new THREE.BufferAttribute(sPos,   3).setUsage(THREE.DynamicDrawUsage);
    const sAlphaAttr = new THREE.BufferAttribute(sAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    const sSizeAttr  = new THREE.BufferAttribute(sSize,  1).setUsage(THREE.DynamicDrawUsage);
    const sHueAttr   = new THREE.BufferAttribute(sHue,   1).setUsage(THREE.DynamicDrawUsage);
    const sPhaseAttr = new THREE.BufferAttribute(sPhase, 1).setUsage(THREE.DynamicDrawUsage);
    sGeo.setAttribute('position', sPosAttr);
    sGeo.setAttribute('aAlpha',   sAlphaAttr);
    sGeo.setAttribute('aSize',    sSizeAttr);
    sGeo.setAttribute('aHue',     sHueAttr);
    sGeo.setAttribute('aPhase',   sPhaseAttr);

    const sMat    = makeMat();
    const sPoints = new THREE.Points(sGeo, sMat);
    scene.add(sPoints);

    //  Helpers 
    const rand    = (min, max)    => Math.random() * (max - min) + min;
    const randInt = (min, max)    => Math.floor(rand(min, max + 1));

    //  Simulation: Rocket 
    class Rocket {
        constructor(startX) {
            this.x    = startX ?? rand(W * 0.12, W * 0.88);
            this.y    = -12;   // just below visible bottom
            this.vx   = rand(-35, 35);
            this.hue  = Math.random();
            // targetY: the y at which this rocket explodes (y-up world coords)
            this.targetY  = rand(H * 0.55, H * 0.88);
            // Compute initial vy so the rocket still has upward momentum when it
            // reaches targetY.  v = sqrt(2*g*targetY) * overshoot_factor
            this.vy   = Math.sqrt(2 * cfg.gravity * this.targetY) * rand(1.08, 1.16);
            this.trail    = [];
            this.exploded = false;
        }

        update(dt) {
            this.vy -= cfg.gravity * dt;   // gravity
            this.x  += this.vx * dt;
            this.y  += this.vy * dt;
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > cfg.trailLength) this.trail.shift();
            if (this.y >= this.targetY || this.vy <= 0) this.exploded = true;
        }
    }

    //  Simulation: Spark 
    class Spark {
        constructor(x, y, hue, opts = {}) {
            const angle   = rand(0, Math.PI * 2);
            const speed   = opts.speed ?? rand(90, 500);
            this.x      = x;
            this.y      = y;
            this.vx     = Math.cos(angle) * speed;
            this.vy     = Math.sin(angle) * speed;
            this.hue    = hue + rand(-0.07, 0.07);
            this.alpha  = 1.0;
            this.decay  = (rand(0.8, 1.2) / cfg.sparkLife) * rand(0.7, 1.3);
            this.size   = opts.size ?? rand(cfg.sparkSize * 0.5, cfg.sparkSize * 1.8);
            this.phase  = rand(0, Math.PI * 2);
        }

        update(dt) {
            this.vx *= cfg.sparkDrag;
            this.vy *= cfg.sparkDrag;
            this.vy -= cfg.gravity * 0.65 * dt;   // sparks slightly less affected
            this.x  += this.vx * dt;
            this.y  += this.vy * dt;
            this.alpha -= this.decay * dt;
        }

        get dead() { return this.alpha <= 0; }
    }

    //  Explosion 
    function explode(x, y, hue) {
        // Central burst flash: a few large, very fast-fading points
        for (let i = 0; i < 6; i++) {
            const s  = new Spark(x, y, hue, { speed: rand(0, 20), size: rand(32, 58) });
            s.decay  = rand(3.5, 5.0);
            sparks.push(s);
        }

        // Primary colour sparks
        const n1 = randInt(cfg.sparkCountMin, cfg.sparkCountMax);
        for (let i = 0; i < n1; i++) sparks.push(new Spark(x, y, hue));

        // Complementary colour ring (adds visual depth)
        const hue2 = (hue + 0.5) % 1;
        const n2   = randInt(35, 70);
        for (let i = 0; i < n2; i++) {
            const s = new Spark(x, y, hue2, { speed: rand(60, 260) });
            sparks.push(s);
        }
    }

    //  State 
    const rockets    = [];
    const sparks     = [];
    let   lastLaunch  = 0;
    let   nextLaunch  = rand(cfg.launchRateMin, cfg.launchRateMax);

    //  Click to launch 
    canvas.addEventListener('click', e => {
        const rect = canvas.getBoundingClientRect();
        const cx   = e.clientX - rect.left;
        // Convert CSS y (0=top) to world y (0=bottom)
        const cy   = H - (e.clientY - rect.top);
        const r    = new Rocket(cx);
        r.targetY  = rand(cy * 0.70, cy * 0.92);
        rockets.push(r);
    });

    //  Render loop 
    let rafId   = null;
    let running = true;
    let lastTs  = performance.now();

    function animate() {
        if (!running) return;
        rafId = requestAnimationFrame(animate);

        const now = performance.now();
        const dt  = Math.min((now - lastTs) / 1000, 0.05);   // seconds, capped at 50 ms
        lastTs    = now;
        const t   = now / 1000;

        // Auto-launch rockets
        lastLaunch += dt * 1000;
        if (lastLaunch >= nextLaunch) {
            lastLaunch  = 0;
            nextLaunch  = rand(cfg.launchRateMin, cfg.launchRateMax);
            rockets.push(new Rocket());
        }

        // Update rockets
        for (let i = rockets.length - 1; i >= 0; i--) {
            rockets[i].update(dt);
            if (rockets[i].exploded) {
                explode(rockets[i].x, rockets[i].y, rockets[i].hue);
                rockets.splice(i, 1);
            }
        }

        // Update sparks
        for (let i = sparks.length - 1; i >= 0; i--) {
            sparks[i].update(dt);
            if (sparks[i].dead) sparks.splice(i, 1);
        }

        //  Pack rocket + trail buffer 
        let ri = 0;
        for (const rocket of rockets) {
            const trail = rocket.trail;
            const len   = trail.length;
            for (let j = 0; j < len && ri < MAX_ROCKET_PTS; j++) {
                const pt     = trail[j];
                const tNorm  = len > 1 ? j / (len - 1) : 1;   // 0=oldest, 1=newest (head)
                const isHead = j === len - 1;
                rPos[ri * 3]     = pt.x;
                rPos[ri * 3 + 1] = pt.y;
                rPos[ri * 3 + 2] = 0;
                rAlpha[ri] = tNorm;
                // Head is large and bright; trail dims and shrinks toward the oldest end
                rSize[ri]  = isHead ? cfg.rocketSize : cfg.rocketSize * 0.32 * tNorm;
                rHue[ri]   = rocket.hue;
                rPhase[ri] = j * 0.7;   // distinct shimmer phase per trail point
                ri++;
            }
        }
        rGeo.setDrawRange(0, ri);
        rPosAttr.needsUpdate   = true;
        rAlphaAttr.needsUpdate = true;
        rSizeAttr.needsUpdate  = true;
        rHueAttr.needsUpdate   = true;
        rPhaseAttr.needsUpdate = true;

        //  Pack spark buffer 
        const sc = Math.min(sparks.length, MAX_SPARKS);
        for (let i = 0; i < sc; i++) {
            const s = sparks[i];
            sPos[i * 3]     = s.x;
            sPos[i * 3 + 1] = s.y;
            sPos[i * 3 + 2] = 0;
            sAlpha[i] = Math.max(0, s.alpha);
            sSize[i]  = s.size;
            sHue[i]   = s.hue;
            sPhase[i] = s.phase;
        }
        sGeo.setDrawRange(0, sc);
        sPosAttr.needsUpdate   = true;
        sAlphaAttr.needsUpdate = true;
        sSizeAttr.needsUpdate  = true;
        sHueAttr.needsUpdate   = true;
        sPhaseAttr.needsUpdate = true;

        // Advance time uniforms
        rMat.uniforms.uTime.value = t;
        sMat.uniforms.uTime.value = t;

        renderer.render(scene, camera);
    }

    animate();

    //  Settings wiring 
    initPanelToggle();
    const { wire, apply, restore } = makeWirer('fw:');

    wire('cfgLaunchRate', 'valLaunchRate', v => {
        cfg.launchRateMax = +v;
        cfg.launchRateMin = +v * 0.4;
    });
    wire('cfgGravity',    'valGravity',    v => { cfg.gravity    = +v; });
    wire('cfgSparkCount', 'valSparkCount', v => {
        cfg.sparkCountMax = +v;
        cfg.sparkCountMin = Math.round(+v * 0.6);
    });
    wire('cfgSparkLife',  'valSparkLife',  v => { cfg.sparkLife  = +v; }, 1);

    restore();
    document.getElementById('spApply')?.addEventListener('click', apply);

    //  Stop / cleanup 
    return {
        stop() {
            running = false;
            cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
            renderer.dispose();
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        },
        /** Manually launch a rocket (optionally from a specific x pixel). */
        launch(x) { rockets.push(new Rocket(x)); },
    };
}
