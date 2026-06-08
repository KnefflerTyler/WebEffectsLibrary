/**
 * main.js — Cloth Simulation bootstrap
 *
 * Architecture:
 *   ClothState  — CPU-side cloth topology + particle state (positions, pins, springs)
 *   GPUCloth    — GPGPU physics (Verlet + Jacobi on GPU via FBO ping-pong)
 *   MeshCollider— OBJ-based collision (SDF baked + uploaded as 3D texture)
 *   Renderer    — WebGL2 rendering (cloth via texelFetch, colliders via solid mesh)
 *   OBJLoader   — fetch/parse .obj files
 */

import { ClothState  } from './ClothState.js';
import { GPUCloth    } from './GPUCloth.js';
import { MeshCollider} from './MeshCollider.js';
import { Renderer    } from './Renderer.js';
import { loadOBJ, parseOBJ, clampOBJ } from './OBJLoader.js';
import { initPanelToggle } from '../../../shared/settings.js';

/* ── Bootstrap ───────────────────────────────────────────────────────────── */

const canvas   = document.getElementById('canvas');
const renderer = new Renderer(canvas);
const state    = new ClothState();
const gpu      = new GPUCloth(renderer.gl);

renderer.init();
window.addEventListener('resize', () => renderer.resize());

/* ── Collider registry ───────────────────────────────────────────────────── */
// Each entry: { name, obj(url), color([r,g,b]), collider(MeshCollider|null),
//               pos([x,y,z]), scale, on(bool), skin }

const COLLIDER_DEFS = [
    { name: 'sphere',  url: 'obj/sphere.obj',  type: 1, color: [0.35, 0.65, 1.0],  scale: 0.5, pos: [0, 0, 0]    },
    { name: 'box',     url: 'obj/box.obj',      type: 2, color: [1.0,  0.55, 0.25], scale: 0.8, pos: [0, -0.6, 0] },
    { name: 'pyramid', url: 'obj/pyramid.obj',  type: 3, color: [0.25, 0.88, 0.45], scale: 1.0, pos: [0, -1.5, 0] },
];

const colliders = {};   // name → { collider, pos, scale, on }

async function loadColliderMeshes() {
    for (const def of COLLIDER_DEFS) {
        const parsed = await loadOBJ(def.url);
        if (!parsed) { console.warn('Could not load', def.url); continue; }

        // Use MeshCollider only to normalise the mesh for rendering
        const mc = new MeshCollider(parsed.vertices, parsed.faces);
        renderer.addColliderMesh(def.name, mc.vertices, mc.faces, def.color);

        colliders[def.name] = { type: def.type, pos: [...def.pos], scale: def.scale, on: false };
    }
}

/* ── Simulation loop ─────────────────────────────────────────────────────── */

let simReady = false;
const SUB    = 3;    // sub-steps per frame

function loop() {
    requestAnimationFrame(loop);
    if (!simReady) return;

    if (gpu.running) {
        for (let s = 0; s < SUB; s++) gpu.step();
    }

    // Build collider list for renderer
    const colList = COLLIDER_DEFS.map(d => {
        const c = colliders[d.name];
        return { name: d.name, pos: c ? c.pos : [0,0,0], scale: c ? c.scale : 1, on: c ? c.on : false };
    });

    renderer.render(gpu, colList, gpu.floorY);
}
requestAnimationFrame(loop);

/* ── Session persistence ──────────────────────────────────────────────────── */
// All settings IDs that should be saved/restored.
// sessionStorage: survives page refresh, cleared when tab is closed.

const SESSION_NS = 'sc:';

