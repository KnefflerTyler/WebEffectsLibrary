import { Star, Planet, Moon, Meteor, BlackHole } from './bodies.js';

// ── Seeded LCG PRNG ──────────────────────────────────────────────────────────

class SeededRandom {
    constructor(seed) {
        this._s = (seed >>> 0) || 1;
    }

    /** Returns a float in [0, 1) */
    next() {
        // Numerical Recipes LCG
        this._s = Math.imul(1664525, this._s) + 1013904223 >>> 0;
        return (this._s >>> 0) / 0x100000000;
    }

    /** Uniform float in [min, max) */
    range(min, max) { return min + this.next() * (max - min); }

    /** Uniform integer in [min, max] */
    int(min, max)   { return min + Math.floor(this.next() * (max - min + 1)); }

    /** Pick one element from an array */
    pick(arr)       { return arr[Math.floor(this.next() * arr.length)]; }

    /** Convenience: return a bound () => number function */
    get fn() { return () => this.next(); }
}

// ── Galaxy ───────────────────────────────────────────────────────────────────

/**
 * Galaxy — procedurally generates a galaxy and simulates it each frame.
 *
 * Supported types:
 *   'spiral'      — logarithmic-spiral arms, flat disk
 *   'elliptical'  — ellipsoidal star distribution
 *   'irregular'   — no organised structure
 *
 * Call update(dt) every frame to advance the simulation.
 */
export class Galaxy {
    /**
     * @param {import('./config.js').GALAXY_CONFIG} config
     */
    constructor(config) {
        this.config = config;
        this.rng    = new SeededRandom(config.seed);
        this.type   = config.type;

        this.stars      = [];
        this.planets    = [];
        this.moons      = [];
        this.meteors    = [];
        this.blackHoles = [];

        this._generate();
    }

    /** Flat list of every body in draw order */
    get allBodies() {
        return [
            ...this.blackHoles,
            ...this.stars,
            ...this.planets,
            ...this.moons,
            ...this.meteors,
        ];
    }

    // ── Generation ───────────────────────────────────────────────────────────

    _generate() {
        const { starCount, arms, radius, type,
                maxPlanetsPerStar, maxMoonsPerPlanet,
                meteorCount, blackHoleCount } = this.config;

        // Black holes first — placed near the galactic centre
        for (let i = 0; i < blackHoleCount; i++) {
            const bh = new BlackHole({ rng: this.rng.fn, size: this.rng.range(0.7, 1.3) });
            bh.orbitRadius = this.rng.range(0.5, 3.5);
            bh.orbitAngle  = this.rng.range(0, Math.PI * 2);
            bh.orbitSpeed  = this.rng.range(0.001, 0.003);
            bh.orbitTilt   = this.rng.range(-0.4, 0.4);
            bh.orbitCenter.set(0, 0, 0);
            this.blackHoles.push(bh);
        }

        // Stars
        for (let s = 0; s < starCount; s++) {
            const star = this._buildStar(s, starCount, arms, radius, type);
            this.stars.push(star);

            // Planets orbiting this star
            const numPlanets = this.rng.int(0, maxPlanetsPerStar);
            for (let p = 0; p < numPlanets; p++) {
                const planet = this._buildPlanet(star, p);
                this.planets.push(planet);

                // Moons orbiting this planet
                const numMoons = this.rng.int(0, maxMoonsPerPlanet);
                for (let m = 0; m < numMoons; m++) {
                    this.moons.push(this._buildMoon(planet, m));
                }
            }
        }

        // Meteors / asteroids drifting freely
        for (let m = 0; m < meteorCount; m++) {
            this.meteors.push(this._buildMeteor(radius));
        }
    }

    // ── Star placement ───────────────────────────────────────────────────────

