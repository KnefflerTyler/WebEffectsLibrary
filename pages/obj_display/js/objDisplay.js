import { DEFAULTS }                        from './config.js';
import { OBJ_VERTEX, OBJ_FRAGMENT }       from './shaders.js';
import { parseMTL }                        from './mtlParser.js';
import { parseOBJ }                        from './objParser.js';
import * as THREE                           from 'three';
import { OrbitControls }                   from 'three/addons/controls/OrbitControls.js';
import { mergeVertices }                   from 'three/addons/utils/BufferGeometryUtils.js';

// ── UI refs ───────────────────────────────────────────────────────────────────
const ui             = document.getElementById('ui');
const objZone        = document.getElementById('objZone');
const mtlZone        = document.getElementById('mtlZone');
const objLabel       = document.getElementById('objLabel');
const mtlLabel       = document.getElementById('mtlLabel');
const objInput       = document.getElementById('objInput');
const mtlInput       = document.getElementById('mtlInput');
const renderBtn      = document.getElementById('renderBtn');
const statusEl       = document.getElementById('status');
const hint           = document.getElementById('hint');
const settingsBtn    = document.getElementById('settingsBtn');
const settingsPanel  = document.getElementById('settingsPanel');
const viewModeSelect = document.getElementById('viewModeSelect');

// ── State ─────────────────────────────────────────────────────────────────────
let objFile = null;
let mtlFile = null;
let textureFiles = {};   // filename → File (drag-dropped alongside)
let autoRotateEnabled = DEFAULTS.AutoRotate > 0;
let currentViewMode = 'solid';

// ── Scene ─────────────────────────────────────────────────────────────────────
const container = document.getElementById('pageBackground');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
container.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
scene.background = new THREE.Color(DEFAULTS.Background);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 1, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Lighting uniforms (shared across materials) ───────────────────────────────
const lightDir   = new THREE.Vector3(...DEFAULTS.LightDir).normalize();
const fillDir    = new THREE.Vector3(...DEFAULTS.FillDir).normalize();
const lightColor = new THREE.Color(...DEFAULTS.LightColor);
const fillColor  = new THREE.Color(...DEFAULTS.FillColor);
const ambient    = new THREE.Color(...DEFAULTS.Ambient);

// ── Material factory ──────────────────────────────────────────────────────────
function buildShaderMaterial(matDef, texture) {
    const Kd = matDef?.Kd ?? [0.7, 0.7, 0.7];
    const Ka = matDef?.Ka ?? DEFAULTS.Ambient;
    const Ks = matDef?.Ks ?? [0.2, 0.2, 0.2];
    const Ns = matDef?.Ns ?? DEFAULTS.Shininess;
    const d  = matDef?.d  ?? 1.0;

    return new THREE.ShaderMaterial({
        vertexShader  : OBJ_VERTEX,
        fragmentShader: OBJ_FRAGMENT,
        transparent   : d < 1.0,
        side          : THREE.DoubleSide,
        uniforms: {
            uDiffuse    : { value: new THREE.Color(...Kd) },
            uAmbient    : { value: new THREE.Color(...Ka).multiply(new THREE.Color(...DEFAULTS.Ambient).addScalar(1)) },
            uSpecular   : { value: new THREE.Color(...Ks) },
            uShininess  : { value: Ns },
            uOpacity    : { value: d },
            uLightDir   : { value: lightDir },
            uLightColor : { value: lightColor },
            uFillDir    : { value: fillDir },
            uFillColor  : { value: fillColor },
            uHasTexture : { value: !!texture },
            uTexture    : { value: texture ?? null },
            uViewMode   : { value: 0 },
        },
    });
}

// ── Persistence helpers ───────────────────────────────────────────────────────
const STORAGE_KEY = 'objViewer_saved';

function readText(file) {
    return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload  = e => res(e.target.result);
        fr.onerror = rej;
        fr.readAsText(file);
    });
}

function readDataURL(file) {
    return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload  = e => res(e.target.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
    });
}

function dataURLtoFile(dataURL, name) {
    const [header, b64] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new File([arr], name, { type: mime });
}

