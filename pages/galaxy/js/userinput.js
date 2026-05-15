/**
 * userinput.js — mouse input for the galaxy viewer.
 *
 * Handles:
 *   scroll wheel  → exponential zoom (camDist)
 *   right-click drag → spherical orbit offset (dragPhi, dragTheta)
 *
 * Usage:
 *   import { createInputHandler } from './userinput.js';
 *   const input = createInputHandler(canvas, config);
 *
 *   // Each frame, read:
 *   input.dist        — current zoom distance
 *   input.dragPhi     — cumulative horizontal drag offset (radians)
 *   input.dragTheta   — cumulative vertical   drag offset (radians)
 */

export function createInputHandler(canvas, {
    distDefault,
    distMin,
    distMax,
    zoomSpeed = 0.12,         // fraction of current dist per scroll tick
    dragSensitivity = 0.004,  // radians per pixel dragged
}) {
    let dist       = distDefault;
    let dragPhi    = 0.0;
    let dragTheta  = 0.0;

    const MAX_THETA_DRAG = Math.PI / 2 - 0.05;  // clamp near-poles to avoid gimbal flip

    // ── Scroll zoom ─────────────────────────────────────────────────────────
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY > 0 ? 1 : -1;   // +1 = scroll down = zoom out
        dist = Math.max(distMin, Math.min(distMax, dist * (1 + dir * zoomSpeed)));
    }, { passive: false });

    // ── Right-click drag ─────────────────────────────────────────────────────
    // Suppress the context menu so right-click can be used for drag.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    let dragging  = false;
    let lastX     = 0;
    let lastY     = 0;

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 2) return;   // right button only
        dragging = true;
        lastX    = e.clientX;
        lastY    = e.clientY;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        // Horizontal drag → phi (azimuth).  Drag left = orbit left.
        dragPhi   -= dx * dragSensitivity;

        // Vertical drag → theta offset.  Drag up = look from above.
        // Clamp so we can't flip over a pole.
        dragTheta = Math.max(-MAX_THETA_DRAG, Math.min(MAX_THETA_DRAG, dragTheta + dy * dragSensitivity));
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button !== 2) return;
        dragging = false;
        canvas.style.cursor = '';
    });

    // Stop drag if focus leaves the page (e.g. alt-tab)
    window.addEventListener('blur', () => {
        dragging = false;
        canvas.style.cursor = '';
    });

    return {
        get dist()      { return dist; },
        set dist(v)     { dist = Math.max(distMin, Math.min(distMax, v)); },
        get dragPhi()   { return dragPhi; },
        get dragTheta() { return dragTheta; },
    };
}
