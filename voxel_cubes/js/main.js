import { THREE_CDN, TERRAIN_CONFIG as CFG } from './config.js';
import { TERRAIN_VERTEX, TERRAIN_FRAGMENT }  from './shaders.js';
import { setSeed }                            from './perlin.js';
import { ChunkManager }                       from './ChunkManager.js';
import { initPanelToggle, persistSettings }  from '../../shared/settings.js';

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

// ── Settings panel ────────────────────────────────────────────────────────────
function updateCameraFar() {
    const tileSize = CFG.chunkSize * CFG.cellSize;
    camera.far = Math.max(
        CFG.viewDistance * tileSize * 1.5,
        material.uniforms.uFogFar.value * 1.1,
    );
    camera.updateProjectionMatrix();
}

function applySettings() {
    const get = id => document.getElementById(id);

    const fogNearEl = get('cfgFogNear');
    if (fogNearEl) material.uniforms.uFogNear.value = parseFloat(fogNearEl.value);

    const fogFarEl = get('cfgFogFar');
    if (fogFarEl) material.uniforms.uFogFar.value = parseFloat(fogFarEl.value);

    const ambientEl = get('cfgAmbient');
    if (ambientEl) material.uniforms.uAmbient.value = parseFloat(ambientEl.value) * 0.01;

    const brightnessEl = get('cfgBrightness');
    if (brightnessEl) material.uniforms.uBrightness.value = parseFloat(brightnessEl.value) * 0.01;

    const colorGrassEl = get('cfgColorGrass');
    if (colorGrassEl) material.uniforms.uColorGrass.value.set(colorGrassEl.value);
    const colorPeakEl = get('cfgColorPeak');
    if (colorPeakEl) material.uniforms.uColorPeak.value.set(colorPeakEl.value);
    const colorDirtEl = get('cfgColorDirt');
    if (colorDirtEl) material.uniforms.uColorDirt.value.set(colorDirtEl.value);
    const colorRockEl = get('cfgColorRock');
    if (colorRockEl) material.uniforms.uColorRock.value.set(colorRockEl.value);

    const wireframeEl = get('cfgWireframe');
    if (wireframeEl) material.wireframe = wireframeEl.checked;

    const chunkBudgetEl = get('cfgChunkBudget');
    if (chunkBudgetEl) CFG.chunksPerFrame = Math.max(1, parseInt(chunkBudgetEl.value) || 1);

    const controlModeEl = get('cfgControlMode');
    if (controlModeEl) {
        controlMode = controlModeEl.value;
        if (controlMode !== 'manual' && document.pointerLockElement) document.exitPointerLock();
        const hud = document.getElementById('hud');
        if (hud) {
            hud.textContent = controlMode === 'auto'
                ? 'AUTO MODE \u00b7 OPEN \u2699 TO ENABLE MANUAL INPUT'
                : 'CLICK TO CAPTURE MOUSE \u00b7 WASD / ARROWS TO MOVE';
            hud.classList.remove('hidden');
        }
    }

    let needRebuild = false;
    const viewDistEl = get('cfgViewDistance');
    if (viewDistEl) {
        const vd = parseInt(viewDistEl.value);
        if (vd !== CFG.viewDistance) { CFG.viewDistance = vd; needRebuild = true; }
    }
    const cellSizeEl = get('cfgCellSize');
    if (cellSizeEl) {
        const cs = parseFloat(cellSizeEl.value);
        if (cs !== CFG.cellSize) { CFG.cellSize = cs; needRebuild = true; }
    }
    const noiseScaleEl = get('cfgNoiseScale');
    if (noiseScaleEl) {
        const ns = parseFloat(noiseScaleEl.value) * 0.001;
        if (ns !== CFG.noiseScale) { CFG.noiseScale = ns; needRebuild = true; }
    }
    if (needRebuild) chunkManager.disposeAll();

    updateCameraFar();
}
document.getElementById('spApply')?.addEventListener('click', applySettings);

// Settings panel toggle
initPanelToggle();

// ── Persist settings ──────────────────────────────────────────────────────────
persistSettings('vc:', [
    'cfgMoveSpeed', 'cfgViewDistance', 'cfgChunkBudget', 'cfgCellSize', 'cfgNoiseScale',
    'cfgFogNear', 'cfgFogFar', 'cfgAmbient', 'cfgBrightness',
    'cfgColorGrass', 'cfgColorPeak', 'cfgColorDirt', 'cfgColorRock',
    'cfgControlMode', 'cfgWireframe',
], applySettings);

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
