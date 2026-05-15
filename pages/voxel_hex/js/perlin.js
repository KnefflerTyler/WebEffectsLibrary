/**
 * Classic 3D Perlin noise + fractional Brownian motion (fBm).
 * Used to seed the GPU permutation texture for the vertex shader.
 */

const PERM     = new Uint8Array(512);
const PERM_M12 = new Uint8Array(512);

const GRAD3 = [
    [ 1, 1, 0], [-1, 1, 0], [ 1,-1, 0], [-1,-1, 0],
    [ 1, 0, 1], [-1, 0, 1], [ 1, 0,-1], [-1, 0,-1],
    [ 0, 1, 1], [ 0,-1, 1], [ 0, 1,-1], [ 0,-1,-1],
];

export function setSeed(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = (seed ^ 0xdeadbeef) >>> 0;
    for (let i = 255; i > 0; i--) {
        s = Math.imul(s, 1664525) + 1013904223 >>> 0;
        const k = (s >>> 0) % (i + 1);
        const t = p[i]; p[i] = p[k]; p[k] = t;
    }
    for (let i = 0; i < 512; i++) {
        PERM[i]     = p[i & 255];
        PERM_M12[i] = PERM[i] % 12;
    }
}
setSeed(0);

function fade(t)          { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t)    { return a + t * (b - a); }
function dot3(g, x, y, z) { return g[0] * x + g[1] * y + g[2] * z; }

function noise3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A  = PERM[X]     + Y,  AA = PERM[A]     + Z,  AB = PERM[A + 1] + Z;
    const B  = PERM[X + 1] + Y,  BA = PERM[B]     + Z,  BB = PERM[B + 1] + Z;
    return lerp(
        lerp(lerp(dot3(GRAD3[PERM_M12[AA    ]], x,   y,   z  ),
                  dot3(GRAD3[PERM_M12[BA    ]], x-1, y,   z  ), u),
             lerp(dot3(GRAD3[PERM_M12[AB    ]], x,   y-1, z  ),
                  dot3(GRAD3[PERM_M12[BB    ]], x-1, y-1, z  ), u), v),
        lerp(lerp(dot3(GRAD3[PERM_M12[AA + 1]], x,   y,   z-1),
                  dot3(GRAD3[PERM_M12[BA + 1]], x-1, y,   z-1), u),
             lerp(dot3(GRAD3[PERM_M12[AB + 1]], x,   y-1, z-1),
                  dot3(GRAD3[PERM_M12[BB + 1]], x-1, y-1, z-1), u), v),
        w);
}

export function fbm(x, z, octaves, persistence, lacunarity, scale) {
    let value = 0, amp = 1, freq = scale, maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
        value  += noise3(x * freq, 0, z * freq) * amp;
        maxAmp += amp;
        amp    *= persistence;
        freq   *= lacunarity;
    }
    return maxAmp > 0 ? value / maxAmp : 0;
}

/** Returns the 512-entry permutation table. */
export function getPermTable() { return PERM; }
