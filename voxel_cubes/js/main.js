import { THREE_CDN, TERRAIN_CONFIG as CFG } from './config.js';
import { TERRAIN_VERTEX, TERRAIN_FRAGMENT }  from './shaders.js';
import { setSeed }                            from './perlin.js';
import { ChunkManager }                       from './ChunkManager.js';

const THREE = await import(THREE_CDN);

// Seed the permutation table used by buildVoxelMesh on the CPU.
setSeed(CFG.noiseSeed);

// ── Renderer ──────────────────────────────────────────────────────────────────
const container = document.getElementById('pageBackground');
const renderer  = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(CFG.fogColor);
container.appendChild(renderer.domElement);

// ── Scene + camera ────────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    CFG.fov,
    window.innerWidth / window.innerHeight,
    0.5,
    CFG.fogFar * 1.5,
);
camera.position.set(0, CFG.cameraHeight, 0);

// ── Shared terrain material ───────────────────────────────────────────────────
const lightDir = new THREE.Vector3(...CFG.lightDir).normalize();

const material = new THREE.ShaderMaterial({
    glslVersion:    THREE.GLSL3,
    vertexShader:   TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    uniforms: {
        // ── Rendering ─────────────────────────────────────────────────────
        uHeightMax:  { value: CFG.heightScale   },
        uColorGrass: { value: new THREE.Color(CFG.colorGrass) },
        uColorPeak:  { value: new THREE.Color(CFG.colorPeak)  },
        uColorDirt:  { value: new THREE.Color(CFG.colorDirt)  },
        uColorRock:  { value: new THREE.Color(CFG.colorRock)  },
        uFogColor:   { value: new THREE.Color(CFG.fogColor)   },
        uFogNear:    { value: CFG.fogNear  },
        uFogFar:     { value: CFG.fogFar   },
        uLightDir:   { value: lightDir },
        uAmbient:    { value: CFG.ambient  },
        uBrightness: { value: 1.0 },
        uCameraPos:  { value: camera.position },
    },
    side: THREE.FrontSide,
});

// ── Chunk manager ─────────────────────────────────────────────────────────────
const chunkManager = new ChunkManager(scene, CFG, THREE, material);

// ── Camera state ──────────────────────────────────────────────────────────────
let camX = 0, camZ = 0;
let yaw   = 0;
let pitch = -0.35;

let controlMode = 'auto';

const keys = new Set();

// ── Input — keyboard ─────────────────────────────────────────────────────────
window.addEventListener('keydown', e => keys.add(e.code));
window.addEventListener('keyup',   e => keys.delete(e.code));

// ── Input — mouse look (pointer lock) ────────────────────────────────────────
renderer.domElement.addEventListener('click', () => {
    if (controlMode === 'manual') renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
        document.addEventListener('mousemove', onMouseMove);
    } else {
        document.removeEventListener('mousemove', onMouseMove);
    }
});

function onMouseMove(e) {
    if (controlMode !== 'manual') return;
    yaw   -= e.movementX * CFG.lookSensitivity;
    pitch -= e.movementY * CFG.lookSensitivity;
    pitch  = Math.max(-1.2, Math.min(0.3, pitch));
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Settings-panel live bindings ──────────────────────────────────────────────
function bindRange(id, valId, uniform, scale = 1) {
    const el  = document.getElementById(id);
    const val = document.getElementById(valId);
    if (!el) return;
    el.addEventListener('input', () => {
        const v = parseFloat(el.value) * scale;
        if (valId) val.textContent = parseFloat(el.value).toFixed(
            el.step && el.step < 1 ? 2 : 0);
        if (uniform && material.uniforms[uniform])
            material.uniforms[uniform].value = v;
    });
}

function bindColor(id, uniform) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        material.uniforms[uniform].value.set(el.value);
    });
}

bindRange('cfgMoveSpeed', 'valMoveSpeed', null);
bindRange('cfgFogNear',   'valFogNear',   'uFogNear');

document.getElementById('cfgViewDistance')?.addEventListener('input', e => {
    document.getElementById('valViewDistance').textContent = e.target.value;
    CFG.viewDistance = parseInt(e.target.value);
    chunkManager.disposeAll();
});

document.getElementById('cfgCellSize')?.addEventListener('input', e => {
    document.getElementById('valCellSize').textContent = parseFloat(e.target.value).toFixed(1);
    CFG.cellSize = parseFloat(e.target.value);
    chunkManager.disposeAll();
});
bindRange('cfgFogFar',    'valFogFar',    'uFogFar');
bindRange('cfgAmbient',   'valAmbient',    'uAmbient', 0.01);
bindRange('cfgBrightness','valBrightness', 'uBrightness', 0.01);
bindColor('cfgColorGrass', 'uColorGrass');
bindColor('cfgColorPeak',  'uColorPeak');
bindColor('cfgColorDirt',  'uColorDirt');
bindColor('cfgColorRock',  'uColorRock');

document.getElementById('cfgControlMode')?.addEventListener('change', e => {
    controlMode = e.target.value;
    if (controlMode !== 'manual' && document.pointerLockElement) {
        document.exitPointerLock();
    }
    const hud = document.getElementById('hud');
    if (hud) {
        hud.textContent = controlMode === 'auto'
            ? 'AUTO MODE \u00b7 OPEN \u2699 TO ENABLE MANUAL INPUT'
            : 'CLICK TO CAPTURE MOUSE \u00b7 WASD / ARROWS TO MOVE';
        hud.classList.remove('hidden');
    }
});

document.getElementById('cfgWireframe')?.addEventListener('change', e => {
    material.wireframe = e.target.checked;
});

// Settings panel toggle
const btn   = document.getElementById('spBtn');
const panel = document.getElementById('spPanel');
btn?.addEventListener('click', () => {
    panel.classList.toggle('sp-open');
    btn.classList.toggle('sp-open');
});

// ── Animation loop ────────────────────────────────────────────────────────────
let prev = performance.now();

(function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt  = Math.min((now - prev) / 1000, 0.1);
    prev = now;

    const speedEl = document.getElementById('cfgMoveSpeed');
    const speed   = speedEl ? parseFloat(speedEl.value) : CFG.moveSpeed;
    const sinY    = Math.sin(yaw), cosY = Math.cos(yaw);

    if (controlMode === 'auto') {
        camX -= sinY * speed * dt;
        camZ -= cosY * speed * dt;
    } else {
        if (keys.has('KeyW') || keys.has('ArrowUp'))    { camX += sinY * speed * dt; camZ += cosY * speed * dt; }
        if (keys.has('KeyS') || keys.has('ArrowDown'))  { camX -= sinY * speed * dt; camZ -= cosY * speed * dt; }
        if (keys.has('KeyA') || keys.has('ArrowLeft'))  { camX -= cosY * speed * dt; camZ += sinY * speed * dt; }
        if (keys.has('KeyD') || keys.has('ArrowRight')) { camX += cosY * speed * dt; camZ -= sinY * speed * dt; }
    }

    camera.position.set(camX, CFG.cameraHeight, camZ);
    material.uniforms.uCameraPos.value.set(camX, CFG.cameraHeight, camZ);

    camera.rotation.order = 'YXZ';
    camera.rotation.y     = yaw;
    camera.rotation.x     = pitch;

    chunkManager.update(camX, camZ);
    renderer.render(scene, camera);
})();
