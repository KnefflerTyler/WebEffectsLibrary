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
import { buildStreamers, advanceStreamers, setVisibilityRange } from './streamers.js';
import { loadPreset, importOBJ, getObjSphere, getCurrentStats, setObjectChangeCallback } from './objects.js';
import { updateStats, drawLegend }           from './stats.js';
import { N_SX, N_SY, VSIM }                 from './config.js';
import { initPanelToggle }                   from '../../../shared/settings.js';

// ── One-time setup ────────────────────────────────────────────────────────────
buildRoom();
buildStreamers(N_SX, N_SY);
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
    }

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

// ── Slider: Physical wind speed ───────────────────────────────────────────────
document.getElementById('cfgWindSpeed')?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('valWindSpeed').textContent = v;
    updateStats(getCurrentStats(), v * _getWindMult());
});

// ── Slider: Visual speed multiplier ──────────────────────────────────────────
document.getElementById('cfgWindMult')?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('valWindMult').textContent = v.toFixed(1);
    updateStats(getCurrentStats(), _getWindMs());
});

// ── Slider: Streamer columns ──────────────────────────────────────────────────
document.getElementById('cfgStreamerX')?.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    document.getElementById('valStreamerX').textContent = v;
    const nY = parseInt(document.getElementById('cfgStreamerY')?.value ?? N_SY, 10);
    buildStreamers(v, nY);
});

// ── Slider: Streamer rows ─────────────────────────────────────────────────────
document.getElementById('cfgStreamerY')?.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    document.getElementById('valStreamerY').textContent = v;
    const nX = parseInt(document.getElementById('cfgStreamerX')?.value ?? N_SX, 10);
    buildStreamers(nX, v);
});

// ── Slider: Visibility range ──────────────────────────────────────────────────
document.getElementById('cfgVisRange')?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('valVisRange').textContent = v.toFixed(1);
    setVisibilityRange(v);
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
