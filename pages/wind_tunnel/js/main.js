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
import { loadPreset, importOBJ, getObjSphere, getCurrentStats, setObjectChangeCallback, enableCpColoring, setCpTexture } from './objects.js';
import { updateStats, drawLegend, drawCpLegend } from './stats.js';
import { buildPressureVolume, clearPressureVolume, setPressureVolumeVisible,
         setPressureVolumeSize, setPressureVolumeJitter, setPressureVolumeOpacity,
         setCpThreshold } from './pressureVolume.js';
import { buildFlowLines, clearFlowLines, setFlowLinesVisible,
         setFlowLinesOpacity, setFlowLinesAnimated, updateFlowLinesTime,
         setFlowLinesBeadWidth } from './flowLines.js';
import { runBatchSimulation } from './simulate.js';
import { buildPressureMap, disposePressureMap } from './pressureMap.js';
import { initPanelToggle }                   from '../../../shared/settings.js';

// ── One-time setup ────────────────────────────────────────────────────────────
buildRoom();
drawLegend('legend-canvas');
drawCpLegend('legend-cp-canvas');

let _simActive = false;
let _simHandle = null;

// Register callback so objects.js can trigger stats refresh and clear stale sim data
setObjectChangeCallback(stats => {
    const windMs = _getWindMs();
    updateStats(stats, windMs);
    _clearSim();
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

    floorMat.uniforms.uTime.value = _totalTime;
    updateFlowLinesTime(_totalTime);
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// ── Settings panel toggle ─────────────────────────────────────────────────────
initPanelToggle('spBtn', 'spPanel');

document.getElementById('spApplyBtn')?.addEventListener('click', () => {
    document.getElementById('spPanel')?.classList.remove('sp-open');
    document.getElementById('spBtn')?.classList.remove('sp-open');
});

// ── localStorage persistence helpers ─────────────────────────────────────────
const _NS   = 'wt_';
const _save = (id, val) => { try { localStorage.setItem(_NS + id, String(val)); } catch (_) {} };
const _load = id        => { try { return localStorage.getItem(_NS + id);        } catch (_) { return null; } };

// ── Simulation-data serialization (base64 Float32Arrays) ─────────────────────
// Storage budget: 600 paths × 80 steps × 4 arrays × 4 bytes × 1.33 ≈ 1 MB.
// We sample evenly across the full path set so coverage is representative.
const _MAX_STORED_PATHS = 600;
const _STORE_STEP_STRIDE = 6;

function _f32ToB64(arr) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
function _b64ToF32(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(bytes.buffer);
}

function _saveSimPaths(paths3d, preset) {
    try {
        const segs = [];
        // Spread picks evenly across the full path set up to the cap
        const pathStride = Math.max(1, Math.ceil(paths3d.length / _MAX_STORED_PATHS));
        for (let p = 0; p < paths3d.length && segs.length < _MAX_STORED_PATHS; p += pathStride) {
            const { xs, ys, zs, ss } = paths3d[p];
            const n = Math.ceil(xs.length / _STORE_STEP_STRIDE);
            const ax = new Float32Array(n), ay = new Float32Array(n);
            const az = new Float32Array(n), as_ = new Float32Array(n);
            for (let i = 0, j = 0; i < xs.length; i += _STORE_STEP_STRIDE, j++) {
                ax[j] = xs[i]; ay[j] = ys[i]; az[j] = zs[i]; as_[j] = ss[i];
            }
            segs.push([_f32ToB64(ax), _f32ToB64(ay), _f32ToB64(az), _f32ToB64(as_)]);
        }
        const payload = JSON.stringify({ v: 1, preset: preset ?? 'sphere', paths: segs });
        localStorage.setItem('wt_last_sim', payload);
    } catch (e) { console.warn('[wt] Could not save sim:', e.message); }
}

function _loadSimPaths() {
    try {
        const raw = localStorage.getItem('wt_last_sim');
        if (!raw) return null;
        const { v, preset, paths: segs } = JSON.parse(raw);
        if (v !== 1) { localStorage.removeItem('wt_last_sim'); return null; }
        const paths3d = segs.map(([x, y, z, s]) => ({
            xs: _b64ToF32(x), ys: _b64ToF32(y), zs: _b64ToF32(z), ss: _b64ToF32(s),
        }));
        return { paths3d, preset };
    } catch (e) {
        console.warn('[wt] Could not restore sim:', e.message);
        localStorage.removeItem('wt_last_sim');
        return null;
    }
}

// ── Restore persisted settings on load ───────────────────────────────────────
(function _initSettings() {
    /** Set an input's value from localStorage, falling back to `def`. Returns the value used. */
    const _num = (id, def) => {
        const el = document.getElementById(id);
        const v  = _load(id) !== null ? parseFloat(_load(id)) : def;
        if (el) el.value = v;
        return v;
    };
    const _bool = (id, def) => {
        const el = document.getElementById(id);
        const v  = _load(id) !== null ? _load(id) === 'true' : def;
        if (el) el.checked = v;
        return v;
    };

    // Wind
    _num('cfgWindSpeed', 50);
    _num('cfgWindMult',  1.0);

    // Visualisation
    _bool('cfgPressureVolume', true);
    setPressureVolumeVisible(document.getElementById('cfgPressureVolume')?.checked ?? true);
    _bool('cfgFlowLines', true);
    setFlowLinesVisible(document.getElementById('cfgFlowLines')?.checked ?? true);
    _bool('cfgFlowLinesAnimate', true);
    setFlowLinesAnimated(document.getElementById('cfgFlowLinesAnimate')?.checked ?? true);
    setFlowLinesBeadWidth(_num('cfgFLBeadWidth', 0.18));

    // Pressure volume appearance
    setPressureVolumeSize   (_num('cfgPVSize',        140));
    setPressureVolumeJitter (_num('cfgPVJitter',      0.30));
    setPressureVolumeOpacity(_num('cfgPVOpacity',     0.20));
    setCpThreshold          (_num('cfgPVCpThreshold', 0.00));

    // Simulation parameters (read on-demand by _readSimParams; just restore the inputs)
    _num('cfgSimPasses',     3);
    _num('cfgSimParticles',  12000);
    _num('cfgSimSteps',      480);
    _num('cfgSimInfluence',  0.12);
    _num('cfgSimNearThresh', 4.5);
}());

// ── Helpers ───────────────────────────────────────────────────────────────────
function _getWindMult() {
    return parseFloat(document.getElementById('cfgWindMult')?.value ?? '1.0');
}
function _getWindMs() {
    return parseFloat(document.getElementById('cfgWindSpeed')?.value ?? '50') * _getWindMult();
}

/**
 * Read the five simulation-parameter inputs from the settings panel.
 * Falls back to the module-level defaults when an input is missing or invalid.
 * @returns {{ passes, particles, steps, influence, nearThresh }}
 */
function _readSimParams() {
    const _int = (id, def) => { const v = parseInt(document.getElementById(id)?.value, 10); return (isFinite(v) && v > 0) ? v : def; };
    const _flt = (id, def) => { const v = parseFloat(document.getElementById(id)?.value);   return (isFinite(v) && v > 0) ? v : def; };
    return {
        passes    : _int('cfgSimPasses',     3),
        particles : _int('cfgSimParticles',  12000),
        steps     : _int('cfgSimSteps',      480),
        influence : _flt('cfgSimInfluence',  0.12),
        nearThresh: _flt('cfgSimNearThresh', 4.5),
    };
}

// ── Clear simulation results and cancel any in-progress run ────────────────────
// Called automatically when the user switches object or imports an OBJ so stale
// pressure / streamer data from a previous shape is never shown on the new one.
function _clearSim() {
    if (_simHandle) { _simHandle.cancel(); _simHandle = null; }
    if (_simActive) {
        clearPressureVolume();
        clearFlowLines();
        disposePressureMap();
        setCpTexture(null);
        enableCpColoring(false);
        _simActive = false;
    }
    const _btn = document.getElementById('simBtn');
    const _ovr = document.getElementById('simOverlay');
    if (_btn) { _btn.textContent = '⟳ Simulate'; _btn.disabled = false; }
    if (_ovr) { _ovr.style.display = 'none'; }
}

// ── Input: Physical wind speed ────────────────────────────────────────────────
document.getElementById('cfgWindSpeed')?.addEventListener('input', e => {
    updateStats(getCurrentStats(), parseFloat(e.target.value) * _getWindMult());
    _save('cfgWindSpeed', e.target.value);
});

// ── Input: Visual speed multiplier ───────────────────────────────────────────
document.getElementById('cfgWindMult')?.addEventListener('input', e => {
    updateStats(getCurrentStats(), _getWindMs());
    _save('cfgWindMult', e.target.value);
});

// ── Checkbox: Pressure volume ────────────────────────────────────────────────
document.getElementById('cfgPressureVolume')?.addEventListener('change', e => {
    setPressureVolumeVisible(e.target.checked);
    _save('cfgPressureVolume', e.target.checked);
});// ── Checkbox: Flow lines ──────────────────────────────────────────────────
document.getElementById('cfgFlowLines')?.addEventListener('change', e => {
    setFlowLinesVisible(e.target.checked);
    _save('cfgFlowLines', e.target.checked);
});
// ── Checkbox: Flow lines animate ─────────────────────────────────────────────
document.getElementById('cfgFlowLinesAnimate')?.addEventListener('change', e => {
    setFlowLinesAnimated(e.target.checked);
    _save('cfgFlowLinesAnimate', e.target.checked);
});
// ── Input: Flow lines bead width ──────────────────────────────────────────────
document.getElementById('cfgFLBeadWidth')?.addEventListener('input', e => {
    setFlowLinesBeadWidth(parseFloat(e.target.value));
    _save('cfgFLBeadWidth', e.target.value);
});// ── Input: Pressure volume point size ─────────────────────────────────────────
document.getElementById('cfgPVSize')?.addEventListener('input', e => {
    setPressureVolumeSize(parseFloat(e.target.value));
    _save('cfgPVSize', e.target.value);
});

// ── Input: Pressure volume jitter ───────────────────────────────────────────────
document.getElementById('cfgPVJitter')?.addEventListener('input', e => {
    setPressureVolumeJitter(parseFloat(e.target.value));
    _save('cfgPVJitter', e.target.value);
});

// ── Input: Pressure volume opacity ──────────────────────────────────────────────
document.getElementById('cfgPVOpacity')?.addEventListener('input', e => {
    setPressureVolumeOpacity(parseFloat(e.target.value));
    _save('cfgPVOpacity', e.target.value);
});

// ── Input: Pressure volume Cp threshold ─────────────────────────────────────
document.getElementById('cfgPVCpThreshold')?.addEventListener('input', e => {
    setCpThreshold(parseFloat(e.target.value));
    _save('cfgPVCpThreshold', e.target.value);
});

// ── Inputs: Simulation parameters (read on demand; persist on change) ─────────
['cfgSimPasses', 'cfgSimParticles', 'cfgSimSteps', 'cfgSimInfluence', 'cfgSimNearThresh']
    .forEach(id => document.getElementById(id)?.addEventListener('input', e => _save(id, e.target.value)));

// ── Preset buttons ────────────────────────────────────────────────────────────
document.querySelectorAll('.preset-btn[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn[data-shape]').forEach(b => b.classList.remove('active'));
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
const _simOverlay    = document.getElementById('simOverlay');
const _simBar        = document.getElementById('simBar');
const _simStatus     = document.getElementById('simStatus');
const _simProgressEl = document.getElementById('simProgressPhase');
const _simBtn        = document.getElementById('simBtn');

_simBtn?.addEventListener('click', () => {
    // Show overlay in progress state
    _simOverlay.style.display    = 'flex';
    _simProgressEl.style.display = '';
    _simBar.style.width          = '0%';
    _simStatus.textContent       = 'Preparing\u2026';
    _simBtn.disabled             = true;

    // Read simulation parameters from the settings panel (fall back to defaults).
    const { passes: simPasses, particles: simParticles, steps: simSteps,
            influence: simInfluence, nearThresh: simNearThresh } = _readSimParams();
    const simTotal = simPasses * simParticles;

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
            _simActive = true;
            const obj = getObjSphere();

            // Spherical-UV Cp texture → object surface pressure tint
            setCpTexture(buildPressureMap(paths3d, obj));
            enableCpColoring(true);

            // Volumetric pressure point cloud (pass objSphere for analytical wake fill)
            buildPressureVolume(paths3d, obj);
            setPressureVolumeVisible(!!document.getElementById('cfgPressureVolume')?.checked);

            // Speed-coloured flow lines
            buildFlowLines(paths3d);
            setFlowLinesVisible(!!document.getElementById('cfgFlowLines')?.checked);

            // Persist paths so they survive a page reload.
            // Query only buttons with an explicit data-shape (excludes #simBtn).
            const preset = document.querySelector('.preset-btn.active[data-shape]')?.dataset.shape ?? null;
            _saveSimPaths(paths3d, preset);

            _simOverlay.style.display = 'none';
            _simBtn.disabled    = false;
            _simBtn.textContent = '⟳ Simulate';
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

// ── Restore last simulation from localStorage ─────────────────────────────────
// Runs after all listeners are wired so _simActive interactions are safe.
(function _restoreLastSim() {
    const saved = _loadSimPaths();
    if (!saved) return;
    const { paths3d, preset } = saved;

    // Restore the saved object preset (fires objectChangeCallback → _clearSim,
    // but _simActive is false so nothing is destroyed)
    if (preset && preset !== 'sphere') {
        loadPreset(preset);
        document.querySelectorAll('.preset-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.shape === preset);
        });
    }

    const sphere = getObjSphere();
    setCpTexture(buildPressureMap(paths3d, sphere));
    enableCpColoring(true);
    buildPressureVolume(paths3d, sphere);
    setPressureVolumeVisible(!!document.getElementById('cfgPressureVolume')?.checked);
    buildFlowLines(paths3d);
    setFlowLinesVisible(!!document.getElementById('cfgFlowLines')?.checked);
    _simActive = true;
}());