const PERSIST_IDS = [
    // Cloth mesh
    'cfgClothType', 'cfgResolution', 'cfgSpacing',
    // Scene
    'cfgPreset',
    // Physics
    'cfgGravity', 'cfgDamping', 'cfgStiffness', 'cfgIterations',
    // Wind
    'cfgWindX', 'cfgWindZ', 'cfgTurbulence',
    // Floor
    'cfgFloor', 'cfgFloorY',
    // Colliders
    'cfgSphereOn',  'cfgSphereScale',  'cfgSphereX',  'cfgSphereY',  'cfgSphereZ',
    'cfgBoxOn',     'cfgBoxScale',     'cfgBoxX',     'cfgBoxY',     'cfgBoxZ',
    'cfgPyramidOn', 'cfgPyramidScale', 'cfgPyramidX', 'cfgPyramidY', 'cfgPyramidZ',
    // Appearance
    'cfgColorA', 'cfgColorB', 'cfgShininess', 'cfgRenderMode',
    'cfgShowPins', 'cfgShowFloor', 'cfgShowColliders',
];

function saveSettings() {
    PERSIST_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const v = el.type === 'checkbox' ? String(el.checked) : el.value;
        sessionStorage.setItem(SESSION_NS + id, v);
    });
}

function restoreSettings() {
    PERSIST_IDS.forEach(id => {
        const stored = sessionStorage.getItem(SESSION_NS + id);
        if (stored === null) return;
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = stored === 'true';
        else el.value = stored;
    });
}

// Restore before anything else runs so initDisplays sees correct values
restoreSettings();

/* ── Start overlay ───────────────────────────────────────────────────────── */

const overlay     = document.getElementById('startOverlay');
const objInput    = document.getElementById('objInput');
let   chosenPreset  = 'corners';
let   pendingOBJText = null;   // holds uploaded OBJ text until launch

// Initialise display values for resolution/spacing on load
(function initDisplays() {
    const res = document.getElementById('cfgResolution');
    const sp  = document.getElementById('cfgSpacing');
    const vRes = document.getElementById('valResolution');
    const vSp  = document.getElementById('valSpacing');
    if (res && vRes) vRes.textContent = `${res.value}×${res.value}`;
    if (sp  && vSp)  vSp.textContent  = parseFloat(sp.value).toFixed(3);
    updateParticleCount();
})();

function updateParticleCount() {
    const res = parseInt(document.getElementById('cfgResolution')?.value ?? '24', 10);
    const el  = document.getElementById('valParticleCount');
    if (!el) return;
    const count = res * res;
    const warn  = count > 4096 ? ' ⚠ slow' : count > 2048 ? ' · medium' : '';
    el.textContent = `${count.toLocaleString()} particles${warn}`;
    el.style.color = count > 4096 ? 'rgba(255,180,60,0.7)' : 'rgba(255,255,255,0.35)';
}

document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        chosenPreset = btn.dataset.preset;
    });
});

document.getElementById('zoneDefault').addEventListener('click', launchDefault);
document.getElementById('zoneUpload').addEventListener('click', () => objInput.click());
document.getElementById('btnLaunch').addEventListener('click', () => {
    if (pendingOBJText) {
        launchFromOBJText(pendingOBJText);
    } else {
        launchDefault();
    }
});

objInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        pendingOBJText = ev.target.result;
        // Visually indicate file is ready
        document.getElementById('zoneUpload').querySelector('.zone-sub').textContent = file.name;
        document.getElementById('zoneUpload').style.borderColor = 'rgba(139,111,239,0.7)';
        document.getElementById('zoneDefault').style.borderColor = '';
    };
    reader.readAsText(file);
    e.target.value = '';
});

// Clear pending OBJ when default zone is clicked
document.getElementById('zoneDefault').addEventListener('click', () => {
    pendingOBJText = null;
    document.getElementById('zoneUpload').querySelector('.zone-sub').textContent = 'Custom mesh cloth';
    document.getElementById('zoneUpload').style.borderColor = '';
    document.getElementById('zoneDefault').style.borderColor = 'rgba(139,111,239,0.7)';
});

function getClothRes()     { return parseInt(document.getElementById('cfgResolution')?.value ?? '24', 10); }
function getClothSpacing() { return parseFloat(document.getElementById('cfgSpacing')?.value  ?? '0.10'); }