async function saveToStorage() {
    try {
        const data = {
            objName : objFile?.name  ?? null,
            mtlName : mtlFile?.name  ?? null,
            objText : objFile  ? await readText(objFile)  : null,
            mtlText : mtlFile  ? await readText(mtlFile)  : null,
            textures: {},
        };
        for (const [name, file] of Object.entries(textureFiles)) {
            data.textures[name] = await readDataURL(file);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Storage quota exceeded or unavailable — fail silently
    }
}

async function restoreFromStorage() {
    let data;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        data = JSON.parse(raw);
    } catch { return false; }

    if (!data.objText || !data.objName) return false;

    // Rebuild File objects so the existing render path works unchanged
    objFile = new File([data.objText], data.objName, { type: 'text/plain' });
    objLabel.textContent = data.objName;
    objZone.classList.add('has-file');
    renderBtn.disabled = false;

    if (data.mtlText && data.mtlName) {
        mtlFile = new File([data.mtlText], data.mtlName, { type: 'text/plain' });
        mtlLabel.textContent = data.mtlName;
        mtlZone.classList.add('has-file');
    }

    for (const [name, dataURL] of Object.entries(data.textures ?? {})) {
        textureFiles[name] = dataURLtoFile(dataURL, name);
    }

    return true;
}

function loadTextureFromFile(file) {
    return new Promise(res => {
        const url = URL.createObjectURL(file);
        new THREE.TextureLoader().load(url, tex => {
            URL.revokeObjectURL(url);
            res(tex);
        }, undefined, () => res(null));
    });
}

// ── Model builder ─────────────────────────────────────────────────────────────
let modelGroup = null;

async function buildModel(objText, mtlText) {
    // Parse MTL
    const matDefs = mtlText ? parseMTL(mtlText) : new Map();

    // Load textures referenced by MTL
    const textureCache = new Map();
    for (const [, def] of matDefs) {
        if (def.map_Kd && !textureCache.has(def.map_Kd)) {
            const file = textureFiles[def.map_Kd]
                      ?? textureFiles[def.map_Kd.split(/[\\/]/).pop()];
            if (file) {
                textureCache.set(def.map_Kd, await loadTextureFromFile(file));
            }
        }
    }

    // Parse OBJ
    const groups = parseOBJ(objText, THREE);
    if (groups.length === 0) throw new Error('No geometry found in .obj file.');

    // Fallback: first MTL entry used when a group has no usemtl assignment
    const firstDef = matDefs.size > 0 ? matDefs.values().next().value : null;

    // Remove previous model
    if (modelGroup) scene.remove(modelGroup);
    modelGroup = new THREE.Group();

    for (const { materialName, geometry } of groups) {
        const def     = matDefs.get(materialName) ?? firstDef ?? null;
        const texture = def?.map_Kd ? (textureCache.get(def.map_Kd) ?? null) : null;
        const mat     = buildShaderMaterial(def, texture);
        modelGroup.add(new THREE.Mesh(geometry, mat));

        if (def?.edge_color) {
            const merged  = mergeVertices(geometry);
            const edgeGeo = new THREE.EdgesGeometry(merged, def.edge_threshold ?? 0);
            const edgeMat = new THREE.LineBasicMaterial({
                color      : new THREE.Color(...def.edge_color),
                linewidth   : def.edge_width ?? 1,
                transparent : (def.d ?? 1) < 1.0,
                opacity     : def.d ?? 1.0,
            });
            modelGroup.add(new THREE.LineSegments(edgeGeo, edgeMat));
        }
    }

    // Auto-fit camera
    const box    = new THREE.Box3().setFromObject(modelGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    modelGroup.position.sub(center);           // centre at origin
    const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.6;
    camera.position.set(0, maxDim * 0.3, dist);
    camera.near = dist * 0.001;
    camera.far  = dist * 100;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();

    scene.add(modelGroup);
}

// ── Drop-zone helpers ─────────────────────────────────────────────────────────
function highlight(zone, on) {
    zone.classList.toggle('drag-over', on);
}

function setupZone(zone, input, onFile) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragenter', e => { e.preventDefault(); highlight(zone, true);  });
    zone.addEventListener('dragover',  e => { e.preventDefault(); highlight(zone, true);  });
    zone.addEventListener('dragleave', e => { e.preventDefault(); highlight(zone, false); });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        highlight(zone, false);
        const files = [...e.dataTransfer.files];
        onFile(files);
        // Stash any extra files (textures etc.) by filename
        for (const f of files) textureFiles[f.name] = f;
    });
    input.addEventListener('change', () => {
        if (input.files.length) onFile([...input.files]);
    });
}

