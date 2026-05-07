/** CDN URL for Three.js */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

/** Default grid configuration */
export const DEFAULTS = {
    /** World-unit gap between adjacent points */
    spacing:   2,
    /** Half-width of each XY slab in grid steps (each side) */
    xyExtent:  18,
    /** Number of slabs to keep spawned ahead of the camera */
    numSlabs:  25,
    /** Number of slabs to keep alive behind the camera */
    behindSlabs: 3,
    /** Camera fly-through speed in world units per second */
    speed: 1,
    /** Hex color for both points and mouse lines */
    color:      0x074f89,
    /** Hex color applied to connected points and web lines when the mouse activates them */
    mouseColor: 0xffffff,
    /** World-unit XY radius around the mouse ray for line attraction */
    hitRadius: 2.5,
    /** Maximum number of mouse-attraction line segments per frame */
    maxLines:  4096,
    /**
     * Point-mask sequence — flat array of 0/1 values that gate which grid
     * positions are rendered and interactive.  The mask is tiled continuously
     * across all slabs using a 1-D index: zIdx * width² + row * width + col.
     */
    pointMask: [
        0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0,
        0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0,
        1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0,
        0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0,
        0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
        1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
        0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
        1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
        0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1,
        0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0,
        0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0,
        0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0,
        0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
        0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0,
        0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0,
        0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
        0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0,
        0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0,
        0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1,
        0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
    ],
    /**
     * BFS direction sequence — ordered list of neighbor directions used by
     * MouseWeb.  Each root point is assigned maxConnections consecutive entries
     * (cycling).  Non-root nodes follow their single arrival direction.
     */
    dirSequence: [
        { key: 'L',   dx: -1, dy:  0, dz:  0 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'F',   dx:  0, dy:  0, dz:  1 },
        { key: 'U',   dx:  0, dy:  1, dz:  0 },
        { key: 'RF',  dx:  1, dy:  0, dz:  1 },
        { key: 'UB',  dx:  0, dy:  1, dz: -1 },
        { key: 'UF',  dx:  0, dy:  1, dz:  1 },
        { key: 'D',   dx:  0, dy: -1, dz:  0 },
        { key: 'B',   dx:  0, dy:  0, dz: -1 },
        { key: 'LUF', dx: -1, dy:  1, dz:  1 },
        { key: 'RF',  dx:  1, dy:  0, dz:  1 },
        { key: 'UB',  dx:  0, dy:  1, dz: -1 },
        { key: 'LD',  dx: -1, dy: -1, dz:  0 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'LUF', dx: -1, dy:  1, dz:  1 },
        { key: 'UF',  dx:  0, dy:  1, dz:  1 },
        { key: 'RUF', dx:  1, dy:  1, dz:  1 },
        { key: 'L',   dx: -1, dy:  0, dz:  0 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'F',   dx:  0, dy:  0, dz:  1 },
        { key: 'LU',  dx: -1, dy:  1, dz:  0 },
        { key: 'UF',  dx:  0, dy:  1, dz:  1 },
        { key: 'DB',  dx:  0, dy: -1, dz: -1 },
        { key: 'RU',  dx:  1, dy:  1, dz:  0 },
        { key: 'LD',  dx: -1, dy: -1, dz:  0 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'B',   dx:  0, dy:  0, dz: -1 },
        { key: 'RF',  dx:  1, dy:  0, dz:  1 },
        { key: 'LDF', dx: -1, dy: -1, dz:  1 },
        { key: 'L',   dx: -1, dy:  0, dz:  0 },
        { key: 'RDF', dx:  1, dy: -1, dz:  1 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'D',   dx:  0, dy: -1, dz:  0 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'B',   dx:  0, dy:  0, dz: -1 },
        { key: 'RF',  dx:  1, dy:  0, dz:  1 },
        { key: 'LUF', dx: -1, dy:  1, dz:  1 },
        { key: 'RUF', dx:  1, dy:  1, dz:  1 },
        { key: 'L',   dx: -1, dy:  0, dz:  0 },
        { key: 'RD',  dx:  1, dy: -1, dz:  0 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'B',   dx:  0, dy:  0, dz: -1 },
        { key: 'RF',  dx:  1, dy:  0, dz:  1 },
        { key: 'LDF', dx: -1, dy: -1, dz:  1 },
        { key: 'L',   dx: -1, dy:  0, dz:  0 },
        { key: 'RDF', dx:  1, dy: -1, dz:  1 },
        { key: 'LB',  dx: -1, dy:  0, dz: -1 },
        { key: 'RB',  dx:  1, dy:  0, dz: -1 },
        { key: 'LF',  dx: -1, dy:  0, dz:  1 },
        { key: 'LDB', dx: -1, dy: -1, dz: -1 },
        { key: 'RDB', dx:  1, dy: -1, dz: -1 },
        { key: 'D',   dx:  0, dy: -1, dz:  0 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'B',   dx:  0, dy:  0, dz: -1 },
        { key: 'RF',  dx:  1, dy:  0, dz:  1 },
        { key: 'UB',  dx:  0, dy:  1, dz: -1 },
        { key: 'UF',  dx:  0, dy:  1, dz:  1 },
        { key: 'DB',  dx:  0, dy: -1, dz: -1 },
        { key: 'DF',  dx:  0, dy: -1, dz:  1 },
        { key: 'LUB', dx: -1, dy:  1, dz: -1 },
        { key: 'RUB', dx:  1, dy:  1, dz: -1 },
        { key: 'LUF', dx: -1, dy:  1, dz:  1 },
        { key: 'RUF', dx:  1, dy:  1, dz:  1 },
        { key: 'L',   dx: -1, dy:  0, dz:  0 },
        { key: 'L',   dx: -1, dy:  0, dz:  0 },
        { key: 'LDB', dx: -1, dy: -1, dz: -1 },
        { key: 'RDB', dx:  1, dy: -1, dz: -1 },
        { key: 'D',   dx:  0, dy: -1, dz:  0 },
        { key: 'R',   dx:  1, dy:  0, dz:  0 },
        { key: 'B',   dx:  0, dy:  0, dz: -1 },
        { key: 'RF',  dx:  1, dy:  0, dz:  1 },
        { key: 'LDF', dx: -1, dy: -1, dz:  1 },
        { key: 'L',   dx: -1, dy:  0, dz:  0 },
        { key: 'RDF', dx:  1, dy: -1, dz:  1 },
    ],
    /** MouseWeb-specific settings */
    web: {
        /** Number of BFS hops from each root point (0 = roots only) */
        depth:            1,
        /** Number of neighbor directions assigned to each activated point */
        maxConnections:   1,
        /** Whether deeper BFS levels get increasingly transparent */
        depthFade:        false,
        /** Per-level alpha multiplier when depthFade is true (0–1) */
        depthFadeStrength: 0.25,
    },
};