function launchDefault() {
    state.initGrid(getClothRes(), getClothRes(), getClothSpacing(), chosenPreset);
    go();
}

function launchFromOBJText(text) {
    let { vertices, faces } = parseOBJ(text);
    if (vertices.length < 3 || faces.length < 3) {
        alert('Could not parse OBJ — using default grid.');
        return launchDefault();
    }
    ({ vertices, faces } = clampOBJ({ vertices, faces }, 16384));
    state.initFromOBJ(vertices, faces);
    go();
}

function go() {
    applyPhysicsSettings();
    applyColliderSettingsToGPU();

    gpu.init(state);
    renderer.uploadClothInit(state);
    // Readback once to sync pin display
    gpu.readback(state);
    renderer.updatePins(state);

    simReady = true;
    overlay.classList.add('hidden');

    // Restore appearance from session (renderer wasn't ready during restoreSettings)
    const colorA = document.getElementById('cfgColorA');
    const colorB = document.getElementById('cfgColorB');
    if (colorA) renderer.colorA = hexRgb(colorA.value);
    if (colorB) renderer.colorB = hexRgb(colorB.value);
    const shin = document.getElementById('cfgShininess');
    if (shin) renderer.shininess = parseInt(shin.value, 10);
    const rm = document.getElementById('cfgRenderMode');
    if (rm) renderer.wireframe = rm.value === 'wireframe' ? 'wireframe' : rm.value === 'both' ? 'both' : false;
    renderer.showPins      = document.getElementById('cfgShowPins')?.checked      ?? true;
    renderer.showFloor     = document.getElementById('cfgShowFloor')?.checked     ?? true;
    renderer.showColliders = document.getElementById('cfgShowColliders')?.checked ?? true;

    // Sync settings panel cloth-type selector to reflect current mesh
    const clothTypeSel = document.getElementById('cfgClothType');
    if (clothTypeSel) {
        clothTypeSel.value = state.isGrid ? 'grid' : 'obj';
        updateClothTypeUI(clothTypeSel.value);
    }
    const presetSel = document.getElementById('cfgPreset');
    if (presetSel && state.isGrid) presetSel.value = chosenPreset;
    updateSimBtn();
}

/* ── Collider settings → GPUCloth ───────────────────────────────────────── */

function applyColliderSettingsToGPU() {
    for (let i = 0; i < COLLIDER_DEFS.length; i++) {
        const def  = COLLIDER_DEFS[i];
        const slot = colliders[def.name];
        if (!slot) { gpu.setCollider(i, null); continue; }

        const pre = cap(def.name);
        slot.pos[0] = parseFloat(document.getElementById(`cfg${pre}X`)?.value     ?? String(slot.pos[0]));
        slot.pos[1] = parseFloat(document.getElementById(`cfg${pre}Y`)?.value     ?? String(slot.pos[1]));
        slot.pos[2] = parseFloat(document.getElementById(`cfg${pre}Z`)?.value     ?? String(slot.pos[2]));
        slot.scale  = parseFloat(document.getElementById(`cfg${pre}Scale`)?.value ?? String(slot.scale));

        gpu.setCollider(i, slot.on ? { type: slot.type, pos: slot.pos, scale: slot.scale } : null);
    }
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

/* ── Physics settings ────────────────────────────────────────────────────── */

function applyPhysicsSettings() {
    const g = (id, def) => {
        const el = document.getElementById(id);
        if (!el) return def;
        return el.type === 'checkbox' ? el.checked : parseFloat(el.value);
    };
    gpu.gravity      = g('cfgGravity',     9.8);
    gpu.damping      = g('cfgDamping',     0.99);
    gpu.stiffness    = g('cfgStiffness',   1.0);
    gpu.iterations   = Math.round(g('cfgIterations', 15));
    gpu.windX        = g('cfgWindX',       0);
    gpu.windZ        = g('cfgWindZ',       0);
    gpu.turbulence   = g('cfgTurbulence',  0.3);
    gpu.floorEnabled = g('cfgFloor',       true);
    gpu.floorY       = g('cfgFloorY',      -2.0);
    gpu.dt           = 1 / 60 / Math.max(1, SUB);
}

/* ── Mode / interaction ──────────────────────────────────────────────────── */

let mode = 'orbit';

document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

document.addEventListener('keydown', e => {
    if (!simReady) return;
    switch (e.key.toLowerCase()) {
        case ' ':  e.preventDefault(); toggleSim(); break;
        case 'o':  setMode('orbit');   break;
        case 'p':  setMode('pin');     break;
        case 'g':  setMode('grab');    break;
    }
});

function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode-btn[data-mode]').forEach(b => b.classList.remove('active'));
    document.querySelector(`.mode-btn[data-mode="${m}"]`)?.classList.add('active');
    updateHint();
}

