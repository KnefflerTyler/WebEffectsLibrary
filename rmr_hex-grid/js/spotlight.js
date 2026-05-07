// ── Bézier helpers ────────────────────────────────────────────────────────────

/**
 * Approximate arc-length of a quadratic Bézier by sampling N segments.
 */
function bezierLength(p0x, p0y, p1x, p1y, p2x, p2y, N = 12) {
    let len = 0, lx = p0x, ly = p0y;
    for (let i = 1; i <= N; i++) {
        const t  = i / N, mt = 1 - t;
        const bx = mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x;
        const by = mt * mt * p0y + 2 * mt * t * p1y + t * t * p2y;
        const dx = bx - lx, dy = by - ly;
        len += Math.sqrt(dx * dx + dy * dy);
        lx = bx; ly = by;
    }
    return len;
}

// ── Agent lifecycle ───────────────────────────────────────────────────────────

/**
 * Returns true if (x, y) is within minDist of any other agent's
 * current position OR queued destination.
 */
function isTooClose(x, y, self, agents, minDist) {
    const d2 = minDist * minDist;
    for (const a of agents) {
        if (a === self) continue;
        const cx = x - a.x, cy = y - a.y;
        if (cx * cx + cy * cy < d2) return true;
        // also avoid landing on another agent's destination
        if (a.state === 'moving') {
            const dx = x - a.p2x, dy = y - a.p2y;
            if (dx * dx + dy * dy < d2) return true;
        }
    }
    return false;
}

function startNewPath(agent, w, h, cfg, allAgents) {
    agent.p0x = agent.x;
    agent.p0y = agent.y;
    const minDist = cfg.spotlightRadius ?? 200;
    const MAX_TRIES = 12;
    let tries = 0;
    do {
        agent.p2x = (Math.random() - 0.5) * w * 0.9;
        agent.p2y = (Math.random() - 0.5) * h * 0.9;
        tries++;
    } while (tries < MAX_TRIES && allAgents && isTooClose(agent.p2x, agent.p2y, agent, allAgents, minDist));

    const useArc = Math.random() < 0.55;
    agent.pathType = useArc ? 'arc' : 'line';

    if (useArc) {
        const mx    = (agent.p0x + agent.p2x) / 2;
        const my    = (agent.p0y + agent.p2y) / 2;
        const dx    = agent.p2x - agent.p0x;
        const dy    = agent.p2y - agent.p0y;
        const len   = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx    = -dy / len;
        const ny    =  dx / len;
        const bulge = (Math.random() - 0.5) * len * 0.65;
        agent.p1x   = mx + nx * bulge;
        agent.p1y   = my + ny * bulge;
        // bezierLength kept for potential future use; tSpeed uses lifetime only
        bezierLength(agent.p0x, agent.p0y, agent.p1x, agent.p1y, agent.p2x, agent.p2y);
    }

    agent.tSpeed = 1 / (cfg.spotlightLifetime || 4);
    agent.t      = 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an array of spotlight agent objects at random positions.
 * @param {number} count
 * @param {number} w    Canvas width in pixels
 * @param {number} h    Canvas height in pixels
 * @param {object} cfg  Merged config object
 * @returns {object[]}
 */
export function createSpotlightAgents(count, w, h, cfg) {
    const agents  = [];
    const minDist = (cfg && cfg.spotlightRadius) ? cfg.spotlightRadius : 200;
    const MAX_TRIES = 20;
    for (let i = 0; i < count; i++) {
        let x, y, tries = 0;
        do {
            x = (Math.random() - 0.5) * w;
            y = (Math.random() - 0.5) * h;
            tries++;
        } while (tries < MAX_TRIES && isTooClose(x, y, null, agents, minDist));
        agents.push({
            x,
            y,
            state:          'paused',
            pauseTimer:     Math.random() * 1.5,  // stagger initial starts
            pauseDuration:  0,
            p0x: 0, p0y: 0,
            p1x: 0, p1y: 0,
            p2x: 0, p2y: 0,
            pathType:       'line',
            t:              0,
            tSpeed:         0,
            rippleCooldown: 0,
        });
    }
    return agents;
}

/**
 * Advance all agents by one timestep.
 * When cfg.ripple is enabled, pass the live ripples array to spawn
 * a ripple at each agent's departure and arrival.
 *
 * @param {object[]} agents
 * @param {number}   dt       Delta-time in seconds
 * @param {number}   w        Canvas width in pixels
 * @param {number}   h        Canvas height in pixels
 * @param {object}   cfg      Merged config object
 * @param {object[]|null} ripples  Shared ripple array (or null when ripple disabled)
 */
export function updateSpotlightAgents(agents, dt, w, h, cfg, ripples) {
    for (const agent of agents) {
        if (agent.state === 'paused') {
            agent.pauseTimer -= dt;
            if (agent.pauseTimer <= 0) {
                agent.state = 'moving';
                startNewPath(agent, w, h, cfg, agents);
                if (ripples) ripples.push({ x: agent.x, y: agent.y, age: 0 });
            }
        } else {
            agent.t += agent.tSpeed * dt;
            if (agent.t >= 1) {
                agent.t     = 1;
                agent.x     = agent.p2x;
                agent.y     = agent.p2y;
                agent.state = 'paused';
                agent.pauseTimer =
                    cfg.spotlightPauseMin +
                    Math.random() * (cfg.spotlightPauseMax - cfg.spotlightPauseMin);
                if (ripples) ripples.push({ x: agent.x, y: agent.y, age: 0 });
            } else {
                const t = agent.t;
                if (agent.pathType === 'line') {
                    agent.x = agent.p0x + t * (agent.p2x - agent.p0x);
                    agent.y = agent.p0y + t * (agent.p2y - agent.p0y);
                } else {
                    const mt = 1 - t;
                    agent.x  = mt * mt * agent.p0x + 2 * mt * t * agent.p1x + t * t * agent.p2x;
                    agent.y  = mt * mt * agent.p0y + 2 * mt * t * agent.p1y + t * t * agent.p2y;
                }
            }
        }
    }
}
