import { THREE_CDN, TERRAIN_CONFIG as CFG } from './config.js';
import { TERRAIN_VERTEX, TERRAIN_FRAGMENT }  from './shaders.js';
import { setSeed, getPermTable }             from './perlin.js';
import { ChunkManager }                       from './ChunkManager.js';

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
        uCameraPos:   { value: camera.position },
    },
    side: THREE.DoubleSide,
});

// ── Chunk manager ─────────────────────────────────────────────────────────────
const chunkManager = new ChunkManager(scene, CFG, THREE, material);

// ── Camera state ──────────────────────────────────────────────────────────────
let camX = 0, camZ = 0;
let yaw   = 0;          // horizontal rotation (radians)
let pitch = -0.35;      // vertical tilt (radians, negative = looking slightly down)

const keys = new Set();

// ── Input — keyboard ─────────────────────────────────────────────────────────
window.addEventListener('keydown', e => keys.add(e.code));
window.addEventListener('keyup',   e => keys.delete(e.code));

// ── Input — mouse look (pointer lock) ────────────────────────────────────────
renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === renderer.domElement) {
        document.addEventListener('mousemove', onMouseMove);
    } else {
        document.removeEventListener('mousemove', onMouseMove);
    }
});

function onMouseMove(e) {
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

bindRange('cfgMoveSpeed',  'valMoveSpeed',  null);   // handled in animation loop
bindRange('cfgFogNear',    'valFogNear',    'uFogNear');
bindRange('cfgFogFar',     'valFogFar',     'uFogFar');
bindRange('cfgAmbient',    'valAmbient',    'uAmbient', 0.01);
bindRange('cfgNoiseScale', 'valNoiseScale', 'uNoiseScale');  // live GPU update
bindColor('cfgColorLow',   'uColorLow');
bindColor('cfgColorMid',   'uColorMid');
bindColor('cfgColorHigh',  'uColorHigh');

document.getElementById('cfgWireframe')?.addEventListener('change', e => {
    // wireframe is per-chunk; toggling it live rebuilds all chunks
    CFG.wireframe = e.target.checked;
    chunkManager.disposeAll();
});


// Settings panel toggle
const btn   = document.getElementById('spBtn');
const panel = document.getElementById('spPanel');
btn?.addEventListener('click', () => panel.classList.toggle('sp-open'));

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
