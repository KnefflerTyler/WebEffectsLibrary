/** CDN URL for Three.js */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export const DEFAULTS = {
    /**
     * Grid shape: 'hex' | 'square' | 'triangle'
     * hex      — flat-top hexagons, shared edges
     * square   — axis-aligned squares, shared edges
     * triangle — equilateral triangles, alternating up/down rows, shared edges
     */
    shape:   'hex',
    /** Circumradius (hex) / side-length (square, triangle) in pixels */
    cellSize: 30,
    /** Base edge / line color */
    color:    0x1a3a5c,
    /**
     * Minimum line opacity when fully outside mouse radius (0–1).
     * Set to near-zero for a gridBreath-style fade-from-invisible effect.
     */
    opacity:  0.01,

    // ── Mouse hover effect ───────────────────────────────────────────────────
    /** Color of lines at full mouse proximity */
    hoverColor:   0x4a9eff,
    /** Influence radius of the mouse cursor in pixels */
    hoverRadius:  200,
    /** Lerp speed when fading in toward the cursor (higher = faster) */
    fadeInSpeed:  8,
    /** Lerp speed when fading out away from the cursor (higher = faster) */
    fadeOutSpeed: 1.2,
};

