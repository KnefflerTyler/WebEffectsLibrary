import { THREE_CDN, TERRAIN_CONFIG as CFG } from './config.js';
import { TERRAIN_VERTEX, TERRAIN_FRAGMENT }  from './shaders.js';
import { setSeed, getPermTable }             from './perlin.js';
import { ChunkManager }                       from './ChunkManager.js';
import { bindDisplay, initPanelToggle, persistSettings } from '../../shared/settings.js';

const THREE = await import(THREE_CDN);

// ── Noise seed + permutation texture ─────────────────────────────────────────
setSeed(CFG.noiseSeed);

// Upload the 512-entry permutation table as a 512×1 R8 texture so the vertex
// shader can evaluate the same seeded Perlin noise entirely on the GPU.
const permTex = new THREE.DataTexture(
    getPermTable().slice(),   // Uint8Array copy — safe after future setSeed calls
    512, 1,
    THREE.RedFormat,
    THREE.UnsignedByteType,
);
permTex.magFilter  = THREE.NearestFilter;
permTex.minFilter  = THREE.NearestFilter;
permTex.needsUpdate = true;

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
        // ── Noise (GPU mesh generation) ────────────────────────────────────
        uPermTex:     { value: permTex          },
        uNoiseScale:  { value: CFG.noiseScale   },
        uOctaves:     { value: CFG.octaves      },
        uPersistence: { value: CFG.persistence  },
        uLacunarity:  { value: CFG.lacunarity   },
        // ── Rendering ─────────────────────────────────────────────────────
        uHeightScale: { value: CFG.heightScale },
        uColorLow:    { value: new THREE.Color(CFG.colorLow)  },
        uColorMid:    { value: new THREE.Color(CFG.colorMid)  },
        uColorHigh:   { value: new THREE.Color(CFG.colorHigh) },
        uFogColor:    { value: new THREE.Color(CFG.fogColor)  },
        uFogNear:     { value: CFG.fogNear  },
        uFogFar:      { value: CFG.fogFar   },
        uLightDir:    { value: lightDir },
        uAmbient:     { value: CFG.ambient  },
        uBrightness:  { value: 1.0 },
        uCameraPos:   { value: camera.position },
    },
    side: THREE.FrontSide,
});

// ── Chunk manager ─────────────────────────────────────────────────────────────
const chunkManager = new ChunkManager(scene, CFG, THREE, material);

// ── Camera state ──────────────────────────────────────────────────────────────
let camX = 0, camZ = 0;
let yaw   = 0;          // horizontal rotation (radians)
let pitch = -0.35;      // vertical tilt (radians, negative = looking slightly down)

// 'auto' = forward drift, 'manual' = WASD + mouse look
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
    pitch  = Math.max(-1.2, Math.min(0.3, pitch));  // clamp vertical look
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Settings panel ────────────────────────────────────────────────────────────
// Update slider value displays on drag (no engine effects until Apply)
bindDisplay('cfgMoveSpeed',    'valMoveSpeed');
bindDisplay('cfgViewDistance', 'valViewDistance');
bindDisplay('cfgChunkBudget',  'valChunkBudget');
bindDisplay('cfgCellSize',     'valCellSize', 1);
bindDisplay('cfgFogNear',      'valFogNear');
bindDisplay('cfgFogFar',       'valFogFar');
bindDisplay('cfgAmbient',      'valAmbient');
bindDisplay('cfgBrightness',   'valBrightness');
bindDisplay('cfgNoiseScale',   'valNoiseScale', 2);

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

    const noiseScaleEl = get('cfgNoiseScale');
    if (noiseScaleEl) material.uniforms.uNoiseScale.value = parseFloat(noiseScaleEl.value);

    const colorLowEl = get('cfgColorLow');
    if (colorLowEl) material.uniforms.uColorLow.value.set(colorLowEl.value);
    const colorMidEl = get('cfgColorMid');
    if (colorMidEl) material.uniforms.uColorMid.value.set(colorMidEl.value);
    const colorHighEl = get('cfgColorHigh');
    if (colorHighEl) material.uniforms.uColorHigh.value.set(colorHighEl.value);

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
    if (needRebuild) chunkManager.disposeAll();

    updateCameraFar();
}
document.getElementById('spApply')?.addEventListener('click', applySettings);

// Settings panel toggle
initPanelToggle();

// ── Persist settings ──────────────────────────────────────────────────────────
persistSettings('mc:', [
    'cfgMoveSpeed', 'cfgViewDistance', 'cfgChunkBudget', 'cfgCellSize', 'cfgNoiseScale',
    'cfgFogNear', 'cfgFogFar', 'cfgAmbient', 'cfgBrightness',
    'cfgColorLow', 'cfgColorMid', 'cfgColorHigh',
    'cfgControlMode', 'cfgWireframe',
], applySettings);

// ── Animation loop ────────────────────────────────────────────────────────────
let prev = performance.now();

(function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt  = Math.min((now - prev) / 1000, 0.1);
    prev = now;

    // Read live move speed from slider if present
    const speedEl = document.getElementById('cfgMoveSpeed');
    const speed   = speedEl ? parseFloat(speedEl.value) : CFG.moveSpeed;

    // ── Movement ──────────────────────────────────────────────────────────────
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);

    if (controlMode === 'auto') {
        // Auto-forward: drift in the camera's current facing direction
        camX -= sinY * speed * dt;
        camZ -= cosY * speed * dt;
    } else {
        if (keys.has('KeyW') || keys.has('ArrowUp')) {
            camX += sinY * speed * dt;
            camZ += cosY * speed * dt;
        }
        if (keys.has('KeyS') || keys.has('ArrowDown')) {
            camX -= sinY * speed * dt;
            camZ -= cosY * speed * dt;
        }
        if (keys.has('KeyA') || keys.has('ArrowLeft')) {
            camX -= cosY * speed * dt;
            camZ += sinY * speed * dt;
        }
        if (keys.has('KeyD') || keys.has('ArrowRight')) {
            camX += cosY * speed * dt;
            camZ -= sinY * speed * dt;
        }
    }

    // ── Camera position ───────────────────────────────────────────────────────
    camera.position.set(camX, CFG.cameraHeight, camZ);
    material.uniforms.uCameraPos.value.set(camX, CFG.cameraHeight, camZ);

    // Apply yaw + pitch
    camera.rotation.order = 'YXZ';
    camera.rotation.y     = yaw;
    camera.rotation.x     = pitch;

    // ── Chunk streaming ───────────────────────────────────────────────────────
    chunkManager.update(camX, camZ);

    renderer.render(scene, camera);
})();
