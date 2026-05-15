/** CDN URL for Three.js */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export const DEFAULTS = {
    /** Minimum ms between automatic rocket launches */
    launchRateMin: 500,
    /** Maximum ms between automatic rocket launches */
    launchRateMax: 1200,

    /** Min sparks spawned per explosion */
    sparkCountMin: 140,
    /** Max sparks spawned per explosion */
    sparkCountMax: 220,

    /** Downward gravitational acceleration in px/s² */
    gravity: 320,

    /** Velocity drag coefficient applied per frame to sparks (0–1) */
    sparkDrag: 0.988,

    /** Rocket head diameter in pixels */
    rocketSize: 22,
    /** Number of trail sample points kept per rocket */
    trailLength: 30,

    /** Base spark diameter in pixels (randomised ± 60 % per spark) */
    sparkSize: 7,

    /**
     * Base spark lifetime in seconds.  Each spark gets a random multiplier
     * of 0.7–1.3 applied on top of this.
     */
    sparkLife: 2.2,
};
