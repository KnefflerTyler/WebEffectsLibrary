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

/** Returns the 512-entry permutation table for upload as a GPU texture. */
export function getPermTable() { return PERM; }
