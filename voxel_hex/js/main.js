import { THREE_CDN, TERRAIN_CONFIG as CFG } from './config.js';
import { TERRAIN_VERTEX, TERRAIN_FRAGMENT }   from './shaders.js';
import { setSeed, getPermTable }               from './perlin.js';
import { ChunkManager }                        from './ChunkManager.js';

const THREE = await import(THREE_CDN);

// ── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// ── Scene / Camera ────────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.background = new THREE.Color(CFG.fogColor);
const camera = new THREE.PerspectiveCamera(CFG.fov, innerWidth / innerHeight, 0.1, 2000);
let camX = 0, camY = CFG.cameraHeight, camZ = 0;
camera.position.set(camX, camY, camZ);

// ── Permutation texture (512×1 R8) ────────────────────────────────────────────
setSeed(CFG.noiseSeed);
const permData = getPermTable();          // Uint8Array[512]
const permTex  = new THREE.DataTexture(permData, 512, 1, THREE.RedFormat, THREE.UnsignedByteType);
permTex.magFilter = THREE.NearestFilter;
permTex.minFilter = THREE.NearestFilter;
permTex.needsUpdate = true;

// ── Terrain material ──────────────────────────────────────────────────────────
const lightDir = new THREE.Vector3(...CFG.lightDir).normalize();

const material = new THREE.ShaderMaterial({
    glslVersion:    THREE.GLSL3,
    vertexShader:   TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    wireframe:      CFG.wireframe,
    uniforms: {
        uPermTex:     { value: permTex },
        uNoiseScale:  { value: CFG.noiseScale },
        uOctaves:     { value: CFG.octaves },
        uPersistence: { value: CFG.persistence },
        uLacunarity:  { value: CFG.lacunarity },
        uHeightScale: { value: CFG.heightScale },
        uCellSize:    { value: CFG.cellSize },
        uHeightMax:   { value: CFG.heightScale },
        uColorGrass:  { value: new THREE.Color(CFG.colorGrass) },
        uColorPeak:   { value: new THREE.Color(CFG.colorPeak) },
        uColorDirt:   { value: new THREE.Color(CFG.colorDirt) },
        uColorRock:   { value: new THREE.Color(CFG.colorRock) },
        uFogColor:    { value: new THREE.Color(CFG.fogColor) },
        uFogNear:     { value: CFG.fogNear },
        uFogFar:      { value: CFG.fogFar },
        uLightDir:    { value: lightDir },
        uAmbient:     { value: CFG.ambient },
        uCameraPos:   { value: camera.position },
    },
});

// ── Chunk streaming ───────────────────────────────────────────────────────────
const chunkManager = new ChunkManager(scene, CFG, THREE, material);
chunkManager.update(camX, camZ);

// ── Camera controls ───────────────────────────────────────────────────────────
let yaw = 0, pitch = 0;
let controlMode = 'auto';

const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true;  });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

renderer.domElement.addEventListener('click', () => {
    if (controlMode === 'manual') renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
    const hud = document.getElementById('hud');
    if (document.pointerLockElement === renderer.domElement) {
        if (hud) { hud.textContent = 'WASD / ARROWS TO MOVE · ESC TO RELEASE'; hud.classList.remove('hidden'); }
    } else {
        if (controlMode === 'manual' && hud) {
            hud.textContent = 'CLICK TO CAPTURE MOUSE · WASD / ARROWS TO MOVE';
            hud.classList.remove('hidden');
        }
    }
});

document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw   -= e.movementX * CFG.lookSensitivity;
    pitch -= e.movementY * CFG.lookSensitivity;
    pitch  = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch));
});

// ── Settings bindings ─────────────────────────────────────────────────────────
function bindRange(id, valId, uniform, scale = 1) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => {
        const v = parseFloat(e.target.value) * scale;
        if (valId) document.getElementById(valId).textContent = parseFloat(e.target.value).toFixed(2);
        if (uniform) material.uniforms[uniform].value = v;
    });
}

function bindColor(id, uniform) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => {
        material.uniforms[uniform].value.set(e.target.value);
    });
}

bindRange('cfgMoveSpeed', 'valMoveSpeed', null);
bindRange('cfgFogNear',   'valFogNear',   'uFogNear');
bindRange('cfgFogFar',    'valFogFar',    'uFogFar');
bindRange('cfgAmbient',   'valAmbient',   'uAmbient', 0.01);
bindRange('cfgNoiseScale','valNoiseScale','uNoiseScale', 0.001);

document.getElementById('cfgViewDistance')?.addEventListener('input', e => {
    document.getElementById('valViewDistance').textContent = e.target.value;
    CFG.viewDistance = parseInt(e.target.value);
    chunkManager.disposeAll();
});

document.getElementById('cfgHexSize')?.addEventListener('input', e => {
    document.getElementById('valHexSize').textContent = parseFloat(e.target.value).toFixed(1);
    CFG.hexSize = parseFloat(e.target.value);
    chunkManager.disposeAll();
});

document.getElementById('cfgHeightStep')?.addEventListener('input', e => {
    document.getElementById('valHeightStep').textContent = parseFloat(e.target.value).toFixed(1);
    CFG.cellSize = parseFloat(e.target.value);
    material.uniforms.uCellSize.value = CFG.cellSize;
    // Live update — no chunk rebuild needed since displacement is pure GPU
});

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
            ? 'AUTO MODE · OPEN ⚙ TO ENABLE MANUAL INPUT'
            : 'CLICK TO CAPTURE MOUSE · WASD / ARROWS TO MOVE';
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

    const now   = performance.now();
    const dt    = Math.min((now - prev) / 1000, 0.1);
    prev = now;

    const speedEl = document.getElementById('cfgMoveSpeed');
    const speed   = speedEl ? parseFloat(speedEl.value) : CFG.moveSpeed;
    const sinY    = Math.sin(yaw), cosY = Math.cos(yaw);

    if (controlMode === 'auto') {
        camX -= sinY * speed * dt;
        camZ -= cosY * speed * dt;
    } else {
        if (keys['KeyW'] || keys['ArrowUp'])    { camX -= sinY * speed * dt; camZ -= cosY * speed * dt; }
        if (keys['KeyS'] || keys['ArrowDown'])  { camX += sinY * speed * dt; camZ += cosY * speed * dt; }
        if (keys['KeyA'] || keys['ArrowLeft'])  { camX -= cosY * speed * dt; camZ += sinY * speed * dt; }
        if (keys['KeyD'] || keys['ArrowRight']) { camX += cosY * speed * dt; camZ -= sinY * speed * dt; }
        if (keys['Space'])     camY += speed * dt;
        if (keys['ShiftLeft']) camY -= speed * dt;
    }

    camera.position.set(camX, camY, camZ);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    chunkManager.update(camX, camZ);
    renderer.render(scene, camera);
})();
