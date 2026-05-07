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
    color:    0xf7e4d2,
    /**
     * Minimum line opacity when fully outside mouse radius (0–1).
     * Set to near-zero for a gridBreath-style fade-from-invisible effect.
     */
    opacity:    0.05,
    /**
     * Maximum line opacity reached at full hover/spotlight/ripple intensity (0–1).
     * Lets you cap the brightness of all effects below fully opaque.
     */
    maxOpacity: 0.75,

    // ── Mouse hover effect ───────────────────────────────────────────────────
    /** Enable the mouse proximity reveal/hover effect */
    mouseReveal:  false,
    /** Color of lines at full mouse proximity */
    hoverColor:   0xa47951,
    /** Influence radius of the mouse cursor in pixels */
    hoverRadius:  200,
    /** Lerp speed when fading in toward the cursor (higher = faster) */
    fadeInSpeed:  8,
    /** Lerp speed when fading out away from the cursor (higher = faster) */
    fadeOutSpeed: 1.2,

    // ── Ripple effect ──────────────────────────────────────────────────────────
    /** Spawn expanding ring ripples on mouse start/stop */
    ripple:           true,
    /** Ring expansion speed in pixels per second */
    rippleSpeed:      100,
    /** Seconds until a ripple fully fades out */
    rippleLifetime:   10,
    /** Half-width of the ring band in pixels */
    rippleWidth:      100,
    /** Peak alpha contribution at the ring centre */
    rippleAlpha:      0.75,
    /** Milliseconds of no movement before a stop-ripple fires */
    rippleStopDelay:  60,

    // ── Spotlight effect ─────────────────────────────────────────────────────
    /** Enable auto-moving spotlight cursors that mimic the mouse hover effect */
    spotlight:        true,
    /** Spawn a ripple when an expanding ring collides with a spotlight agent */
    spotlightRippleCollision: false,
    /** Number of simultaneous spotlight cursors */
    spotlightCount:   3,
    /** Seconds for a spotlight to traverse its path start-to-end */
    spotlightLifetime: 10,
    /** Minimum pause duration at a waypoint (seconds) */
    spotlightPauseMin: 1,
    /** Maximum pause duration at a waypoint (seconds) */
    spotlightPauseMax: 15,
    /** Cooldown (seconds) before the same spotlight can be hit by a ripple again */
    spotlightRippleCooldown: 5,
    /** Influence radius of each spotlight cursor in pixels (defaults to hoverRadius if not set) */
    spotlightRadius: 300,

    // ── Cube faces ──────────────────────────────────────────────────────────────
    /** Draw 3 interior lines per hex that make it look like the top of a 3-D cube */
    cubeFaces:        true,
    /**
     * Number of columns between each cube-face hex within a selected row.
     * 1 = every hex, 2 = every other, 4 = 3 hexes between each, etc.
     */
    cubeFaceInterval: 4,
    /**
     * Number of rows between each cube-face row.
     * 1 = every row, 4 = 3 rows between each cube row, etc.
     */
    cubeFaceRowInterval: 4,
    /**
     * Column offset applied per *selected* row, staggering the cube positions.
     * Should not be a multiple of cubeFaceInterval.
     * 2 with an interval of 4 gives a pleasing brick-like diagonal offset.
     */
    cubeFaceRowOffset: 2,
};

