/** CDN URL for Three.js */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

/**
 * html2canvas re-draws DOM elements using Canvas 2D API — unlike SVG
 * foreignObject it never taints the canvas, so WebGL can read the texture.
 */
export const HTML2CANVAS_CDN = 'https://esm.sh/html2canvas@1.4.1';

export const MASK_CONFIG = {

    // ── Gradient background (rendered entirely inside the shader) ─────────────
    // Four colour stops for a 135° linear gradient (top-left → bottom-right).
    // Each colour is a normalised [r, g, b] triple in linear/sRGB space.
    gradientColors: [
        '#ffffff',   // 0 %
        '#f0f0f0',   // 30 %
        '#333333',   // 60 %
        '#000000',   // 100 %
    ],
    /** Normalised stop positions matching gradientColors */
    gradientStops   : [0.0, 0.3, 0.6, 1.0],

    // ── Noise shape ───────────────────────────────────────────────────────────

    /** Spatial frequency – higher values zoom in, adding finer detail */
    scale           : 2,
    /** Animation speed – how fast the noise field drifts */
    speed           : 0.10,
    /** Y-axis drift relative to X (1.0 = same speed, 0.71 = slightly slower) */
    driftRatio      : 0.71,

    // ── Noise shaping ─────────────────────────────────────────────────────────

    /** Power curve applied to the noise output before thresholding.
     *  >1 = more black (tighter bright blobs), <1 = more white (expanded blobs) */
    contrast        : 1,
    /** Scales the noise range around 0.5 — >1 pushes values toward extremes,
     *  <1 compresses everything toward mid-grey (flatter, more uniform field) */
    amplitude       : 0.50,
    /** Shifts all noise values up (+) or down (−) before thresholding.
     *  Positive bias = more gradient visible, negative = more content visible */
    bias            : 0.02,
    /** Blend toward ridged noise (0 = normal fbm, 1 = fully ridged).
     *  Ridged mode inverts peaks into sharp mountain-ridge shapes */
    ridged          : 0,
    /** Domain warp strength – displaces sample coords by a second noise field.
     *  0 = off, higher values add swirling organic distortion */
    warpStrength    : 0.0,
    /** Spatial frequency of the warp noise (independent of main scale) */
    warpScale       : 1.0,

    // ── Mask edge ─────────────────────────────────────────────────────────────

    /** Noise value at which the mask edge sits (0–1).
     *  0.5 = roughly half the screen masked, half revealed */
    threshold       : 0.50,
    /** Blend width around the threshold (0 = hard edge, 1 = very soft) */
    softness        : 0.02,

    // ── FBM octaves ───────────────────────────────────────────────────────────

    /** Number of noise layers stacked (1 = smooth, 8 = very detailed) */
    octaves         : 3,
    /** How much each successive octave's amplitude decreases (0–1) */
    persistence     : 0.50,
    /** How much each successive octave's frequency increases (>1) */
    lacunarity      : 2.00,

    // ── Mask appearance ───────────────────────────────────────────────────────

    /** Maximum erase strength (1 = fully erases where noise >= threshold) */
    maskOpacity     : 1.0,
};
