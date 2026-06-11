'use strict';

import { CanvasRenderer } from './canvasRenderer.js';
import { Flock } from './flock.js';
import { DEFAULTS } from './config.js';
import { loadSpriteFromJSON } from './spriteLoader.js';

const canvasElement = document.getElementById('canvas');

const renderer = new CanvasRenderer(canvasElement);

const flock = new Flock({
    width: renderer.width,
    height: renderer.height,
    count: 10,
    radius: 2,
    color: '#ffffff',
    attraction: 900,
    drag: 0.92,
    maxSpeed: 600
});

// Load default sprite and set image on flock particles
(async function() {
    try {
        const jsonPath = 'assets/data/sprites/sprite_default.json';
        const { sprite: template, image } = await loadSpriteFromJSON(jsonPath);
        if (image) {
            flock.setSpriteImage(image, template);
        }
    } catch (e) {
        // Ignore load errors — fallback to circle rendering
        console.warn('Failed to load default sprite:', e);
    }
})();

window.addEventListener('resize', () => {
    renderer.resize();
    flock.resize(renderer.width, renderer.height);
});

window.addEventListener('pointermove', event => {
    const rect = canvasElement.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    flock.setTarget(x, y);
});

let lastTime = performance.now();

function animate() {
    const now = performance.now();

    let dt = (now - lastTime) / 1000;
    lastTime = now;

    // Prevent huge jumps if the tab was inactive
    dt = Math.min(dt, 0.033);

    flock.update(dt);

    renderer.render(flock.sprites);

    requestAnimationFrame(animate);
}

animate();