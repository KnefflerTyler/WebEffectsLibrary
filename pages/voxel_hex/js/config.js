/** CDN URL for Three.js */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export const TERRAIN_CONFIG = {
    // ── Hex cell dimensions ────────────────────────────────────────────────────
    /** Circumradius of each hexagon (center to corner), world units. */
    hexSize:     1.2,
    /** Number of hexagons per chunk in the X (column) direction. */
    chunkCols:   14,
    /** Number of hexagons per chunk in the Z (row) direction. */
    chunkRows:   14,

    // ── Height field ────────────────────────────────────────────────────────────
    /** Maximum surface displacement (world units). */
    heightScale: 14.0,
    /** Vertical quantization step — smaller = more steps / finer blocks. */
    cellSize:    1.0,

    // ── Perlin / FBM noise ──────────────────────────────────────────────────────
    noiseScale:   0.06,
    octaves:      5,
    persistence:  0.5,
    lacunarity:   2.0,
    noiseSeed:    1337,

    // ── View distance / chunk streaming ────────────────────────────────────────
    viewDistance:    6,
    chunksPerFrame:  2,

    // ── Camera ──────────────────────────────────────────────────────────────────
    cameraHeight: 30.0,
    fov:          60,
    moveSpeed:    14.0,
    lookSensitivity: 0.002,

    // ── Rendering ───────────────────────────────────────────────────────────────
    wireframe:   false,
    colorGrass:  0x2d5a1f,
    colorPeak:   0x6b8f5a,
    colorDirt:   0x4a3020,
    colorRock:   0x756050,
    fogColor:    0x0a0e14,
    fogNear:     10,
    fogFar:      200,
    lightDir:    [1.2, 2.0, 0.8],
    ambient:     0.22,
};