function updateHint() {
    const hints = {
        orbit: 'Left-drag orbit  |  Right-drag pan  |  Scroll zoom  |  Space start/stop',
        pin:   'Click to pin/unpin cloth particles  |  O — orbit  |  Space start/stop',
        grab:  'Drag cloth particles  |  O — orbit  |  Space start/stop',
    };
    document.getElementById('hint').textContent = hints[mode] ?? '';
}
updateHint();

/* ── Start / Stop toggle ─────────────────────────────────────────────────── */

const btnToggle = document.getElementById('btnSimToggle');
btnToggle.addEventListener('click', toggleSim);

function toggleSim() {
    if (!simReady) return;
    if (gpu.running) {
        // Stop → reset
        gpu.running = false;
        const preset = document.getElementById('cfgPreset')?.value ?? state._preset;
        const clothType = document.getElementById('cfgClothType')?.value ?? (state.isGrid ? 'grid' : 'obj');
        if (clothType === 'grid') {
            state.initGrid(getClothRes(), getClothRes(), getClothSpacing(), preset);
        } else {
            state.reset();
        }
        applyPhysicsSettings();
        applyColliderSettingsToGPU();
        gpu.reinit(state);
        renderer.uploadClothInit(state);
        gpu.readback(state);
        renderer.updatePins(state);
    } else {
        gpu.running = true;
    }
    updateSimBtn();
}

function updateSimBtn() {
    if (gpu.running) {
        btnToggle.textContent = '⏸ Stop';
        btnToggle.classList.add('running');
    } else {
        btnToggle.textContent = '▶ Start';
        btnToggle.classList.remove('running');
    }
}

/* ── Mouse/touch interaction ─────────────────────────────────────────────── */

let dragging=false, dragBtn=-1, lastX=0, lastY=0;
let grabPlaneNormal=[0,0,1], grabPlanePoint=[0,0,0];

canvas.addEventListener('mousedown', e => {
    if (!simReady) return;
    dragging=true; dragBtn=e.button; lastX=e.clientX; lastY=e.clientY;

    if (mode==='pin' && e.button===0) {
        gpu.readback(state);
        const {origin,dir}=renderer.getPickRay(e.clientX, e.clientY);
        const idx=state.pickParticle(origin, dir);
        if (idx>=0) {
            state.togglePin(idx);
            gpu.setParticlePin(idx, !!state.pinned[idx],
                state.posX[idx], state.posY[idx], state.posZ[idx]);
            renderer.updatePins(state);
        }
    }
    if (mode==='grab' && e.button===0) {
        gpu.readback(state);
        const {origin,dir}=renderer.getPickRay(e.clientX, e.clientY);
        const idx=state.pickParticle(origin, dir);
        if (idx>=0) {
            const eye=renderer.getEye();
            const fwd=[renderer.camTarget[0]-eye[0],renderer.camTarget[1]-eye[1],renderer.camTarget[2]-eye[2]];
            const fl=Math.sqrt(fwd[0]**2+fwd[1]**2+fwd[2]**2)||1;
            grabPlaneNormal=[fwd[0]/fl,fwd[1]/fl,fwd[2]/fl];
            grabPlanePoint=[state.posX[idx],state.posY[idx],state.posZ[idx]];
            gpu.setGrab(idx, state.posX[idx], state.posY[idx], state.posZ[idx]);
        }
    }
    e.preventDefault();
});

