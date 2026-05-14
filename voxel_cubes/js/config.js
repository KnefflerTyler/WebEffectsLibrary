/** CDN URL for Three.js */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export const TERRAIN_CONFIG = {
    // ── Voxel dimensions ───────────────────────────────────────────────────────
    /** World units per voxel cell (side length of one quantization step). */
    cellSize:    1.0,
    /** Number of voxel columns per chunk side (X and Z). */
    chunkSize:   18,
    /** Half-amplitude of the noise-driven terrain surface (world units).
     *  Also the quantization range: surface steps in cellSize increments up to this. */
    heightScale: 18.0,

    // ── Perlin / FBM noise ──────────────────────────────────────────────────────
    noiseScale:   0.055,
    octaves:      5,
    persistence:  0.5,
    lacunarity:   2.0,
    noiseSeed:    1337,

    // ── View distance / chunk streaming ────────────────────────────────────────
    viewDistance:   5,
    chunksPerFrame: 2,

    // ── Camera ──────────────────────────────────────────────────────────────────
    /** Fixed camera height above y=0. Should be > heightSteps * cellSize. */
    cameraHeight: 30.0,
    fov:          60,
    moveSpeed:    14.0,
    lookSensitivity: 0.002,

    // ── Rendering ───────────────────────────────────────────────────────────────
    wireframe: false,
    /** Grass color at low elevation (top faces). */
    colorGrass: 0x2d5a1f,
    /** Grass color at high elevation (top faces). */
    colorPeak:  0x6b8f5a,
    /** Dirt color at low elevation (side faces). */
    colorDirt:  0x4a3020,
    /** Rock color at high elevation (side faces). */
    colorRock:  0x756050,
    /** Fog / background color. */
    fogColor:   0x0a0e14,
    fogNear:    50,
    fogFar:     140,

    // ── Lighting ────────────────────────────────────────────────────────────────
    lightDir: [1.2, 2.0, 0.8],
    ambient:  0.22,
};
