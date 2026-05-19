/**
 * main.js — entry point for the wind-tunnel simulation.
 *
 * Responsibilities:
 *   • Kick off scene, room, streamers, objects, stats at startup
 *   • Run the requestAnimationFrame loop
 *   • Wire all UI controls to their module functions
 *
 * Dependency order (modules handle their own await):
 *   shaders.js (top-level await) → everything that uses GLSL
 *   scene.js → room.js, streamers.js, objects.js
 *   physics.js → streamers.js, objects.js
 *   All of the above → main.js (this file)
 */
import { renderer, scene, camera, controls } from './scene.js';
import { floorMat, buildRoom }               from './room.js';
import { buildStreamers, advanceStreamers, setVisibilityRange, setStreamersVisible } from './streamers.js';
import { loadPreset, importOBJ, getObjSphere, getCurrentStats, setObjectChangeCallback, enableCpColoring, setCpTexture } from './objects.js';
import { updateStats, drawLegend }           from './stats.js';
import { setPressurePlaneVisible, updatePressurePlane, setPlaneCpTexture } from './pressurePlane.js';
import { buildPressureVolume, clearPressureVolume, setPressureVolumeVisible, isPressureVolumeActive } from './pressureVolume.js';
import { advanceSmoke, setSmokeVisible, setSmokeVisibilityRange, setSmokeCount, setSmokeSizeScale, setSmokeOpacity, setSmokeDotsOnly } from './smoke.js';
import { runBatchSimulation } from './simulate.js';
import { buildSimGroup, clearSimGroup, isSimGroupActive } from './simStreamers.js';
import { buildPressureMap, disposePressureMap } from './pressureMap.js';
import { setVectorFieldVisible, updateVectorField } from './vectorField.js';
import { N_SX, N_SY, VSIM }                 from './config.js';
import { initPanelToggle }                   from '../../../shared/settings.js';

// ── One-time setup ────────────────────────────────────────────────────────────
buildRoom();
buildStreamers(N_SX, N_SY);
setStreamersVisible(false);   // hidden until user enables via checkbox
drawLegend('legend-canvas');

// Register callback so objects.js can trigger stats refresh after a shape change
setObjectChangeCallback(stats => {
    const windMs = _getWindMs();
    updateStats(stats, windMs);
});

// Load default preset (sphere)
loadPreset('sphere');

// ── Animation loop ────────────────────────────────────────────────────────────
let _totalTime = 0;
let _lastMs    = 0;

function animate(ms) {
    requestAnimationFrame(animate);

    const dt = Math.min((ms - _lastMs) / 1000, 0.05);  // cap at 50 ms (20 fps min)
    _lastMs     = ms;
    _totalTime += dt;

    controls.update();

    if (!document.getElementById('cfgPause')?.checked) {
        advanceStreamers(dt, _getWindMult(), getObjSphere());
        advanceSmoke(dt, _getWindMult(), getObjSphere());
    }

    updatePressurePlane(getObjSphere());   // keep analytical plane in sync (pre-sim fallback)
    updateVectorField(_totalTime, _getWindMult(), getObjSphere());
    floorMat.uniforms.uTime.value = _totalTime;
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// ── Settings panel toggle ─────────────────────────────────────────────────────
initPanelToggle('spBtn', 'spPanel');

// ── Helpers ───────────────────────────────────────────────────────────────────
function _getWindMult() {
    return parseFloat(document.getElementById('cfgWindMult')?.value ?? '1.0');
}
function _getWindMs() {
    return parseFloat(document.getElementById('cfgWindSpeed')?.value ?? '50') * _getWindMult();
}

// ── Input: Physical wind speed ────────────────────────────────────────────────
document.getElementById('cfgWindSpeed')?.addEventListener('input', e => {
    updateStats(getCurrentStats(), parseFloat(e.target.value) * _getWindMult());
});

// ── Input: Visual speed multiplier ───────────────────────────────────────────
document.getElementById('cfgWindMult')?.addEventListener('input', () => {
    updateStats(getCurrentStats(), _getWindMs());
});

// ── Input: Streamer columns ───────────────────────────────────────────────────
document.getElementById('cfgStreamerX')?.addEventListener('input', e => {
    const nY = parseInt(document.getElementById('cfgStreamerY')?.value ?? N_SY, 10);
    buildStreamers(parseInt(e.target.value, 10), nY);
});

// ── Input: Streamer rows ──────────────────────────────────────────────────────
document.getElementById('cfgStreamerY')?.addEventListener('input', e => {
    const nX = parseInt(document.getElementById('cfgStreamerX')?.value ?? N_SX, 10);
    buildStreamers(nX, parseInt(e.target.value, 10));
});

// ── Input: Visibility range ───────────────────────────────────────────────────
document.getElementById('cfgVisRange')?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    setVisibilityRange(v);
    setSmokeVisibilityRange(v);
});

// ── Checkbox: Pressure Cp plane ───────────────────────────────────────────────
document.getElementById('cfgPressurePlane')?.addEventListener('change', e => {
    setPressurePlaneVisible(e.target.checked && !isPressureVolumeActive());
    setPressureVolumeVisible(e.target.checked);
});

// ── Checkbox: Smoke particles ─────────────────────────────────────────────────
document.getElementById('cfgSmoke')?.addEventListener('change', e => {
    setSmokeVisible(e.target.checked);
});

