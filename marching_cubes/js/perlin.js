/**
 * Classic 3D Perlin noise + fractional Brownian motion (fBm).
 *
 * Usage:
 *   import { setSeed, fbm } from './perlin.js';
 *   setSeed(1337);
 *   const h = fbm(worldX, worldZ, octaves, persistence, lacunarity, scale);
 *   // returns a value roughly in [-1, 1]
 */

// ── Permutation table ─────────────────────────────────────────────────────────
const PERM      = new Uint8Array(512);
const PERM_M12  = new Uint8Array(512);   // PERM[i] % 12

// 3-D gradient directions (unit vectors on the 12 edges of a cube)
const GRAD3 = [
    [ 1, 1, 0], [-1, 1, 0], [ 1,-1, 0], [-1,-1, 0],
    [ 1, 0, 1], [-1, 0, 1], [ 1, 0,-1], [-1, 0,-1],
    [ 0, 1, 1], [ 0,-1, 1], [ 0, 1,-1], [ 0,-1,-1],
];

/**
 * Seed the permutation table with a reproducible shuffle.
 * @param {number} seed  Any integer.
 */
export function setSeed(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // LCG-based Fisher-Yates shuffle — cheap and good enough for noise
    let s = (seed ^ 0xdeadbeef) >>> 0;
    for (let i = 255; i > 0; i--) {
        s = Math.imul(s, 1664525) + 1013904223 >>> 0;
        const j = s >>> 0;
        const k = j % (i + 1);
        const t = p[i]; p[i] = p[k]; p[k] = t;
    }
    for (let i = 0; i < 512; i++) {
        PERM[i]     = p[i & 255];
        PERM_M12[i] = PERM[i] % 12;
    }
}

// Initialise with a default seed so the module is usable without calling setSeed
setSeed(0);

// ── Internal helpers ──────────────────────────────────────────────────────────
function fade(t)          { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t)    { return a + t * (b - a); }
function dot3(g, x, y, z) { return g[0] * x + g[1] * y + g[2] * z; }

// ── Core 3-D Perlin noise ─────────────────────────────────────────────────────
/**
 * Raw 3-D Perlin noise.  Returns a value in roughly [-1, 1].
 * For terrain height just pass z = 0.
 */
function noise3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);

    const A  = PERM[X]   + Y;
    const AA = PERM[A]   + Z;  const AB = PERM[A + 1] + Z;
    const B  = PERM[X + 1] + Y;
    const BA = PERM[B]   + Z;  const BB = PERM[B + 1] + Z;

    return lerp(
        lerp(
            lerp(dot3(GRAD3[PERM_M12[AA    ]], x,     y,     z    ),
                 dot3(GRAD3[PERM_M12[BA    ]], x - 1, y,     z    ), u),
            lerp(dot3(GRAD3[PERM_M12[AB    ]], x,     y - 1, z    ),
                 dot3(GRAD3[PERM_M12[BB    ]], x - 1, y - 1, z    ), u), v),
        lerp(
            lerp(dot3(GRAD3[PERM_M12[AA + 1]], x,     y,     z - 1),
                 dot3(GRAD3[PERM_M12[BA + 1]], x - 1, y,     z - 1), u),
            lerp(dot3(GRAD3[PERM_M12[AB + 1]], x,     y - 1, z - 1),
                 dot3(GRAD3[PERM_M12[BB + 1]], x - 1, y - 1, z - 1), u), v),
        w);
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Fractional Brownian Motion — sums `octaves` noise layers.
 *
 * @param {number} x           World X coordinate.
 * @param {number} z           World Z coordinate.
 * @param {number} octaves     Number of noise octaves.
 * @param {number} persistence Amplitude decay per octave.
 * @param {number} lacunarity  Frequency growth per octave.
 * @param {number} scale       Base frequency multiplier.
 * @returns {number}  Value in roughly [-1, 1].
 */
export function fbm(x, z, octaves, persistence, lacunarity, scale) {
    let value   = 0;
    let amp     = 1;
    let freq    = scale;
    let maxAmp  = 0;

    for (let i = 0; i < octaves; i++) {
        value  += noise3(x * freq, 0, z * freq) * amp;
        maxAmp += amp;
        amp    *= persistence;
        freq   *= lacunarity;
    }
    return value / maxAmp;   // normalised to approximately [-1, 1]
}

/**
 * Returns the 512-entry permutation table populated by the last setSeed() call.
 * Used to upload the table as a GPU texture for GLSL noise evaluation.
 * @returns {Uint8Array}
 */
export function getPermTable() { return PERM; }
