import { THREE_CDN, DEFAULTS } from './config.js';
import { CUBE_VERTEX, CUBE_FRAGMENT } from './shaders.js';

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
const SPEED_X = 0.007;
const SPEED_Y = 0.012;

(function animate() {
    requestAnimationFrame(animate);
    if (DEFAULTS.Spinning) {
        cube.rotation.x += SPEED_X;
        cube.rotation.y += SPEED_Y;
    }
    renderer.render(scene, camera);
})();