canvas.addEventListener('mousemove', e => {
    if (!simReady||!dragging) return;
    const dx=e.clientX-lastX, dy=e.clientY-lastY;
    lastX=e.clientX; lastY=e.clientY;

    if (mode==='orbit') {
        if (dragBtn===0) {
            renderer.camAz -= dx*0.008;
            renderer.camEl  = Math.max(-1.4, Math.min(1.4, renderer.camEl - dy*0.008));
        } else if (dragBtn===1||dragBtn===2) {
            const eye=renderer.getEye();
            const fwd=[renderer.camTarget[0]-eye[0],renderer.camTarget[1]-eye[1],renderer.camTarget[2]-eye[2]];
            const fl=Math.sqrt(fwd[0]**2+fwd[1]**2+fwd[2]**2)||1;
            const rgt=normCross(fwd,[0,1,0]);
            const up=normCross(rgt,fwd);
            const spd=renderer.camDist*0.001;
            renderer.camTarget[0]-=(rgt[0]*dx-up[0]*dy)*spd;
            renderer.camTarget[1]-=(rgt[1]*dx-up[1]*dy)*spd;
            renderer.camTarget[2]-=(rgt[2]*dx-up[2]*dy)*spd;
        }
    }

    if (mode==='grab' && gpu._grabEnabled) {
        const pos=renderer.projectOnPlane(e.clientX, e.clientY, grabPlanePoint, grabPlaneNormal);
        if (pos) gpu.setGrab(gpu._grabIdx, pos[0], pos[1], pos[2]);
    }
});

