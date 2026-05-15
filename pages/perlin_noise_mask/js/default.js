import { THREE_CDN, HTML2CANVAS_CDN, MASK_CONFIG } from './config.js';
import { NOISE_VERTEX, NOISE_FRAGMENT } from './shaders.js';
import { initPanelToggle, makeWirer } from '../../shared/settings.js';

const THREE      = await import(THREE_CDN);
const { default: html2canvas } = await import(HTML2CANVAS_CDN);

// -- HTML ? canvas texture via html2canvas -------------------------------------
// html2canvas re-draws DOM elements using Canvas 2D API � it never uses SVG
// foreignObject, so the resulting canvas is never tainted and WebGL can safely
// read it as a texture.
async function elementToTexture(el) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const canvas = await html2canvas(el, {
        scale          : window.devicePixelRatio,
        width          : W,
        height         : H,
        windowWidth    : W,
        windowHeight   : H,
        backgroundColor: null,
        logging        : false,
        // Make the hidden element visible in the clone before rendering
        onclone: (_doc, clone) => {
            clone.style.visibility = 'visible';
            clone.style.position   = 'relative';
        },
    });
    return new THREE.CanvasTexture(canvas);
}

// -- WebGL renderer ------------------------------------------------------------
const canvas = document.getElementById('layerMask');
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene  = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const geometry = new THREE.PlaneGeometry(2, 2);
const uniforms = {
    uTime        : { value: 0.0 },
    uScale       : { value: MASK_CONFIG.scale },
    uSpeed       : { value: MASK_CONFIG.speed },
    uDriftRatio  : { value: MASK_CONFIG.driftRatio },
    uContrast    : { value: MASK_CONFIG.contrast },
    uAmplitude   : { value: MASK_CONFIG.amplitude },
    uBias        : { value: MASK_CONFIG.bias },
    uRidged      : { value: MASK_CONFIG.ridged },
    uWarpStrength: { value: MASK_CONFIG.warpStrength },
    uWarpScale   : { value: MASK_CONFIG.warpScale },
    uThreshold   : { value: MASK_CONFIG.threshold },
    uSoftness    : { value: MASK_CONFIG.softness },
    uOctaves     : { value: MASK_CONFIG.octaves },
    uPersistence : { value: MASK_CONFIG.persistence },
    uLacunarity  : { value: MASK_CONFIG.lacunarity },
    uMaskOpacity : { value: MASK_CONFIG.maskOpacity },
    uGradColors  : { value: MASK_CONFIG.gradientColors.map(hex => {
        const n = parseInt(hex.slice(1), 16);
        return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    }) },
    uGradStops   : { value: MASK_CONFIG.gradientStops },
    uTextTexture : { value: null },
};

let textureLoadOk = false;
try {
    uniforms.uTextTexture.value = await elementToTexture(document.getElementById('layerContent'));
    textureLoadOk = true;
} catch (e) {
    console.error('elementToTexture failed:', e);
}

if (!textureLoadOk) throw new Error('Aborting: could not generate content texture.');

const material = new THREE.ShaderMaterial({
    vertexShader  : NOISE_VERTEX,
    fragmentShader: NOISE_FRAGMENT,
    uniforms,
});

scene.add(new THREE.Mesh(geometry, material));

// -- Resize --------------------------------------------------------------------
window.addEventListener('resize', async () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uTextTexture.value.dispose();
    uniforms.uTextTexture.value = await elementToTexture(document.getElementById('layerContent'));
});

// -- Animation loop ------------------------------------------------------------
const clock = new THREE.Clock();

(function animate() {
    requestAnimationFrame(animate);
    uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
})();

// -- Settings panel ------------------------------------------------------------

(function initSettings() {
    const NS = 'pn:';
    if (!document.getElementById('spBtn')) return;
    initPanelToggle();
    const { wire, apply, restore } = makeWirer(NS);
    wire('cfgScale',     'valScale',     v => { uniforms.uScale.value        = +v; }, 1);
    wire('cfgContrast',  'valContrast',  v => { uniforms.uContrast.value     = +v; }, 1);
    wire('cfgAmplitude', 'valAmplitude', v => { uniforms.uAmplitude.value    = +v; }, 1);
    wire('cfgBias',      'valBias',      v => { uniforms.uBias.value         = +v; }, 2);
    wire('cfgRidged',    null,           v => { uniforms.uRidged.value       = v ? 1 : 0; });
    wire('cfgSpeed',     'valSpeed',     v => { uniforms.uSpeed.value        = +v; }, 2);
    wire('cfgThreshold', 'valThreshold', v => { uniforms.uThreshold.value    = +v; }, 2);
    wire('cfgSoftness',  'valSoftness',  v => { uniforms.uSoftness.value     = +v; }, 3);
    wire('cfgWarp',      'valWarp',      v => { uniforms.uWarpStrength.value = +v; }, 2);
    restore();
    document.getElementById('spApply')?.addEventListener('click', apply);
})();
