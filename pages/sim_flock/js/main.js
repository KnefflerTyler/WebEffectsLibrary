'use strict';

// Debug performance: window.showPerfStats = true (logs FPS + culling + draw calls)

import { CanvasRenderer } from './canvasRenderer.js';
import { Flock } from './flock.js';
import { DEFAULTS } from './config.js';
import Sprite from './sprite/sprite.js';
import { initPanelToggle } from '../../../shared/settings.js';
import GameManager from './gameManager.js';

const canvasElement = document.getElementById('canvas');

const renderer = new CanvasRenderer(canvasElement);

const flock = new Flock({
    width: renderer.width,
    height: renderer.height,
    count: 100, 
    radius: 2,
    color: '#ffffff',
    attraction: 200, 
    drag: 0.94,
    maxSpeed: 500
});

// Settings panel wiring
initPanelToggle();
{
    const key = 'sim_flock:cfgDebugColliders';
    const el = document.getElementById('cfgDebugColliders');
    if (el) {
        // initialize from localStorage
        const stored = localStorage.getItem(key);
        if (stored !== null) el.checked = stored === 'true';
        Sprite.debugColliders = el.checked;
        el.addEventListener('change', () => {
            Sprite.debugColliders = el.checked;
            localStorage.setItem(key, el.checked);
        });
    }
}
// Pause/start button wiring
let paused = false;
{
    const key = 'sim_flock:cfgPause';
    const btn = document.getElementById('cfgPauseBtn');
    const stored = localStorage.getItem(key);
    if (stored !== null) paused = stored === 'true';

    function updateBtn() {
        if (!btn) return;
        btn.textContent = paused ? 'Start' : 'Pause';
    }

    updateBtn();

    if (btn) {
        btn.addEventListener('click', () => {
            paused = !paused;
            localStorage.setItem(key, paused);
            if (!paused) lastTime = performance.now();
            updateBtn();
        });
    }
}

// Default sprites load their own template and image in `DefaultSprite`.
// Keep canvas hidden until assets load
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const loadingBar = document.getElementById('loadingBar');

window.addEventListener('resize', () => {
    renderer.resize();
    flock.resize(renderer.width, renderer.height);
    game.setTarget(flock.target.x, flock.target.y);
});

// Wait for all sprite.ready promises (if present) before showing canvas
async function waitForSpritesLoad() {
    // Wait for flock's shared template to load (instead of 10k individual sprite loads)
    if (flock.templateReady) {
        if (loadingText) loadingText.textContent = 'Loading sprite template...';
        if (loadingBar) loadingBar.style.width = '50%';
        
        try {
            await flock.templateReady;
            if (loadingBar) loadingBar.style.width = '100%';
            if (loadingText) loadingText.textContent = 'Loading complete!';
        } catch (e) {
            console.warn('Template load failed', e);
        }
    }

    // Small delay to show 100%
    await new Promise(resolve => setTimeout(resolve, 200));

    // Hide overlay and show canvas
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    canvasElement.style.display = '';
}

waitForSpritesLoad().catch(e => { console.warn('waitForSpritesLoad failed', e); if (loadingOverlay) loadingOverlay.style.display = 'none'; canvasElement.style.display = ''; });

// Game instance: schedule updates for sprites so rendering isn't blocked
const game = new GameManager({ 
    sprites: flock.sprites, 
    target: flock.target, 
    flock,
    weightBudget: 1000, // High budget for 10k sprites (updates ~10% per frame)
    maxQueueAge: 0.05, // Allow sprites to wait up to 3 frames
});

// Optimize for extreme scale
if (flock.sprites.length > 5000) {
    game.partialSortSize = 500; // Only sort top 500
    game.maxUpdateDistance = 1200; // Aggressive culling
    game.distantUpdateInterval = 10; // Update distant sprites every 10 frames
    renderer.useBatching = true; // Enable batched rendering
}

window.addEventListener('pointermove', event => {
    const rect = canvasElement.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    flock.setTarget(x, y);
    game.setTarget(x, y);
});

let lastTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();
let fps = 0;

function animate() {
    const now = performance.now();

    let dt = (now - lastTime) / 1000;
    lastTime = now;

    // Prevent huge jumps if the tab was inactive
    dt = Math.min(dt, 0.033);

    // Update FPS counter
    frameCount++;
    if (now - lastFpsUpdate >= 1000) {
        fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
        frameCount = 0;
        lastFpsUpdate = now;
    }

    if (!paused) {
        // Game schedules and runs per-sprite updates using weighted queue
        game.update(dt);
    }

    // Always render so the frame stays visible when paused
    renderer.render(game.sprites);

    // Optional: Log performance stats periodically (disable in production)
    if (typeof window.showPerfStats !== 'undefined' && window.showPerfStats && frameCount === 0) {
        const stats = renderer.getStats();
        const drawCalls = stats.drawCalls || '?';
        console.log(`FPS: ${fps} | Total: ${stats.totalSprites} | Rendered: ${stats.renderedSprites} | Culled: ${stats.culledSprites} | Draws: ${drawCalls}`);
    }

    requestAnimationFrame(animate);
}

animate();