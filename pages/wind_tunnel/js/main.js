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
import { loadPreset, importOBJ, getObjSphere, getCurrentStats, setObjectChangeCallback } from './objects.js';
import { updateStats, drawLegend }           from './stats.js';
import { setPressurePlaneVisible, updatePressurePlane } from './pressurePlane.js';
import { advanceSmoke, setSmokeVisible, setSmokeVisibilityRange, setSmokeCount, setSmokeSizeScale, setSmokeOpacity, setSmokeDotsOnly } from './smoke.js';
import { runBatchSimulation, SIM_N_PARTICLES } from './simulate.js';
import { buildSimGroup, clearSimGroup, isSimGroupActive } from './simStreamers.js';
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

    updatePressurePlane(getObjSphere());
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
    setPressurePlaneVisible(e.target.checked);
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
let _simCanvas = null;   // store latest 2D canvas for Save PNG

const _simOverlay    = document.getElementById('simOverlay');
const _simBar        = document.getElementById('simBar');
const _simStatus     = document.getElementById('simStatus');
const _simProgressEl = document.getElementById('simProgressPhase');
const _simResultEl   = document.getElementById('simResultPhase');
const _simBtn        = document.getElementById('simBtn');

_simBtn?.addEventListener('click', () => {
    // Toggle: if 3-D sim lines are already in the scene, clear them
    if (isSimGroupActive()) {
        clearSimGroup();
        _simBtn.textContent = '⟳ Simulate';
        return;
    }

    // Show overlay in progress state
    _simOverlay.style.display    = 'flex';
    _simProgressEl.style.display = '';
    _simResultEl.style.display   = 'none';
    _simBar.style.width          = '0%';
    _simStatus.textContent       = 'Preparing\u2026';
    _simBtn.disabled             = true;

    _simHandle = runBatchSimulation({
        windMult : _getWindMult(),
        objSphere: getObjSphere(),

        onProgress(p) {
            _simBar.style.width    = `${(p * 100).toFixed(1)}%`;
            _simStatus.textContent =
                `${Math.round(p * SIM_N_PARTICLES).toLocaleString()} \u00a0/\u00a0 ${SIM_N_PARTICLES.toLocaleString()} particles`;
        },

        onComplete(canvas, paths3d) {
            _simHandle = null;
            _simCanvas = canvas;    // keep for Save PNG

            // Inject frozen 3-D streamlines into the scene
            buildSimGroup(paths3d);

            // Switch overlay to result phase
            _simProgressEl.style.display = 'none';
            _simResultEl.style.display   = '';
            document.getElementById('simResultStats').textContent =
                `${paths3d.length.toLocaleString()} streamlines injected into 3D view.`;

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

document.getElementById('simViewBtn')?.addEventListener('click', () => {
    _simOverlay.style.display = 'none';
});

document.getElementById('simSaveBtn')?.addEventListener('click', () => {
    if (!_simCanvas) return;
    const a    = document.createElement('a');
    a.href     = _simCanvas.toDataURL('image/png');
    a.download = 'wind-tunnel-simulation.png';
    a.click();
});