// ── Checkbox: Live streamers ──────────────────────────────────────────────────
document.getElementById('cfgStreamers')?.addEventListener('change', e => {
    setStreamersVisible(e.target.checked);
});

// ── Checkbox: Velocity vector field ──────────────────────────────────────────
document.getElementById('cfgVectorField')?.addEventListener('change', e => {
    setVectorFieldVisible(e.target.checked);
});

// ── Input: Smoke particle count ───────────────────────────────────────────────
document.getElementById('cfgSmokeCount')?.addEventListener('input', e => {
    setSmokeCount(parseInt(e.target.value, 10));
});

// ── Input: Smoke puff size ────────────────────────────────────────────────────
document.getElementById('cfgSmokeSizeScale')?.addEventListener('input', e => {
    setSmokeSizeScale(parseFloat(e.target.value));
});

// ── Input: Smoke opacity ──────────────────────────────────────────────────────
document.getElementById('cfgSmokeOpacity')?.addEventListener('input', e => {
    setSmokeOpacity(parseFloat(e.target.value));
});

// ── Checkbox: Smoke dots mode ─────────────────────────────────────────────────
document.getElementById('cfgSmokeDots')?.addEventListener('change', e => {
    setSmokeDotsOnly(e.target.checked);
});

// ── Preset buttons ────────────────────────────────────────────────────────────
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadPreset(btn.dataset.shape);
    });
});

// ── Import OBJ ────────────────────────────────────────────────────────────────
document.getElementById('importBtn')?.addEventListener('click', () => {
    document.getElementById('fileInput')?.click();
});

document.getElementById('fileInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
        // Deselect all preset buttons (custom import is active)
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        importOBJ(ev.target.result);
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
});

// ── Simulate button ───────────────────────────────────────────────────────────
let _simHandle = null;

const _simOverlay    = document.getElementById('simOverlay');
const _simBar        = document.getElementById('simBar');
const _simStatus     = document.getElementById('simStatus');
const _simProgressEl = document.getElementById('simProgressPhase');
const _simBtn        = document.getElementById('simBtn');

_simBtn?.addEventListener('click', () => {
    // Toggle: if 3-D sim lines are already in the scene, clear them
    if (isSimGroupActive()) {
        clearSimGroup();
        clearPressureVolume();
        disposePressureMap();
        setCpTexture(null);
        setPlaneCpTexture(null);
        // Restore analytical plane if checkbox is on
        setPressurePlaneVisible(!!document.getElementById('cfgPressurePlane')?.checked);
        enableCpColoring(false);   // revert object to plain metallic
        _simBtn.textContent = '⟳ Simulate';
        return;
    }

    // Show overlay in progress state
    _simOverlay.style.display    = 'flex';
    _simProgressEl.style.display = '';
    _simBar.style.width          = '0%';
    _simStatus.textContent       = 'Preparing\u2026';
    _simBtn.disabled             = true;

    // Read simulation parameters from the settings panel (fall back to defaults).
    const _int  = (id, def) => { const v = parseInt(document.getElementById(id)?.value, 10);   return (isFinite(v) && v > 0) ? v   : def; };
    const _flt  = (id, def) => { const v = parseFloat(document.getElementById(id)?.value);      return (isFinite(v) && v > 0) ? v   : def; };
    const simPasses    = _int('cfgSimPasses',    3);
    const simParticles = _int('cfgSimParticles', 12000);
    const simSteps     = _int('cfgSimSteps',     480);
    const simInfluence = _flt('cfgSimInfluence', 0.12);
    const simNearThresh= _flt('cfgSimNearThresh',4.5);
    const simTotal     = simPasses * simParticles;

    _simHandle = runBatchSimulation({
        windMult        : _getWindMult(),
        objSphere       : getObjSphere(),
        nPasses         : simPasses,
        particlesPerPass: simParticles,
        nSteps          : simSteps,
        influenceWeight : simInfluence,
        nearThresh      : simNearThresh,

        onProgress(p) {
            _simBar.style.width    = `${(p * 100).toFixed(1)}%`;
            const done = Math.round(p * simTotal);
            _simStatus.textContent =
                `Pass ${Math.min(simPasses, Math.floor(p * simPasses) + 1)} / ${simPasses}\u2002\u00b7\u2002${done.toLocaleString()} / ${simTotal.toLocaleString()} particles`;
        },

        onComplete(canvas, paths3d) {
            _simHandle = null;
            const obj = getObjSphere();
            buildSimGroup(paths3d, obj);
            // Sim-derived surface Cp texture
            const cpTex = buildPressureMap(paths3d, obj);
            setCpTexture(cpTex);
            enableCpColoring(true);
            // 3-D volumetric pressure field (replaces flat plane post-sim)
            buildPressureVolume(paths3d);
            const showPressure = document.getElementById('cfgPressurePlane')?.checked;
            setPressureVolumeVisible(!!showPressure);
            // Hide flat analytical plane — volume supersedes it
            setPressurePlaneVisible(false);
            const planeTex = null;  // plane texture no longer needed
            setPlaneCpTexture(planeTex);
            _simOverlay.style.display = 'none';
            _simBtn.disabled    = false;
            _simBtn.textContent = '✕ Clear Sim';
        },

        onCancel() {
            _simHandle                = null;
            _simOverlay.style.display = 'none';
            _simBtn.disabled          = false;
        },
    });
});

document.getElementById('simCancelBtn')?.addEventListener('click', () => {
    _simHandle?.cancel();
});
