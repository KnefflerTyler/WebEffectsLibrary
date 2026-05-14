/** CDN URL for Three.js */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export const TERRAIN_CONFIG = {
    // ── Chunk dimensions ───────────────────────────────────────────────────────
    /** Number of voxel cells per chunk side (x and z). */
    chunkSize:   16,
    /** World units per voxel cell. */
    cellSize:    1.0,

    // ── Height field ────────────────────────────────────────────────────────────
    /** Voxel rows sampled in the y axis per chunk. */
    heightSteps: 32,
    /** Half-amplitude of the noise-driven terrain surface (world units). */
    heightScale: 10.0,

    // ── Perlin / FBM noise ──────────────────────────────────────────────────────
    /** Base frequency multiplier applied to world (x,z) coordinates. */
    noiseScale:   0.06,
    /** Number of octaves blended together. */
    octaves:      5,
    /** Amplitude decay per octave. */
    persistence:  0.5,
    /** Frequency growth per octave. */
    lacunarity:   2.0,
    /** Seed integer used to initialise the permutation table. */
    noiseSeed:    1337,

    // ── View distance / chunk streaming ────────────────────────────────────────
    /** How many chunks in each cardinal direction to keep loaded. */
    viewDistance:    6,
    chunksPerFrame:  2,

    // ── Camera ──────────────────────────────────────────────────────────────────
    /** Fixed camera height above y = 0 (world units). */
    cameraHeight: 22.0,
    /** Camera FOV in degrees. */
    fov:          60,
    /** Camera movement speed (world units / second). */
    moveSpeed:    14.0,
    /** Camera look sensitivity (radians per pixel). */
    lookSensitivity: 0.002,

    // ── Rendering ───────────────────────────────────────────────────────────────
    /** Show triangle wireframe overlay. */
    wireframe:   false,
    /** Terrain color at low elevations. */
    colorLow:    0x0d2b1a,
    /** Terrain color at mid elevations. */
    colorMid:    0x2e6b3e,
    /** Terrain color at high elevations (peaks). */
    colorHigh:   0x8fa880,
    /** Fog / background color (matches site background). */
    fogColor:    0x0a0e14,
    /** Distance at which fog begins (world units). */
    fogNear:     48,
    /** Distance at which fog reaches full density (world units). */
    fogFar:      130,

    // ── Lighting ────────────────────────────────────────────────────────────────
    /** Directional light direction (unnormalised — shader normalises it). */
    lightDir: [1.2, 2.0, 0.8],
    /** Ambient light contribution [0..1]. */
    ambient:  0.30,

    // ── Marching cubes ─────────────────────────────────────────────────────────
    /** Scalar-field iso-level; the surface is generated at this value. */
    isoLevel: 0.0,
};
