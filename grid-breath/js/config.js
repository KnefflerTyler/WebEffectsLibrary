/** CDN URL for Three.js */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export const DEFAULTS = {
    /** World-unit gap between adjacent grid points */
    spacing:    1,
    /**
     * Number of grid columns and rows is derived from the viewport aspect ratio
     * so the grid always fills the screen evenly.  This sets the baseline count
     * along the shorter axis.
     */
    gridDensity: 28,
    /** Base point color (dim / resting state) */
    color:       0x1a3a5c,
    /** Color points fade toward as the mouse gets closer */
    hoverColor:  0x56b4f5,
    /** Point size in pixels */
    pointSize:   5,
    /** How much larger a fully-hovered point grows (multiplier on top of pointSize). E.g. 1.5 = 2.5× base size at full hover */
    hoverScale:  1.5,
    /**
     * Mouse influence radius in the same world units as spacing.
     * Points within this radius are brightened; falloff is linear.
     */
    radius:      6,
    /**
     * How quickly points fade IN toward their target alpha when the mouse approaches.
     * Roughly: time to reach ~95% = 3 / fadeInSpeed seconds.
     */
    fadeInSpeed:  8,
    /**
     * How quickly points fade OUT after the mouse leaves.
     * Keep lower than fadeInSpeed so the trail lingers.
     */
    fadeOutSpeed: 1.2,

    // ── Ripple ───────────────────────────────────────────────────────────────
    /** Enable expanding ring ripples from the mouse cursor */
    ripple:          true,
    /** How fast the ring expands in grid units per second */
    rippleSpeed:     6,
    /** Ring thickness in grid units */
    rippleWidth:     5,
    /** Peak alpha the ring adds to points it passes over */
    rippleAlpha:     0.6,
    /** Extra scale multiplier at the peak of the ring (added on top of base 1) */
    rippleScale:     1.25,
    /** How long each ripple lives in seconds */
    rippleLifetime:  4.0,
    /** Milliseconds of stillness before a "mouse stopped" ripple is emitted */
    rippleStopDelay: 60,
};