setupZone(objZone, objInput, files => {
    const f = files.find(f => f.name.toLowerCase().endsWith('.obj'));
    if (!f) return;
    objFile = f;
    objLabel.textContent = f.name;
    objZone.classList.add('has-file');
    renderBtn.disabled = false;
});

setupZone(mtlZone, mtlInput, files => {
    // Accept .mtl and any texture files dropped together
    for (const f of files) textureFiles[f.name] = f;
    const f = files.find(f => f.name.toLowerCase().endsWith('.mtl'));
    if (!f) return;
    mtlFile = f;
    mtlLabel.textContent = f.name;
    mtlZone.classList.add('has-file');
});

// ── Render button ─────────────────────────────────────────────────────────────
renderBtn.addEventListener('click', async () => {
    renderBtn.disabled = true;
    setStatus('Parsing…');
    try {
        const objText = await readText(objFile);
        const mtlText = mtlFile ? await readText(mtlFile) : null;
        setStatus('Building geometry…');
        await buildModel(objText, mtlText);
        await saveToStorage();
        setStatus('');
        ui.classList.add('hidden');
        hint.classList.remove('hidden');
        settingsBtn.style.display = 'flex';
        applyViewMode(currentViewMode);
    } catch (err) {
        setStatus('Error: ' + err.message, true);
        renderBtn.disabled = false;
    }
});

function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#ff6b6b' : '#8aafcc';
}

// ── Settings panel ────────────────────────────────────────────────────────────
const VIEW_MODE_INT = { solid: 0, unlit: 1, normals: 2, depth: 3, clay: 4, wireframe: 0 };

function applyViewMode(mode) {
    if (!modelGroup) return;
    const modeInt = VIEW_MODE_INT[mode] ?? 0;
    const isWireframe = mode === 'wireframe';
    modelGroup.traverse(obj => {
        if (obj.isMesh && obj.material) {
            if (obj.material.uniforms?.uViewMode !== undefined) {
                obj.material.uniforms.uViewMode.value = modeInt;
            }
            obj.material.wireframe = isWireframe;
        }
        if (obj.isLineSegments) {
            obj.visible = !isWireframe;
        }
    });
}

settingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = settingsPanel.classList.toggle('open');
    settingsBtn.classList.toggle('open', open);
});

document.addEventListener('click', e => {
    if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        settingsPanel.classList.remove('open');
        settingsBtn.classList.remove('open');
    }
});

viewModeSelect.addEventListener('change', () => {
    currentViewMode = viewModeSelect.value;
    applyViewMode(currentViewMode);
});

autoRotateCheck.addEventListener('change', () => {
    autoRotateEnabled = autoRotateCheck.checked;
});

document.getElementById('backToUpload').addEventListener('click', () => {
    settingsPanel.classList.remove('open');
    settingsBtn.classList.remove('open');
    ui.classList.remove('hidden');
    hint.classList.add('hidden');
    renderBtn.disabled = objFile === null;
});

// ── Reset on double-click canvas ──────────────────────────────────────────────
renderer.domElement.addEventListener('dblclick', () => {
    ui.classList.remove('hidden');
    hint.classList.add('hidden');
    settingsPanel.classList.remove('open');
    settingsBtn.classList.remove('open');
});

// ── Auto-restore on load ──────────────────────────────────────────────────────
(async () => {
    const restored = await restoreFromStorage();
    if (restored) {
        renderBtn.disabled = true;
        setStatus('Restoring…');
        try {
            const objText = await readText(objFile);
            const mtlText = mtlFile ? await readText(mtlFile) : null;
            await buildModel(objText, mtlText);
            setStatus('');
            ui.classList.add('hidden');
            hint.classList.remove('hidden');
            settingsBtn.style.display = 'flex';
            applyViewMode(currentViewMode);
        } catch (err) {
            setStatus('Restore failed: ' + err.message, true);
            renderBtn.disabled = false;
        }
    }
})();

// ── Animation loop ────────────────────────────────────────────────────────────
(function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (modelGroup && autoRotateEnabled && DEFAULTS.AutoRotate > 0) {
        modelGroup.rotation.y += DEFAULTS.AutoRotate;
    }
    renderer.render(scene, camera);
})();