    _buildStar(index, total, arms, radius, galaxyType) {
        const star = new Star({ rng: this.rng.fn });

        let orbitRadius, orbitAngle;

        if (galaxyType === 'spiral') {
            // Distribute stars across arms with logarithmic spiral offset
            const arm        = index % arms;
            const armAngle   = (arm / arms) * Math.PI * 2;
            const t          = 0.04 + this.rng.next() * 0.96; // normalised distance [0.04, 1]
            const spread     = this.rng.range(-0.5, 0.5) * (1 - t * 0.4);

            orbitRadius = t * radius;
            // Logarithmic spiral: winding angle grows with ln(r)
            orbitAngle  = armAngle
                          + Math.log(orbitRadius + 1) * 1.6
                          + this.rng.range(-0.15, 0.15);

            const height = this.rng.range(-1, 1) * (1 - t) * radius * 0.06;

            star.position.set(
                Math.cos(orbitAngle) * orbitRadius + spread * radius * 0.08,
                height,
                Math.sin(orbitAngle) * orbitRadius + spread * radius * 0.08,
            );

        } else if (galaxyType === 'elliptical') {
            const θ = this.rng.range(0, Math.PI * 2);
            const φ = Math.acos(this.rng.range(-1, 1));
            const r = radius * Math.cbrt(this.rng.next()); // cube-root for uniform volume

            orbitRadius = r;
            orbitAngle  = θ;

            star.position.set(
                r * Math.sin(φ) * Math.cos(θ),
                r * Math.sin(φ) * Math.sin(θ) * 0.35, // flattened Y
                r * Math.cos(φ),
            );

        } else { // irregular
            orbitRadius = this.rng.range(1, radius);
            orbitAngle  = this.rng.range(0, Math.PI * 2);

            star.position.set(
                this.rng.range(-radius, radius),
                this.rng.range(-radius * 0.18, radius * 0.18),
                this.rng.range(-radius, radius),
            );
        }

        // Near-solid-body rotation keeps the spiral arm shape intact.
        // All stars orbit at roughly the same angular speed, with tiny variation.
        star.orbitRadius = orbitRadius;
        star.orbitAngle  = orbitAngle;
        star.orbitSpeed  = 0.004 * this.rng.range(0.95, 1.05);
        star.orbitTilt   = this.rng.range(-0.12, 0.12);
        star.orbitCenter.set(0, 0, 0);

        return star;
    }

    // ── Planet placement ─────────────────────────────────────────────────────

    _buildPlanet(star, index) {
        const planet = new Planet({ rng: this.rng.fn, parentStar: star });

        const inner = star.size * 2.0 + 0.4;
        const outer = inner + 1.6 + index * 0.7;

        planet.orbitRadius = this.rng.range(inner, outer);
        planet.orbitAngle  = this.rng.range(0, Math.PI * 2);
        planet.orbitSpeed  = this.rng.range(0.05, 0.11)
                             / Math.sqrt(planet.orbitRadius);
        planet.orbitTilt   = this.rng.range(-0.25, 0.25);

        planet.position
            .copy(star.position)
            .add({ x: Math.cos(planet.orbitAngle) * planet.orbitRadius,
                   y: 0,
                   z: Math.sin(planet.orbitAngle) * planet.orbitRadius });

        return planet;
    }

    // ── Moon placement ───────────────────────────────────────────────────────

    _buildMoon(planet, index) {
        const moon = new Moon({ rng: this.rng.fn, parentPlanet: planet });

        const inner = planet.size * 2.2 + 0.1;
        const outer = inner + 0.3 + index * 0.12;

        moon.orbitRadius = this.rng.range(inner, outer);
        moon.orbitAngle  = this.rng.range(0, Math.PI * 2);
        moon.orbitSpeed  = this.rng.range(0.12, 0.30) / Math.sqrt(moon.orbitRadius);
        moon.orbitTilt   = this.rng.range(-0.5, 0.5);

        moon.position
            .copy(planet.position)
            .add({ x: Math.cos(moon.orbitAngle) * moon.orbitRadius,
                   y: 0,
                   z: Math.sin(moon.orbitAngle) * moon.orbitRadius });

        return moon;
    }

    // ── Meteor placement ─────────────────────────────────────────────────────

    _buildMeteor(radius) {
        const meteor = new Meteor({
            rng        : this.rng.fn,
            wrapRadius : radius * 1.2,
        });

        const angle  = this.rng.range(0, Math.PI * 2);
        const r      = this.rng.range(0, radius * 1.05);
        const height = this.rng.range(-radius * 0.12, radius * 0.12);

        meteor.position.set(Math.cos(angle) * r, height, Math.sin(angle) * r);

        // Mostly tangential velocity gives a sense of orbital motion
        const speed    = this.rng.range(0.10, 0.55);
        const velAngle = angle + Math.PI * 0.5 + this.rng.range(-0.6, 0.6);
        meteor.velocity.set(
            Math.cos(velAngle) * speed,
            this.rng.range(-0.15, 0.15) * speed,
            Math.sin(velAngle) * speed,
        );

        return meteor;
    }

    // ── Simulation update ────────────────────────────────────────────────────

    /**
     * Advance the simulation by dt seconds.
     * Call every animation frame before updating instance matrices.
     * @param {number} dt  delta-time in seconds
     */
    update(dt) {
        for (const bh     of this.blackHoles) bh.updateOrbit(dt, null);
        for (const star   of this.stars)      star.updateOrbit(dt, null);
        for (const planet of this.planets)    planet.updateOrbit(dt, planet.parentStar.position);
        for (const moon   of this.moons)      moon.updateOrbit(dt, moon.parentPlanet.position);
        for (const meteor of this.meteors)    meteor.update(dt);
    }
}
