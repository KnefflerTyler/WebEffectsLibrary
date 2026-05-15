import { THREE_CDN, DEFAULTS } from './config.js';
import { CUBE_VERTEX, CUBE_FRAGMENT } from './shaders.js';
import { initPanelToggle } from '../../../shared/settings.js';

const THREE = await import(THREE_CDN);

// â”€â”€ Scene setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const container = document.getElementById('pageBackground');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 4;

// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FACE_COLORS = [
    0xff4d6d,   // +X  â€” vivid pink-red
    0x4dc8ff,   // -X  â€” sky blue
    0x4dff91,   // +Y  â€” mint green
    0xffd14d,   // -Y  â€” golden yellow
    0xc04dff,   // +Z  â€” violet
    0xff8c4d,   // -Z  â€” orange
];

const LIGHT_DIR   = new THREE.Vector3(5, 5, 5).normalize();
const LIGHT_COLOR = new THREE.Color(0xffffff);
const AMBIENT     = new THREE.Color(0x222233);

// â”€â”€ Build per-face shader materials â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Cube â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
const cube = new THREE.Mesh(geometry, faceMaterials);
scene.add(cube);

// â”€â”€ Thin wireframe overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
const wireGeo = new THREE.EdgesGeometry(geometry);
const wireframe = new THREE.LineSegments(wireGeo, wireMat);
cube.add(wireframe);

// â”€â”€ Resize handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// â”€â”€ Animation loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Settings panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
{
    const NS      = 'dc:';
    const spBtn   = document.getElementById('spBtn');
    const spPanel = document.getElementById('spPanel');
    if (spBtn && spPanel) {
        initPanelToggle();

        // Display-only listeners (no scene changes until Apply is clicked)
        document.getElementById('cfgSpeedX').addEventListener('input', e =>
            document.getElementById('valSpeedX').textContent = parseFloat(e.target.value).toFixed(3));
        document.getElementById('cfgSpeedY').addEventListener('input', e =>
            document.getElementById('valSpeedY').textContent = parseFloat(e.target.value).toFixed(3));
        document.getElementById('cfgShiny').addEventListener('input', e =>
            document.getElementById('valShiny').textContent = e.target.value);

        // Apply button â€” reads all current input values and applies them
        function applySettings() {
            const solidCheck = document.getElementById('cfgSolid');
            const solidColor = document.getElementById('cfgSolidColor');

            // spinning toggle
            DEFAULTS.Spinning = document.getElementById('cfgSpinning').checked;
            localStorage.setItem(NS + 'cfgSpinning', String(DEFAULTS.Spinning));

            // speeds
            speedX = parseFloat(document.getElementById('cfgSpeedX').value);
            speedY = parseFloat(document.getElementById('cfgSpeedY').value);
            document.getElementById('valSpeedX').textContent = speedX.toFixed(3);
            document.getElementById('valSpeedY').textContent = speedY.toFixed(3);
            localStorage.setItem(NS + 'cfgSpeedX', String(speedX));
            localStorage.setItem(NS + 'cfgSpeedY', String(speedY));

            // shininess
            const shiny = parseFloat(document.getElementById('cfgShiny').value);
            faceMaterials.forEach(m => { m.uniforms.uShininess.value = shiny; });
            localStorage.setItem(NS + 'cfgShiny', String(shiny));

            // per-face colors
            document.querySelectorAll('[data-face]').forEach(input => {
                const idx = parseInt(input.dataset.face, 10);
                faceMaterials[idx].uniforms.uColor.value.set(input.value);
                localStorage.setItem(NS + 'face' + idx, input.value);
            });

            // solid color mode
            if (solidCheck.checked) {
                faceMaterials.forEach(m => m.uniforms.uColor.value.set(solidColor.value));
            }
            localStorage.setItem(NS + 'cfgSolid', String(solidCheck.checked));
            localStorage.setItem(NS + 'cfgSolidColor', solidColor.value);
        }

        document.getElementById('spApply').addEventListener('click', applySettings);

        // Color picker display updates (no scene change â€” just show the picked colour)
        document.getElementById('faceColorGrid').addEventListener('input', () => {});
        document.getElementById('cfgSolid').addEventListener('change', () => {});
        document.getElementById('cfgSolidColor').addEventListener('input', () => {});
        document.getElementById('cfgSpinning').addEventListener('change', () => {});

        // Restore saved settings on load (bypasses Apply gate)
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
        if (sSolid !== null) {
            const solidCheck = document.getElementById('cfgSolid');
            const solidColor = document.getElementById('cfgSolidColor');
            solidCheck.checked = sSolid === 'true';
            if (sSolidColor !== null) solidColor.value = sSolidColor;
            if (solidCheck.checked) faceMaterials.forEach(m => m.uniforms.uColor.value.set(solidColor.value));
        }
    }
}
