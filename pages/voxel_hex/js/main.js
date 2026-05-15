import { THREE_CDN, TERRAIN_CONFIG as CFG } from './config.js';
import { TERRAIN_VERTEX, TERRAIN_FRAGMENT }   from './shaders.js';
import { setSeed }                             from './perlin.js';
import { ChunkManager }                        from './ChunkManager.js';
import { initPanelToggle, persistSettings }   from '../../../shared/settings.js';

const THREE = await import(THREE_CDN);

// Seed the permutation table used by buildHexVoxelMesh on the CPU.
setSeed(CFG.noiseSeed);

// â”€â”€ Renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('pageBackground').appendChild(renderer.domElement);

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// â”€â”€ Scene / Camera â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const scene  = new THREE.Scene();
scene.background = new THREE.Color(CFG.fogColor);
const camera = new THREE.PerspectiveCamera(CFG.fov, innerWidth / innerHeight, 0.1, 2000);
let camX = 0, camY = CFG.cameraHeight, camZ = 0;
camera.position.set(camX, camY, camZ);

// â”€â”€ Terrain material â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const lightDir = new THREE.Vector3(...CFG.lightDir).normalize();

const material = new THREE.ShaderMaterial({
    glslVersion:    THREE.GLSL3,
    vertexShader:   TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    wireframe:      CFG.wireframe,
    uniforms: {
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
        uBrightness:  { value: 1.0 },
        uCameraPos:   { value: camera.position },
    },
});

// â”€â”€ Chunk streaming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const chunkManager = new ChunkManager(scene, CFG, THREE, material);
chunkManager.update(camX, camZ);

// â”€â”€ Camera controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let yaw = 0, pitch = -0.35;
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
        if (hud) { hud.textContent = 'WASD / ARROWS TO MOVE Â· ESC TO RELEASE'; hud.classList.remove('hidden'); }
    } else {
        if (controlMode === 'manual' && hud) {
            hud.textContent = 'CLICK TO CAPTURE MOUSE Â· WASD / ARROWS TO MOVE';
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

// â”€â”€ Settings panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function updateCameraFar() {
    const tileW = CFG.chunkCols * Math.sqrt(3) * CFG.hexSize;
    const tileH = CFG.chunkRows * 1.5 * CFG.hexSize;
    camera.far = Math.max(
        CFG.viewDistance * Math.max(tileW, tileH) * 1.5,
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
                ? 'AUTO MODE Â· OPEN âš™ TO ENABLE MANUAL INPUT'
                : 'CLICK TO CAPTURE MOUSE Â· WASD / ARROWS TO MOVE';
            hud.classList.remove('hidden');
        }
    }

    let needRebuild = false;
    const viewDistEl = get('cfgViewDistance');
    if (viewDistEl) {
        const vd = parseInt(viewDistEl.value);
        if (vd !== CFG.viewDistance) { CFG.viewDistance = vd; needRebuild = true; }
    }
    const hexSizeEl = get('cfgHexSize');
    if (hexSizeEl) {
        const hs = parseFloat(hexSizeEl.value);
        if (hs !== CFG.hexSize) { CFG.hexSize = hs; needRebuild = true; }
    }
    const heightStepEl = get('cfgHeightStep');
    if (heightStepEl) {
        const ht = parseFloat(heightStepEl.value);
        if (ht !== CFG.cellSize) { CFG.cellSize = ht; needRebuild = true; }
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

// â”€â”€ Persist settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
persistSettings('vh:', [
    'cfgMoveSpeed', 'cfgViewDistance', 'cfgChunkBudget', 'cfgHexSize', 'cfgHeightStep', 'cfgNoiseScale',
    'cfgFogNear', 'cfgFogFar', 'cfgAmbient', 'cfgBrightness',
    'cfgColorGrass', 'cfgColorPeak', 'cfgColorDirt', 'cfgColorRock',
    'cfgControlMode', 'cfgWireframe',
], applySettings);

// â”€â”€ Animation loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
