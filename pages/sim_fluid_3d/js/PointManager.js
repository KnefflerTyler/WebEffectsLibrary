/**
 * Manages faucet and drain points in 3D grid space.
 *
 * Faucet: { gx, gy, gz, radius, rate, vx, vy, vz }
 *   — continuously adds density + velocity into the sim source buffers.
 *
 * Drain:  { gx, gy, gz, radius, rate }
 *   — continuously removes density and creates inward-sucking velocity.
 */
export class PointManager {
    /** @param {number} N - interior grid dimension */
    constructor(N) {
        this.N       = N;
        this.faucets = [];
        this.drains  = [];
        this.RADIUS  = 2; // grid-cell radius of each point
    }

    // ── Bounds helper ──────────────────────────────────────────────────────
    _inBounds(gx, gy, gz) {
        const N = this.N;
        return gx >= 1 && gx <= N && gy >= 1 && gy <= N && gz >= 1 && gz <= N;
    }

    // ── Placement ──────────────────────────────────────────────────────────

    /** Add a faucet at grid position (gx, gy, gz). */
    addFaucet(gx, gy, gz) {
        this.faucets.push({
            gx, gy, gz,
            radius: this.RADIUS,
            rate: 2,
            vx: 0, vy: -0.2, vz: 0,   // slight downward velocity
        });
    }

    /** Add a drain at grid position (gx, gy, gz). */
    addDrain(gx, gy, gz) {
        this.drains.push({ gx, gy, gz, radius: this.RADIUS, rate: 0.06 });
    }

    /**
     * Remove the nearest faucet or drain within snap distance of (gx, gy, gz).
     * @returns {boolean} true if something was removed
     */
    removeNearest(gx, gy, gz) {
        const HIT = this.RADIUS + 2;
        const snap = (arr) => {
            for (let i = arr.length - 1; i >= 0; i--) {
                const p = arr[i];
                if (Math.abs(p.gx - gx) <= HIT &&
                    Math.abs(p.gy - gy) <= HIT &&
                    Math.abs(p.gz - gz) <= HIT) {
                    arr.splice(i, 1);
                    return true;
                }
            }
            return false;
        };
        return snap(this.faucets) || snap(this.drains);
    }

    /** Remove all faucets and drains. */
    clear() { this.faucets.length = 0; this.drains.length = 0; }

    // ── Simulation injection ───────────────────────────────────────────────

    /**
     * Write faucet/drain contributions into the sim's source buffers.
     * Call this before sim.step() each frame.
     * @param {import('./FluidSim.js').FluidSim3D} sim
     * @param {number} dt
     */
    inject(sim, dt) {
        const { S, SS } = sim;
        const scale = dt * 60;

        this.faucets.forEach(f => {
            const r = f.radius;
            for (let dz = -r; dz <= r; dz++) {
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        if (dx*dx + dy*dy + dz*dz > r*r) continue;
                        const nx = f.gx + dx, ny = f.gy + dy, nz = f.gz + dz;
                        if (!this._inBounds(nx, ny, nz)) continue;
                        const idx = nx + S*ny + SS*nz;
                        sim.densPrev[idx] += f.rate * scale;
                        sim.uPrev[idx]    += f.vx   * scale;
                        sim.vPrev[idx]    += f.vy   * scale;
                        sim.wPrev[idx]    += f.vz   * scale;
                    }
                }
            }
        });

        this.drains.forEach(d => {
            const r = d.radius;
            for (let dz = -r; dz <= r; dz++) {
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        if (dx*dx + dy*dy + dz*dz > r*r) continue;
                        const nx = d.gx + dx, ny = d.gy + dy, nz = d.gz + dz;
                        if (!this._inBounds(nx, ny, nz)) continue;
                        const idx  = nx + S*ny + SS*nz;
                        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
                        sim.dens[idx]  = Math.max(0, sim.dens[idx] - d.rate * scale);
                        sim.uPrev[idx] += (-dx / dist) * d.rate * 2 * scale;
                        sim.vPrev[idx] += (-dy / dist) * d.rate * 2 * scale;
                        sim.wPrev[idx] += (-dz / dist) * d.rate * 2 * scale;
                    }
                }
            }
        });
    }

    // ── Overlay drawing ────────────────────────────────────────────────────

    /**
     * Draw faucet/drain icons on a 2D overlay canvas using projected positions.
     * @param {CanvasRenderingContext2D} ctx - overlay canvas context
     * @param {(gx,gy,gz) => {x,y}|null} projectFn - 3D grid → 2D screen
     * @param {string} mode  - current interaction mode
     * @param {{gx,gy,gz}|null} cursor - ghost cursor position in grid space
     * @param {number} placeRadius - placement indicator radius in pixels
     */
    draw(ctx, projectFn, mode, cursor, placeRadius) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw faucets
        this.faucets.forEach(f => {
            const s = projectFn(f.gx, f.gy, f.gz);
            if (!s) return;
            ctx.beginPath();
            ctx.arc(s.x, s.y, placeRadius, 0, Math.PI * 2);
            ctx.fillStyle   = 'rgba(80,200,255,0.18)'; ctx.fill();
            ctx.strokeStyle = 'rgba(80,200,255,0.9)';  ctx.lineWidth = 1.5; ctx.stroke();
            // Downward arrow
            const ah = placeRadius * 0.55;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y - ah * 0.6); ctx.lineTo(s.x, s.y + ah * 0.6);
            ctx.moveTo(s.x - ah * 0.35, s.y + ah * 0.1);
            ctx.lineTo(s.x, s.y + ah * 0.6);
            ctx.lineTo(s.x + ah * 0.35, s.y + ah * 0.1);
            ctx.strokeStyle = 'rgba(80,200,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        });

        // Draw drains
        this.drains.forEach(d => {
            const s = projectFn(d.gx, d.gy, d.gz);
            if (!s) return;
            ctx.beginPath();
            ctx.arc(s.x, s.y, placeRadius, 0, Math.PI * 2);
            ctx.fillStyle   = 'rgba(255,80,60,0.12)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,80,60,0.9)';  ctx.lineWidth = 1.5; ctx.stroke();
            const sv = placeRadius * 0.38;
            ctx.beginPath();
            ctx.moveTo(s.x - sv, s.y - sv); ctx.lineTo(s.x + sv, s.y + sv);
            ctx.moveTo(s.x + sv, s.y - sv); ctx.lineTo(s.x - sv, s.y + sv);
            ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        });

        // Ghost placement cursor
        if (mode !== 'paint' && cursor) {
            const s = projectFn(cursor.gx, cursor.gy, cursor.gz);
            if (s) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, placeRadius, 0, Math.PI * 2);
                ctx.strokeStyle = mode === 'faucet'
                    ? 'rgba(80,200,255,0.55)'
                    : 'rgba(255,80,60,0.55)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
}
