/** Shared Three.js CDN */
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

export const GALAXY_CONFIG = {
    /** 'spiral' | 'elliptical' | 'irregular' */
    type: 'irregular',

    /** Seed for the pseudo-random generator (change for a different galaxy) */
    seed: 1,

    /** Number of spiral arms (spiral type only) */
    arms: 3,

    /** Total stars to generate */
    starCount: 160,

    /** Max planets per star */
    maxPlanetsPerStar: 4,

    /** Max moons per planet */
    maxMoonsPerPlanet: 3,

    /** Freely-drifting meteor/asteroid count */
    meteorCount: 90,

    /** Number of black holes */
    blackHoleCount: 2,

    /** Galaxy disk radius (world units) */
    radius: 45,

    /** Starting camera distance */
    cameraDistance: 90,
};
