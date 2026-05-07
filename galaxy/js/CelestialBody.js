import THREE from './three.js';

/**
 * CelestialBody — base class for every object in the galaxy simulation.
 *
 * Every body owns:
 *   position     — current world-space position (THREE.Vector3)
 *   velocity     — m/s equivalent (THREE.Vector3)
 *   acceleration — m/s² equivalent (THREE.Vector3)
 *   rotation     — current Euler angles for self-spin
 *
 * Orbital bodies are updated via updateOrbit(); free bodies via updatePhysics().
 */
export class CelestialBody {
    /**
     * @param {object} opts
     * @param {THREE.Vector3} [opts.position]
     * @param {THREE.Vector3} [opts.velocity]
     * @param {THREE.Vector3} [opts.acceleration]
     * @param {number}        [opts.mass]
     * @param {number}        [opts.size]   — cube half-extent in world units
     * @param {THREE.Color}   [opts.color]
     */
    constructor(opts = {}) {
        this.position     = opts.position     ? opts.position.clone()     : new THREE.Vector3();
        this.velocity     = opts.velocity     ? opts.velocity.clone()     : new THREE.Vector3();
        this.acceleration = opts.acceleration ? opts.acceleration.clone() : new THREE.Vector3();

        this.mass  = opts.mass  ?? 1.0;
        this.size  = opts.size  ?? 0.2;
        this.color = opts.color ? opts.color.clone() : new THREE.Color(0xffffff);

        // ── Orbital parameters ──────────────────────────────────────────────
        /** Center of the orbit (updated each frame to the parent's position) */
        this.orbitCenter = new THREE.Vector3();
        /** Distance from orbit center */
        this.orbitRadius = 0;
        /** Current angle around the orbit (radians) */
        this.orbitAngle  = 0;
        /** Angular speed (radians per second) */
        this.orbitSpeed  = 0;
        /**
         * Orbital inclination (radians).
         * 0 = flat in x-z plane; π/2 = polar orbit.
         */
        this.orbitTilt   = 0;

        // ── Self-rotation ───────────────────────────────────────────────────
        /** Spin speed on each axis (rad/s) */
        this.rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.8,
        );
        /** Accumulated Euler angles for instanced-mesh dummy */
        this.rotation = new THREE.Euler(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
        );

        this.type = 'body';
    }

    // ── Physics helpers ──────────────────────────────────────────────────────

    /**
     * Recompute position from orbital parameters.
     * The orbit lies in the x-z plane, tilted by orbitTilt around the x-axis.
     *
     * @param {number}            dt           — delta-time in seconds
     * @param {THREE.Vector3|null} parentPos   — parent body's world position,
     *                                           or null to use this.orbitCenter
     */
    updateOrbit(dt, parentPos) {
        this.orbitAngle += this.orbitSpeed * dt;

        const θ = this.orbitAngle;
        const R = this.orbitRadius;
        const i = this.orbitTilt;

        // Orbit circle in x-z plane rotated by inclination i around x-axis:
        //   x =  cos(θ) * R
        //   y = -sin(θ) * R * sin(i)
        //   z =  sin(θ) * R * cos(i)
        const cx = parentPos ? parentPos.x : this.orbitCenter.x;
        const cy = parentPos ? parentPos.y : this.orbitCenter.y;
        const cz = parentPos ? parentPos.z : this.orbitCenter.z;

        this.position.set(
            cx +  Math.cos(θ) * R,
            cy + -Math.sin(θ) * R * Math.sin(i),
            cz +  Math.sin(θ) * R * Math.cos(i),
        );

        this._spinSelf(dt);
    }

    /**
     * Integrate linear physics (for freely-drifting bodies like meteors).
     * @param {number} dt — delta-time in seconds
     */
    updatePhysics(dt) {
        this.velocity.addScaledVector(this.acceleration, dt);
        this.position.addScaledVector(this.velocity,     dt);
        this._spinSelf(dt);
    }

    /** Apply self-rotation each tick. */
    _spinSelf(dt) {
        this.rotation.x += this.rotationSpeed.x * dt;
        this.rotation.y += this.rotationSpeed.y * dt;
        this.rotation.z += this.rotationSpeed.z * dt;
    }
}
