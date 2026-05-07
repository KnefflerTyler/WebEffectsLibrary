/**
 * RippleSystem manages expanding ring ripples in pixel-space.
 *
 * Ripples are spawned by the mouse (start/stop of movement) and optionally
 * by spotlight agents (at departure, arrival, and when a ring hits an agent).
 */
export class RippleSystem {
    /**
     * @param {object} cfg  Merged config object (ripple* and spotlightRippleCooldown keys used)
     */
    constructor(cfg) {
        this.cfg     = cfg;
        this.ripples = []; // { x, y, age }

        // Mouse-stop debounce timer
        this._stopTimer   = null;
        this._mouseMoving = false;
    }

    // ── Spawn ─────────────────────────────────────────────────────────────────

    /**
     * Spawn a ripple at the given world-pixel position.
     * @param {number} x
     * @param {number} y
     */
    spawn(x, y) {
        this.ripples.push({ x, y, age: 0 });
    }

    /**
     * Handle a mousemove event. Spawns a ripple on move-start and restarts
     * the stop-debounce timer. Pass the current world-pixel mouse coords.
     * @param {number} wx
     * @param {number} wy
     */
    onMouseMove(wx, wy) {
        if (!this.cfg.ripple || wx === Infinity) return;
        if (!this._mouseMoving) this.spawn(wx, wy);
        this._mouseMoving = true;
        clearTimeout(this._stopTimer);
        this._stopTimer = setTimeout(() => {
            this._mouseMoving = false;
            if (wx !== Infinity) this.spawn(wx, wy);
        }, this.cfg.rippleStopDelay);
    }

    /** Cancel the stop-debounce timer (call on stop/destroy). */
    cancelStopTimer() {
        clearTimeout(this._stopTimer);
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /**
     * Age ripples and prune expired ones.
     * @param {number} dt  Delta-time in seconds
     */
    tick(dt) {
        for (const rip of this.ripples) rip.age += dt;
        for (let j = this.ripples.length - 1; j >= 0; j--) {
            if (this.ripples[j].age >= this.cfg.rippleLifetime) this.ripples.splice(j, 1);
        }
    }

    /**
     * Check each spotlight agent against live ripple rings; spawn a new ripple
     * when a ring's band crosses an agent (with per-agent cooldown to prevent spam).
     * @param {object[]} agents  Spotlight agent array
     * @param {number}   dt      Delta-time in seconds
     */
    checkSpotlightCollisions(agents, dt) {
        if (!this.cfg.ripple || !agents || this.ripples.length === 0) return;
        const { rippleSpeed, rippleWidth, spotlightRippleCooldown } = this.cfg;

        for (const agent of agents) {
            if (agent.rippleCooldown > 0) {
                agent.rippleCooldown -= dt;
                continue;
            }
            for (const rip of this.ripples) {
                const dx    = agent.x - rip.x;
                const dy    = agent.y - rip.y;
                const dist  = Math.sqrt(dx * dx + dy * dy);
                const ringR = rip.age * rippleSpeed;
                if (Math.abs(dist - ringR) < rippleWidth) {
                    this.spawn(agent.x, agent.y);
                    agent.rippleCooldown = spotlightRippleCooldown;
                    break; // one spawn per agent per frame
                }
            }
        }
    }

    // ── Per-vertex contribution ───────────────────────────────────────────────

    /**
     * Return the maximum ripple alpha contribution for a point at (px, py).
     * @param {number} px
     * @param {number} py
     * @returns {number}  0–1
     */
    alphaAt(px, py) {
        const { rippleSpeed, rippleWidth, rippleAlpha, rippleLifetime } = this.cfg;
        let rAlpha = 0;
        for (const rip of this.ripples) {
            const dx       = px - rip.x;
            const dy       = py - rip.y;
            const dist     = Math.sqrt(dx * dx + dy * dy);
            const ringR    = rip.age * rippleSpeed;
            const ringDist = Math.abs(dist - ringR);
            if (ringDist < rippleWidth) {
                const t    = 1 - ringDist / rippleWidth;
                const fade = 1 - rip.age / rippleLifetime;
                rAlpha = Math.max(rAlpha, t * rippleAlpha * fade);
            }
        }
        return rAlpha;
    }
}