canvas.addEventListener('mouseup',    () => { dragging=false; gpu.clearGrab(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
    if (!simReady) return;
    renderer.camDist = Math.max(0.5, Math.min(20, renderer.camDist + e.deltaY * 0.01));
    e.preventDefault();
}, { passive: false });

function normCross(a, b) {
    const x=a[1]*b[2]-a[2]*b[1],y=a[2]*b[0]-a[0]*b[2],z=a[0]*b[1]-a[1]*b[0];
    const l=Math.sqrt(x*x+y*y+z*z)||1; return[x/l,y/l,z/l];
}

/* ── Settings panel wiring ───────────────────────────────────────────────── */

const hexRgb = h => [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255];

initPanelToggle();

// ── Scene / Preset ─────────────────────────────────────────────────────────

// Cloth type selector: grid ↔ OBJ
function updateClothTypeUI(type) {
    document.getElementById('gridControls').style.display = type === 'grid' ? '' : 'none';
    document.getElementById('objControls').style.display  = type === 'obj'  ? '' : 'none';
}
updateClothTypeUI('grid');   // default on load

document.getElementById('cfgClothType')?.addEventListener('change', e => {
    updateClothTypeUI(e.target.value);
});

// Settings-panel OBJ browse button (replaces running cloth)
let _settingsOBJText = null;
document.getElementById('btnClothOBJ')?.addEventListener('click', () => {
    document.getElementById('clothObjInput').click();
});
document.getElementById('clothObjInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        _settingsOBJText = ev.target.result;
        document.getElementById('lblClothOBJ').textContent = file.name;
        // If already running, apply immediately (stops first)
        if (simReady) {
            gpu.running = false;
            launchFromOBJText(_settingsOBJText);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

// Resolution/Spacing: update display live, apply on Reset
live('cfgResolution', 'valResolution', () => {
    const el = document.getElementById('cfgResolution');
    const vEl = document.getElementById('valResolution');
    if (el && vEl) vEl.textContent = `${el.value}×${el.value}`;
    updateParticleCount();
}, 0);
live('cfgSpacing', 'valSpacing', () => {}, 3);

document.getElementById('btnReset')?.addEventListener('click', () => {
    if (!simReady) return;
    gpu.running = false;
    const preset    = document.getElementById('cfgPreset')?.value ?? 'corners';
    const clothType = document.getElementById('cfgClothType')?.value ?? 'grid';
    if (clothType === 'grid') {
        state.initGrid(getClothRes(), getClothRes(), getClothSpacing(), preset);
    } else if (_settingsOBJText) {
        let { vertices, faces } = parseOBJ(_settingsOBJText);
        ({ vertices, faces } = clampOBJ({ vertices, faces }, 16384));
        state.initFromOBJ(vertices, faces);
    } else {
        state.reset();
    }
    applyPhysicsSettings();
    applyColliderSettingsToGPU();
    gpu.reinit(state);
    renderer.uploadClothInit(state);
    gpu.readback(state);
    renderer.updatePins(state);
    updateSimBtn();
});

document.getElementById('btnClearPins')?.addEventListener('click', () => {
    if (!simReady) return;
    state.clearPins();
    const p = document.getElementById('cfgPreset')?.value;
    if (p && state.isGrid) state.applyPreset(p);
    // Sync pins to GPU
    for (let i=0;i<state.numParticles;i++) {
        gpu.setParticlePin(i, false, state.posX[i], state.posY[i], state.posZ[i]);
    }
    if (p && state.isGrid) {
        for (let i=0;i<state.numParticles;i++) {
            if (state.pinned[i]) gpu.setParticlePin(i, true, state.posX[i], state.posY[i], state.posZ[i]);
        }
    }
    renderer.updatePins(state);
});

document.getElementById('cfgPreset')?.addEventListener('change', e => {
    if (simReady && state.isGrid) {
        state.applyPreset(e.target.value);
        for (let i=0;i<state.numParticles;i++) {
            gpu.setParticlePin(i, !!state.pinned[i], state.posX[i], state.posY[i], state.posZ[i]);
        }
        renderer.updatePins(state);
    }
});

// ── Physics live bindings ───────────────────────────────────────────────────
function live(id, valId, fn, dec=1) {
    const el=document.getElementById(id);
    const vEl=valId?document.getElementById(valId):null;
    if (!el) return;
    el.addEventListener(el.type==='checkbox'||el.tagName==='SELECT'?'change':'input', () => {
        const v=el.type==='checkbox'?el.checked:parseFloat(el.value);
        if(vEl) vEl.textContent=el.type==='checkbox'?'':(+v).toFixed(dec);
        fn(v);
    });
}

live('cfgGravity',    'valGravity',    v => gpu.gravity      = v, 1);
live('cfgDamping',    'valDamping',    v => gpu.damping      = v, 3);
live('cfgStiffness',  'valStiffness',  v => gpu.stiffness    = v, 2);
live('cfgIterations', 'valIterations', v => gpu.iterations   = Math.round(v), 0);
live('cfgWindX',      'valWindX',      v => gpu.windX        = v, 1);
live('cfgWindZ',      'valWindZ',      v => gpu.windZ        = v, 1);
live('cfgTurbulence', 'valTurbulence', v => gpu.turbulence   = v, 2);
live('cfgFloor',      null,            v => gpu.floorEnabled = v);
live('cfgFloorY',     'valFloorY',     v => gpu.floorY       = v, 1);

// ── Appearance ─────────────────────────────────────────────────────────────
document.getElementById('cfgColorA')?.addEventListener('input', e => renderer.colorA = hexRgb(e.target.value));
document.getElementById('cfgColorB')?.addEventListener('input', e => renderer.colorB = hexRgb(e.target.value));
live('cfgShininess', 'valShininess', v => renderer.shininess = v, 0);
document.getElementById('cfgRenderMode')?.addEventListener('change', e => {
    renderer.wireframe = e.target.value==='wireframe'?'wireframe':e.target.value==='both'?'both':false;
});
document.getElementById('cfgShowPins')?.addEventListener('change',  e => renderer.showPins  = e.target.checked);
document.getElementById('cfgShowFloor')?.addEventListener('change', e => renderer.showFloor = e.target.checked);
document.getElementById('cfgShowColliders')?.addEventListener('change', e => renderer.showColliders = e.target.checked);

// ── Collider toggles + position/scale sliders ───────────────────────────────
for (const def of COLLIDER_DEFS) {
    const n   = def.name;
    const pre = cap(n);

    document.getElementById(`cfg${pre}On`)?.addEventListener('change', e => {
        if (!colliders[n]) return;
        colliders[n].on = e.target.checked;
        document.getElementById(`${n}Controls`).style.display = e.target.checked ? 'block' : 'none';
        updateCollider(n);
    });

    for (const axis of ['X','Y','Z','Scale']) {
        document.getElementById(`cfg${pre}${axis}`)?.addEventListener('input', e => {
            const vEl = document.getElementById(`val${pre}${axis}`);
            if (vEl) vEl.textContent = parseFloat(e.target.value).toFixed(2);
            if (!colliders[n]) return;
            const v = parseFloat(e.target.value);
            if (axis==='Scale') colliders[n].scale=v;
            else { const ai=['X','Y','Z'].indexOf(axis); if(ai>=0) colliders[n].pos[ai]=v; }
            updateCollider(n);
        });
    }
}

function updateCollider(name) {
    if (!simReady) return;
    const slot = colliders[name];
    const idx  = COLLIDER_DEFS.findIndex(d => d.name === name);
    if (!slot || idx < 0) { gpu.setCollider(idx, null); return; }

    gpu.setCollider(idx, slot.on ? { type: slot.type, pos: slot.pos, scale: slot.scale } : null);
}

// ── Initialise collider display values ─────────────────────────────────────
for (const def of COLLIDER_DEFS) {
    const pre = cap(def.name);
    document.getElementById(`${def.name}Controls`).style.display = 'none';
    ['X','Y','Z','Scale'].forEach(axis => {
        const el  = document.getElementById(`cfg${pre}${axis}`);
        const vEl = document.getElementById(`val${pre}${axis}`);
        if (el && vEl) vEl.textContent = parseFloat(el.value).toFixed(2);
    });
}

// ── Load collider OBJs and then show overlay ────────────────────────────────
loadColliderMeshes().then(() => {
    overlay.classList.remove('hidden');
});

// ── Apply & Save button ─────────────────────────────────────────────────────
document.getElementById('btnApply')?.addEventListener('click', () => {
    saveSettings();

    // Re-apply all live values in case some changed since last apply
    applyPhysicsSettings();
    applyColliderSettingsToGPU();

    // Appearance (read directly — these aren't in applyPhysicsSettings)
    const colorA = document.getElementById('cfgColorA');
    const colorB = document.getElementById('cfgColorB');
    if (colorA) renderer.colorA = hexRgb(colorA.value);
    if (colorB) renderer.colorB = hexRgb(colorB.value);
    const shin = document.getElementById('cfgShininess');
    if (shin) renderer.shininess = parseInt(shin.value, 10);
    const rm = document.getElementById('cfgRenderMode');
    if (rm) renderer.wireframe = rm.value === 'wireframe' ? 'wireframe' : rm.value === 'both' ? 'both' : false;
    const showPins = document.getElementById('cfgShowPins');
    if (showPins) renderer.showPins = showPins.checked;
    const showFloor = document.getElementById('cfgShowFloor');
    if (showFloor) renderer.showFloor = showFloor.checked;
    const showColl = document.getElementById('cfgShowColliders');
    if (showColl) renderer.showColliders = showColl.checked;

    // Flash the button as visual confirmation
    const btn = document.getElementById('btnApply');
    btn.textContent = '✓ Saved';
    btn.style.background = 'rgba(80,220,120,0.25)';
    btn.style.borderColor = 'rgba(80,220,120,0.7)';
    setTimeout(() => {
        btn.textContent = '↓ Apply & Save Settings';
        btn.style.background = '';
        btn.style.borderColor = '';
    }, 1200);
});
