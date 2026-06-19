'use strict';

// Debug performance: window.showPerfStats = true

import { CanvasRenderer } from './renderers/canvasRenderer.js';
import { WebGLRenderer } from './webglRenderer.js';

import { FlockManager } from './managers/flockManager.js';
import { DEFAULTS } from './config.js';
import Sprite from './sprite/sprite.js';
import { initPanelToggle } from '../../../shared/settings.js';
import GameManager from './managers/gameManager.js';

const canvasElement = document.getElementById('canvas');

// ------------------------------------------------------------
// Renderer setting
// ------------------------------------------------------------

const RENDERER_STORAGE_KEY = 'sim_flock:cfgRenderer';

function getInitialRendererType() {
    const stored = localStorage.getItem(RENDERER_STORAGE_KEY);

    if (stored === 'canvas' || stored === 'webgl') {
        return stored;
    }

    // Default renderer
    return 'canvas';
}

let rendererType = getInitialRendererType();
let renderer = await createRenderer(rendererType);

async function createRenderer(type) {
    if (type === 'webgl') {
        try {
            return await WebGLRenderer.create(canvasElement, {
                enableCulling: true,
                cullMargin: 80,
                maxInstancesPerBatch: 20000,
                backgroundColor: [0.04, 0.05, 0.08, 1.0]
            });
        } catch (e) {
            console.warn('[main] WebGLRenderer failed. Falling back to CanvasRenderer.', e);

            rendererType = 'canvas';
            localStorage.setItem(RENDERER_STORAGE_KEY, 'canvas');

            return new CanvasRenderer(canvasElement);
        }
    }

    return new CanvasRenderer(canvasElement, {
        enableCulling: true,
        cullMargin: 80,
        useBatching: true,
        batchThreshold: 300,
        useFastImagePath: true
    });
}

async function setRendererType(type) {
    if (type !== 'canvas' && type !== 'webgl') return;
    if (type === rendererType) return;

    // Clean up old renderer if supported
    if (renderer && typeof renderer.destroy === 'function') {
        renderer.destroy();
    }

    rendererType = type;
    localStorage.setItem(RENDERER_STORAGE_KEY, rendererType);

    renderer = await createRenderer(rendererType);

    flock.resize(renderer.width, renderer.height);
    game.setTarget(flock.target.x, flock.target.y);

    updateRendererDependentSettings();
}

function isUsingWebGL() {
    return rendererType === 'webgl';
}

// ------------------------------------------------------------
// Flock
// ------------------------------------------------------------

const flock = new FlockManager({
    width: renderer.width,
    height: renderer.height,
    count: 1000,
    radius: 2,
    color: '#ffffff',
    attraction: 500,
    drag: 0.92,
    maxSpeed: 500,

    // Spatial hash / collision settings
    collisions: true,
    avoidance: true,
    gridCellSize: 16,
    collisionIterations: 1,
    positionalCorrection: 1,
    collisionEvents: false
});

// ------------------------------------------------------------
// Settings panel wiring
// ------------------------------------------------------------

initPanelToggle();

// Renderer select setting
{
    const el = document.getElementById('cfgRenderer');

    if (el) {
        el.value = rendererType;

        el.addEventListener('change', () => {
            setRendererType(el.value);
        });
    }
}

// Debug collider setting
const debugColliderKey = 'sim_flock:cfgDebugColliders';
const debugColliderEl = document.getElementById('cfgDebugColliders');

function updateRendererDependentSettings() {
    if (!debugColliderEl) return;

    if (isUsingWebGL()) {
        // WebGLRenderer bypasses sprite.draw(ctx), so Canvas debug collider drawing will not show.
        Sprite.debugColliders = false;
        debugColliderEl.checked = false;
        debugColliderEl.disabled = true;
        return;
    }

    debugColliderEl.disabled = false;

    const stored = localStorage.getItem(debugColliderKey);
    if (stored !== null) {
        debugColliderEl.checked = stored === 'true';
    }

    Sprite.debugColliders = debugColliderEl.checked;
}

{
    if (debugColliderEl) {
        const stored = localStorage.getItem(debugColliderKey);

        if (stored !== null) {
            debugColliderEl.checked = stored === 'true';
        }

        debugColliderEl.addEventListener('change', () => {
            if (isUsingWebGL()) {
                Sprite.debugColliders = false;
                debugColliderEl.checked = false;
                localStorage.setItem(debugColliderKey, 'false');
                return;
            }

            Sprite.debugColliders = debugColliderEl.checked;
            localStorage.setItem(debugColliderKey, debugColliderEl.checked);
        });
    }
}

// ------------------------------------------------------------
// Pause/start button wiring
// ------------------------------------------------------------

let paused = false;

{
    const key = 'sim_flock:cfgPause';
    const btn = document.getElementById('cfgPauseBtn');
    const stored = localStorage.getItem(key);

    if (stored !== null) {
        paused = stored === 'true';
    }

    function updateBtn() {
        if (!btn) return;
        btn.textContent = paused ? 'Start' : 'Pause';
    }

    updateBtn();

    if (btn) {
        btn.addEventListener('click', () => {
            paused = !paused;
            localStorage.setItem(key, paused);

            if (!paused) {
                lastTime = performance.now();
            }

            updateBtn();
        });
    }
}

// Apply debug collider state after renderer is known
updateRendererDependentSettings();

// ------------------------------------------------------------
// Loading overlay
// ------------------------------------------------------------

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const loadingBar = document.getElementById('loadingBar');

async function waitForSpritesLoad() {
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

    await new Promise(resolve => setTimeout(resolve, 200));

    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }

    canvasElement.style.display = '';
}

waitForSpritesLoad().catch(e => {
    console.warn('waitForSpritesLoad failed', e);

    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }

    canvasElement.style.display = '';
});

// ------------------------------------------------------------
// Game instance
// ------------------------------------------------------------

const game = new GameManager({
    sprites: flock.sprites,
    target: flock.target,
    flock,
    weightBudget: 1000,
    maxQueueAge: 0.05,
});


// ------------------------------------------------------------
// Events
// ------------------------------------------------------------

window.addEventListener('resize', () => {
    renderer.resize();
    flock.resize(renderer.width, renderer.height);
    game.setTarget(flock.target.x, flock.target.y);
});

window.addEventListener('pointermove', event => {
    const rect = canvasElement.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    flock.setTarget(x, y);
    game.setTarget(x, y);
});

// ------------------------------------------------------------
// Animation loop
// ------------------------------------------------------------

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

    frameCount++;

    if (now - lastFpsUpdate >= 1000) {
        fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
        frameCount = 0;
        lastFpsUpdate = now;
    }

    if (!paused) {
        game.update(dt);
    }

    renderer.render(game.sprites);

    if (
        typeof window.showPerfStats !== 'undefined' &&
        window.showPerfStats &&
        frameCount === 0
    ) {
        const stats = renderer.getStats ? renderer.getStats() : {};

        console.log(
            `Renderer: ${rendererType} | ` +
            `FPS: ${fps} | ` +
            `Total: ${stats.totalSprites ?? '?'} | ` +
            `Rendered: ${stats.renderedSprites ?? '?'} | ` +
            `Culled: ${stats.culledSprites ?? '?'} | ` +
            `Draws: ${stats.drawCalls ?? '?'} | ` +
            `Batches: ${stats.batches ?? '?'}`
        );
    }

    requestAnimationFrame(animate);
}

animate();