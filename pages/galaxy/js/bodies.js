import THREE from './three.js';
import { CelestialBody } from './CelestialBody.js';

// ── Palette helpers ──────────────────────────────────────────────────────────

function pick(rng, arr) {
    return new THREE.Color(arr[Math.floor(rng() * arr.length)]);
}

// ── Star ─────────────────────────────────────────────────────────────────────

const STAR_COLORS = [
    0xfff5cc, // G-type  (sun-like, yellow-white)
    0xffd280, // K-type  (orange)
    0xffe8e8, // M-type  (pale red-white)
    0xa8d0ff, // A/B-type (blue-white)
    0xff8844, // Red giant
    0xffffff, // White dwarf
    0xff4444, // Red supergiant
];

export class Star extends CelestialBody {
    /** @param {object} opts  @param {()=>number} [opts.rng] seeded random fn */
    constructor(opts = {}) {
        const rng = opts.rng ?? Math.random;
        super({
            size : opts.size  ?? (1.2  + rng() * 1.2),
            mass : opts.mass  ?? (0.5  + rng() * 2.0),
            color: opts.color ?? pick(rng, STAR_COLORS),
            ...opts,
        });
        this.type       = 'star';
        this.luminosity = 0.4 + (opts.rng ?? Math.random)() * 0.6;
    }
}

// ── Planet ───────────────────────────────────────────────────────────────────

const PLANET_COLORS = [
    0x4a90c4, // ocean blue
    0x8b5c3a, // rusty brown (Mars-like)
    0xa8c488, // green-grey (continental)
    0xe0c870, // sandy/desert
    0xc0d8f0, // icy pale blue
    0xff9966, // volcanic orange
    0xd0b888, // arid tan
    0x7090c8, // gas giant blue
    0xc87050, // copper
    0x60b070, // swamp green
];

export class Planet extends CelestialBody {
    /** @param {object} opts  @param {Star} opts.parentStar */
    constructor(opts = {}) {
        const rng = opts.rng ?? Math.random;
        super({
            size : opts.size  ?? (0.45 + rng() * 0.30),
            mass : opts.mass  ?? (0.1  + rng() * 0.5),
            color: opts.color ?? pick(rng, PLANET_COLORS),
            ...opts,
        });
        this.type       = 'planet';
        this.parentStar = opts.parentStar ?? null;
    }
}

// ── Moon ─────────────────────────────────────────────────────────────────────

const MOON_COLORS = [0xb4b4b4, 0x909090, 0xc8c0a0, 0xa8a8b8, 0xd0cfc0];

export class Moon extends CelestialBody {
    /** @param {object} opts  @param {Planet} opts.parentPlanet */
    constructor(opts = {}) {
        const rng = opts.rng ?? Math.random;
        super({
            size : opts.size  ?? (0.16  + rng() * 0.10),
            mass : opts.mass  ?? 0.01,
            color: opts.color ?? pick(rng, MOON_COLORS),
            ...opts,
        });
        this.type         = 'moon';
        this.parentPlanet = opts.parentPlanet ?? null;
    }
}

// ── Meteor ───────────────────────────────────────────────────────────────────

const METEOR_COLORS = [0x786050, 0x605040, 0x504030, 0x706860, 0x887060];

export class Meteor extends CelestialBody {
    /**
     * @param {object} opts
     * @param {number} [opts.wrapRadius] — respawn when this far from origin
     */
    constructor(opts = {}) {
        const rng = opts.rng ?? Math.random;
        super({
            size : opts.size  ?? (0.10  + rng() * 0.08),
            mass : opts.mass  ?? 0.001,
            color: opts.color ?? pick(rng, METEOR_COLORS),
            ...opts,
        });
        this.type        = 'meteor';
        this.wrapRadius  = opts.wrapRadius ?? 55;
    }

    /** @param {number} dt */
    update(dt) {
        this.updatePhysics(dt);

        // Wrap: when a meteor leaves the galaxy, teleport it to the other side
        // so the field stays populated without spawning/deleting objects.
        if (this.position.length() > this.wrapRadius) {
            this.position.normalize().multiplyScalar(-(this.wrapRadius * 0.85));
        }
    }
}

// ── BlackHole ────────────────────────────────────────────────────────────────

export class BlackHole extends CelestialBody {
    /**
     * @param {object} opts
     * @param {number} [opts.influenceRadius] — radius of gravitational influence
     */
    constructor(opts = {}) {
        const rng = opts.rng ?? Math.random;
        super({
            size : opts.size ?? (2.2  + rng() * 0.8),
            mass : opts.mass ?? 120,
            color: opts.color ?? new THREE.Color(0x050008),
            ...opts,
        });
        this.type            = 'blackhole';
        this.influenceRadius = opts.influenceRadius ?? 18;
        /** Accent color used for the accretion-disk ring mesh */
        this.accretionColor  = new THREE.Color(0x9900ff);
    }
}
