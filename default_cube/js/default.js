import { THREE_CDN, DEFAULTS } from './config.js';
import { CUBE_VERTEX, CUBE_FRAGMENT } from './shaders.js';
import { initPanelToggle } from '../../shared/settings.js';

const THREE = await import(THREE_CDN);

// ── Scene setup ───────────────────────────────────────────────────────────────
const container = document.getElementById('pageBackground');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 4;

// ── Config ────────────────────────────────────────────────────────────────────
const FACE_COLORS = [
    0xff4d6d,   // +X  — vivid pink-red
    0x4dc8ff,   // -X  — sky blue
    0x4dff91,   // +Y  — mint green
    0xffd14d,   // -Y  — golden yellow
    0xc04dff,   // +Z  — violet
    0xff8c4d,   // -Z  — orange
];

const LIGHT_DIR   = new THREE.Vector3(5, 5, 5).normalize();
const LIGHT_COLOR = new THREE.Color(0xffffff);
const AMBIENT     = new THREE.Color(0x222233);

// ── Build per-face shader materials ──────────────────────────────────────────
function makeFaceMaterial(hexColor) {
    const color = new THREE.Color(hexColor);
    return new THREE.ShaderMaterial({
        vertexShader  : CUBE_VERTEX,
        fragmentShader: CUBE_FRAGMENT,
        uniforms: {
            uColor     : { value: color },
            uLightDir  : { value: LIGHT_DIR },
            uLightColor: { value: LIGHT_COLOR },
            uAmbient   : { value: AMBIENT },
            uShininess : { value: 64.0 },
        },
    });
}

const faceMaterials = DEFAULTS.SolidColor !== null
    ? Array(6).fill(null).map(() => makeFaceMaterial(DEFAULTS.SolidColor))
    : FACE_COLORS.map(makeFaceMaterial);

// ── Cube ──────────────────────────────────────────────────────────────────────
const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
const cube = new THREE.Mesh(geometry, faceMaterials);
scene.add(cube);

// ── Thin wireframe overlay ────────────────────────────────────────────────────
const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
const wireGeo = new THREE.EdgesGeometry(geometry);
const wireframe = new THREE.LineSegments(wireGeo, wireMat);
cube.add(wireframe);

// ── Resize handler ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Animation loop ────────────────────────────────────────────────────────────
let speedX = 0.007;
let speedY = 0.012;

(function animate() {
    requestAnimationFrame(animate);
    if (DEFAULTS.Spinning) {
        cube.rotation.x += speedX;
        cube.rotation.y += speedY;
    }
    renderer.render(scene, camera);
})();

// ── Settings panel ───────────────────────────────────────────────────────────
{
    const NS      = 'dc:';
    const spBtn   = document.getElementById('spBtn');
    const spPanel = document.getElementById('spPanel');
    if (spBtn && spPanel) {
        initPanelToggle();

        // spinning toggle
        document.getElementById('cfgSpinning').addEventListener('change', e => {
            DEFAULTS.Spinning = e.target.checked;
            localStorage.setItem(NS + 'cfgSpinning', String(e.target.checked));
        });

        // speed sliders
        document.getElementById('cfgSpeedX').addEventListener('input', e => {
            speedX = parseFloat(e.target.value);
            document.getElementById('valSpeedX').textContent = speedX.toFixed(3);
            localStorage.setItem(NS + 'cfgSpeedX', e.target.value);
        });
        document.getElementById('cfgSpeedY').addEventListener('input', e => {
            speedY = parseFloat(e.target.value);
            document.getElementById('valSpeedY').textContent = speedY.toFixed(3);
            localStorage.setItem(NS + 'cfgSpeedY', e.target.value);
        });

        // shininess
        document.getElementById('cfgShiny').addEventListener('input', e => {
            const v = parseFloat(e.target.value);
            document.getElementById('valShiny').textContent = v;
            faceMaterials.forEach(m => { m.uniforms.uShininess.value = v; });
            localStorage.setItem(NS + 'cfgShiny', e.target.value);
        });

        // per-face color pickers
        document.getElementById('faceColorGrid').addEventListener('input', e => {
            const input = e.target;
            if (!input.dataset.face) return;
            const idx = parseInt(input.dataset.face, 10);
            faceMaterials[idx].uniforms.uColor.value.set(input.value);
            localStorage.setItem(NS + 'face' + idx, input.value);
        });

        // solid color mode
        const solidCheck = document.getElementById('cfgSolid');
        const solidColor = document.getElementById('cfgSolidColor');
        function applySolid() {
            if (solidCheck.checked) {
                faceMaterials.forEach(m => m.uniforms.uColor.value.set(solidColor.value));
            }
            localStorage.setItem(NS + 'cfgSolid', String(solidCheck.checked));
            localStorage.setItem(NS + 'cfgSolidColor', solidColor.value);
        }
        solidCheck.addEventListener('change', applySolid);
        solidColor.addEventListener('input', applySolid);

        // Restore saved settings
        const sv = key => localStorage.getItem(NS + key);

        const sSpin = sv('cfgSpinning');
        if (sSpin !== null) { const el = document.getElementById('cfgSpinning'); el.checked = sSpin === 'true'; DEFAULTS.Spinning = el.checked; }

        const sSpeedX = sv('cfgSpeedX');
        if (sSpeedX !== null) { const el = document.getElementById('cfgSpeedX'); el.value = sSpeedX; speedX = parseFloat(sSpeedX); document.getElementById('valSpeedX').textContent = speedX.toFixed(3); }

        const sSpeedY = sv('cfgSpeedY');
        if (sSpeedY !== null) { const el = document.getElementById('cfgSpeedY'); el.value = sSpeedY; speedY = parseFloat(sSpeedY); document.getElementById('valSpeedY').textContent = speedY.toFixed(3); }

        const sShiny = sv('cfgShiny');
        if (sShiny !== null) { const el = document.getElementById('cfgShiny'); el.value = sShiny; document.getElementById('valShiny').textContent = sShiny; faceMaterials.forEach(m => { m.uniforms.uShininess.value = parseFloat(sShiny); }); }

        for (let i = 0; i < 6; i++) {
            const sFace = sv('face' + i);
            if (sFace !== null) { const el = document.querySelector('[data-face="' + i + '"]'); if (el) { el.value = sFace; faceMaterials[i].uniforms.uColor.value.set(sFace); } }
        }

        const sSolid = sv('cfgSolid'), sSolidColor = sv('cfgSolidColor');
        if (sSolid !== null) { solidCheck.checked = sSolid === 'true'; if (sSolidColor !== null) solidColor.value = sSolidColor; applySolid(); }
    }
}
