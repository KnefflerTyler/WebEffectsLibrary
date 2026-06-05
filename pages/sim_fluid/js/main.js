import { FluidSimGPU, F_U, F_V, F_U0, F_V0, F_DENS, F_DENS0 } from './FluidSimGPU.js';
import { FluidSim }                                             from './FluidSim.js';

// ── Grid size ──────────────────────────────────────────────────────────────
const N = 128;

// ── Persistent config ──────────────────────────────────────────────────────
const LS = {
    get: (k, def) => { const v = localStorage.getItem('fs:' + k); return v === null ? def : v; },
    set: (k, v)   => localStorage.setItem('fs:' + k, v),
};

const CFG = {
    viscosity    : parseFloat(LS.get('viscosity',     '0')),
    diffusion    : parseFloat(LS.get('diffusion',     '0')),
    gravity      : LS.get('gravity',      'true') === 'true',
    gravStrength : parseFloat(LS.get('gravStrength',  '4')),
    colorTheme   : LS.get('colorTheme',   'water'),
    showVel      : LS.get('showVel',      'false') === 'true',
    brushSize    : parseInt(LS.get('brushSize',    '3'), 10),
    brushStrength: parseFloat(LS.get('brushStrength', '60')),
};

// ── Canvas ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

let boxX, boxY, boxSize, cellSize;
function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    boxSize  = Math.min(canvas.width, canvas.height) * 0.94;
    cellSize = boxSize / N;
    boxX = (canvas.width  - boxSize) * 0.5;
    boxY = (canvas.height - boxSize) * 0.5;
}
resize();
window.addEventListener('resize', resize);

// ── Coordinate helpers ─────────────────────────────────────────────────────
function toGrid(mx, my) {
    return {
        gx: Math.floor((mx - boxX) / cellSize) + 1,
        gy: Math.floor((my - boxY) / cellSize) + 1,
    };
}
function inBounds(gx, gy) { return gx >= 1 && gx <= N && gy >= 1 && gy <= N; }

// ── Faucets & Drains ───────────────────────────────────────────────────────
const faucets = [];
const drains  = [];
const PLACE_RADIUS = 4;

// ── Simulation backend ─────────────────────────────────────────────────────
let useGPU   = false;
let gpuSim   = null;
let cpuSim   = null;
const stride = N + 2;
const IX = (i, j) => i + stride * j;

let u0_cpu    = new Float32Array(stride * stride);
let v0_cpu    = new Float32Array(stride * stride);
let dens0_cpu = new Float32Array(stride * stride);

// ── Pending brush accumulators ─────────────────────────────────────────────
let pendingBrushDens = new Float32Array(stride * stride);
let pendingBrushU    = new Float32Array(stride * stride);
let pendingBrushV    = new Float32Array(stride * stride);

const statusEl = document.getElementById('gpuStatus');

async function initSim() {
    try {
        gpuSim = new FluidSimGPU(N, 20);
        await gpuSim.init();
        useGPU = true;
        if (statusEl) { statusEl.textContent = 'GPU'; statusEl.classList.add('gpu'); }
    } catch (e) {
        console.warn('[FluidSim] WebGPU unavailable — using CPU fallback.', e);
        cpuSim = new FluidSim(N, 16);
        useGPU = false;
        if (statusEl) { statusEl.textContent = 'CPU'; statusEl.classList.add('cpu'); }
    }
    requestAnimationFrame(loop);
}

// ── Injection helpers ──────────────────────────────────────────────────────
function injectCPU() {
    const sim = cpuSim;
    faucets.forEach(f => {
        const r = f.radius;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx*dx + dy*dy > r*r) continue;
                const nx = f.gx + dx, ny = f.gy + dy;
                if (!inBounds(nx, ny)) continue;
                const idx = sim.IX(nx, ny);
                sim.densPrev[idx] += f.rate;
                sim.uPrev[idx]    += f.vx;
                sim.vPrev[idx]    += f.vy;
            }
        }
    });
    drains.forEach(d => {
        const r = d.radius;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx*dx + dy*dy > r*r) continue;
                const nx = d.gx + dx, ny = d.gy + dy;
                if (!inBounds(nx, ny)) continue;
                const idx  = sim.IX(nx, ny);
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                sim.dens[idx]  = Math.max(0, sim.dens[idx] - d.rate);
                sim.uPrev[idx] += (-dx / dist) * d.rate * 2;
                sim.vPrev[idx] += (-dy / dist) * d.rate * 2;
            }
        }
    });
}

function buildGPUSourceArrays() {
    u0_cpu.fill(0); v0_cpu.fill(0); dens0_cpu.fill(0);
    faucets.forEach(f => {
        const r = f.radius;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx*dx + dy*dy > r*r) continue;
                const nx = f.gx + dx, ny = f.gy + dy;
                if (!inBounds(nx, ny)) continue;
                const idx = IX(nx, ny);
                dens0_cpu[idx] += f.rate;
                u0_cpu[idx]    += f.vx;
                v0_cpu[idx]    += f.vy;
            }
        }
    });
}

async function drainGPU(dt) {
    if (!drains.length) return;
    const dens = await gpuSim.readField(F_DENS);
    const u    = await gpuSim.readField(F_U);
    const v    = await gpuSim.readField(F_V);
    let mod = false;
    drains.forEach(d => {
        const r = d.radius;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx*dx + dy*dy > r*r) continue;
                const nx = d.gx + dx, ny = d.gy + dy;
                if (!inBounds(nx, ny)) continue;
                const idx  = IX(nx, ny);
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                dens[idx]  = Math.max(0, dens[idx] - d.rate * dt * 60);
                u[idx]    += (-dx / dist) * d.rate * 2 * dt * 60;
                v[idx]    += (-dy / dist) * d.rate * 2 * dt * 60;
                mod = true;
            }
        }
    });
    if (mod) { gpuSim.writeField(F_DENS, dens); gpuSim.writeField(F_U, u); gpuSim.writeField(F_V, v); }
}

function applyGravityCPU(dt) {
    if (!CFG.gravity) return;
    const sim   = cpuSim;
    const force = CFG.gravStrength * dt;
    for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
            const idx = sim.IX(i, j);
            if (sim.dens[idx] > 0.005)
                sim.vPrev[idx] += force * Math.min(sim.dens[idx], 1.5);
        }
    }
}

// ── Color themes (CPU path) ────────────────────────────────────────────────
const THEME_IDX = { water: 0, fire: 1, plasma: 2, neon: 3, lava: 4 };
const THEMES_CPU = {
    water:  d => { const t=Math.min(d,2)/2, t2=t*t; return [t2*30|0,(t*120)|0,(60+t*195)|0]; },
    fire:   d => { const t=Math.min(d*0.8,1); return [Math.min(255,t*510)|0,Math.max(0,t*510-255)|0,Math.max(0,t*1020-765)|0]; },
    plasma: d => { const t=Math.min(d,2)/2; return [(80+t*175)|0,(t*30)|0,(160+t*90)|0]; },
    neon:   d => { const t=Math.min(d,2)/2; return [(t*20)|0,(t*255)|0,(t*120)|0]; },
    lava:   d => { const t=Math.min(d,2)/2; return [(180+t*75)|0,(t*80)|0,0]; },
};

const offscreen = document.createElement('canvas');
offscreen.width = offscreen.height = N;
const octx      = offscreen.getContext('2d');
const imgData   = octx.createImageData(N, N);
const px        = imgData.data;

// ── Rendering ──────────────────────────────────────────────────────────────
async function render(gpuBitmap) {
    ctx.fillStyle = '#050910';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gpuBitmap) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';
        ctx.drawImage(gpuBitmap, boxX, boxY, boxSize, boxSize);
    } else {
        const colorFn = THEMES_CPU[CFG.colorTheme] ?? THEMES_CPU.water;
        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                const d = cpuSim.dens[cpuSim.IX(i, j)];
                const [r, g, b] = colorFn(d);
                const off = ((j-1)*N + (i-1)) * 4;
                px[off]   = r; px[off+1] = g; px[off+2] = b; px[off+3] = 255;
            }
        }
        octx.putImageData(imgData, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'low';
        ctx.drawImage(offscreen, boxX, boxY, boxSize, boxSize);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(boxX, boxY, boxSize, boxSize);

    if (CFG.showVel) {
        let uArr, vArr;
        if (useGPU) {
            uArr = await gpuSim.readField(F_U);
            vArr = await gpuSim.readField(F_V);
        } else {
            uArr = cpuSim.u; vArr = cpuSim.v;
        }
        const step = 10;
        ctx.lineWidth = 0.7;
        for (let j = step; j <= N; j += step) {
            for (let i = step; i <= N; i += step) {
                const idx = IX(i, j);
                const vx  = uArr[idx], vy = vArr[idx];
                const spd = Math.sqrt(vx*vx + vy*vy);
                if (spd < 0.05) continue;
                const len   = Math.min(spd*cellSize*1.5, cellSize*1.8);
                const cx    = boxX + (i - 0.5) * cellSize;
                const cy    = boxY + (j - 0.5) * cellSize;
                const alpha = Math.min(spd*3, 0.6);
                ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + (vx/spd)*len, cy + (vy/spd)*len);
                ctx.stroke();
            }
        }
    }

    faucets.forEach(f => {
        const cx = boxX + (f.gx - 0.5) * cellSize;
        const cy = boxY + (f.gy - 0.5) * cellSize;
        const r  = f.radius * cellSize;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(80,200,255,0.18)'; ctx.fill();
        ctx.strokeStyle = 'rgba(80,200,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        const ah = r * 0.55;
        ctx.beginPath();
        ctx.moveTo(cx, cy-ah*0.6); ctx.lineTo(cx, cy+ah*0.6);
        ctx.moveTo(cx-ah*0.35, cy+ah*0.1); ctx.lineTo(cx, cy+ah*0.6); ctx.lineTo(cx+ah*0.35, cy+ah*0.1);
        ctx.strokeStyle = 'rgba(80,200,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    drains.forEach(d => {
        const cx = boxX + (d.gx - 0.5) * cellSize;
        const cy = boxY + (d.gy - 0.5) * cellSize;
        const r  = d.radius * cellSize;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,80,60,0.12)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        const s = r * 0.38;
        ctx.beginPath();
        ctx.moveTo(cx-s, cy-s); ctx.lineTo(cx+s, cy+s);
        ctx.moveTo(cx+s, cy-s); ctx.lineTo(cx-s, cy+s);
        ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    if (mode !== 'paint') {
        const { gx, gy } = toGrid(curMX, curMY);
        if (inBounds(gx, gy)) {
            const cx = boxX + (gx - 0.5) * cellSize;
            const cy = boxY + (gy - 0.5) * cellSize;
            ctx.beginPath(); ctx.arc(cx, cy, PLACE_RADIUS * cellSize, 0, Math.PI*2);
            ctx.strokeStyle = mode === 'faucet' ? 'rgba(80,200,255,0.55)' : 'rgba(255,80,60,0.55)';
            ctx.lineWidth = 1.5; ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
        }
    }
}

// ── Main loop ──────────────────────────────────────────────────────────────
let lastTime = performance.now();
let busy     = false;

async function loop(ts) {
    if (busy) { requestAnimationFrame(loop); return; }
    busy = true;

    const dt = Math.min((ts - lastTime) * 0.001, 0.033);
    lastTime = ts;

    let bitmap = null;

    if (useGPU) {
        buildGPUSourceArrays();
        for (let k = 0; k < pendingBrushDens.length; k++) {
            dens0_cpu[k] += pendingBrushDens[k];
            u0_cpu[k]    += pendingBrushU[k];
            v0_cpu[k]    += pendingBrushV[k];
        }
        pendingBrushDens.fill(0); pendingBrushU.fill(0); pendingBrushV.fill(0);
        gpuSim.writeField(F_DENS0, dens0_cpu);
        gpuSim.writeField(F_U0,    u0_cpu);
        gpuSim.writeField(F_V0,    v0_cpu);
        await gpuSim.step(CFG.viscosity, CFG.diffusion, dt, CFG.gravity, CFG.gravStrength);
        await drainGPU(dt);
        bitmap = await gpuSim.renderToImageBitmap(THEME_IDX[CFG.colorTheme] ?? 0);
    } else {
        applyGravityCPU(dt);
        injectCPU();
        for (let k = 0; k < pendingBrushDens.length; k++) {
            cpuSim.densPrev[k] += pendingBrushDens[k];
            cpuSim.uPrev[k]    += pendingBrushU[k];
            cpuSim.vPrev[k]    += pendingBrushV[k];
        }
        pendingBrushDens.fill(0); pendingBrushU.fill(0); pendingBrushV.fill(0);
        cpuSim.step(CFG.viscosity, CFG.diffusion, dt);
    }

    await render(bitmap);
    busy = false;
    requestAnimationFrame(loop);
}

// ── Interaction state ──────────────────────────────────────────────────────
let mode     = 'paint';
let painting = false;
let lastMX   = 0, lastMY = 0;
let curMX    = 0, curMY  = 0;

canvas.addEventListener('mousedown', e => {
    if (e.button === 0) {
        painting = true;
        lastMX = e.clientX; lastMY = e.clientY;
        if (mode !== 'paint') placePoint(e.clientX, e.clientY);
    } else if (e.button === 2) {
        removePoint(e.clientX, e.clientY);
    }
});
canvas.addEventListener('mousemove', e => {
    curMX = e.clientX; curMY = e.clientY;
    if (!painting || mode !== 'paint') return;
    paintAt(e.clientX, e.clientY, e.clientX - lastMX, e.clientY - lastMY);
    lastMX = e.clientX; lastMY = e.clientY;
});
canvas.addEventListener('mouseup',    () => { painting = false; });
canvas.addEventListener('mouseleave', () => { painting = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    lastMX = t.clientX; lastMY = t.clientY;
    painting = true;
    if (mode !== 'paint') placePoint(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    if (mode === 'paint') paintAt(t.clientX, t.clientY, t.clientX - lastMX, t.clientY - lastMY);
    lastMX = t.clientX; lastMY = t.clientY;
}, { passive: false });
canvas.addEventListener('touchend', () => { painting = false; });

function paintAt(mx, my, dvx, dvy) {
    const { gx, gy } = toGrid(mx, my);
    if (!inBounds(gx, gy)) return;
    const r  = CFG.brushSize;
    const st = CFG.brushStrength;
    const vs = 5;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx*dx + dy*dy > r*r) continue;
            const nx = gx + dx, ny = gy + dy;
            if (!inBounds(nx, ny)) continue;
            const falloff = 1 - Math.sqrt(dx*dx + dy*dy) / (r + 1);
            const idx     = IX(nx, ny);
            pendingBrushDens[idx] += st * falloff;
            pendingBrushU[idx]    += dvx * vs * falloff;
            pendingBrushV[idx]    += dvy * vs * falloff;
        }
    }
}

function placePoint(mx, my) {
    const { gx, gy } = toGrid(mx, my);
    if (!inBounds(gx, gy)) return;
    if (mode === 'faucet') faucets.push({ gx, gy, radius: PLACE_RADIUS, rate: 2, vx: 0, vy: 0.4 });
    else if (mode === 'drain') drains.push({ gx, gy, radius: PLACE_RADIUS, rate: 0.06 });
}

function removePoint(mx, my) {
    const { gx, gy } = toGrid(mx, my);
    const hitR = PLACE_RADIUS + 2;
    for (let i = faucets.length - 1; i >= 0; i--) {
        const f = faucets[i];
        if (Math.abs(f.gx - gx) <= hitR && Math.abs(f.gy - gy) <= hitR) { faucets.splice(i, 1); return; }
    }
    for (let i = drains.length - 1; i >= 0; i--) {
        const d = drains[i];
        if (Math.abs(d.gx - gx) <= hitR && Math.abs(d.gy - gy) <= hitR) { drains.splice(i, 1); }
    }
}

function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.mode === m));
    canvas.style.cursor = m === 'paint' ? 'crosshair' : 'cell';
}
document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.addEventListener('click', () => setMode(btn.dataset.mode)));

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'c') { if (useGPU) gpuSim.clear(); else cpuSim.clear(); faucets.length = 0; drains.length = 0; }
    if (k === 'p') setMode('paint');
    if (k === 'f') setMode('faucet');
    if (k === 'd') setMode('drain');
});

document.getElementById('spBtn').addEventListener('click', () => {
    document.getElementById('spBtn').classList.toggle('sp-open');
    document.getElementById('spPanel').classList.toggle('sp-open');
});

function bindRange(id, valId, key, decimals) {
    const el = document.getElementById(id), vel = document.getElementById(valId);
    if (!el) return;
    el.value = CFG[key];
    vel.textContent = Number(CFG[key]).toFixed(decimals);
    el.addEventListener('input', () => {
        CFG[key] = parseFloat(el.value);
        LS.set(key, CFG[key]);
        vel.textContent = CFG[key].toFixed(decimals);
    });
}
function bindCheck(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.checked = CFG[key];
    el.addEventListener('change', () => { CFG[key] = el.checked; LS.set(key, el.checked); });
}
function bindSelect(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = CFG[key];
    el.addEventListener('change', () => { CFG[key] = el.value; LS.set(key, el.value); });
}

bindRange('cfgViscosity',    'valViscosity',    'viscosity',    5);
bindRange('cfgDiffusion',    'valDiffusion',    'diffusion',    6);
bindRange('cfgGravStrength', 'valGravStrength', 'gravStrength', 1);
bindRange('cfgBrushSize',    'valBrushSize',    'brushSize',    0);
bindRange('cfgBrushStrength','valBrushStrength','brushStrength',0);
bindCheck('cfgGravity',  'gravity');
bindCheck('cfgShowVel',  'showVel');
bindSelect('cfgColorTheme', 'colorTheme');

document.getElementById('btnClear').addEventListener('click', () => {
    if (useGPU) gpuSim.clear(); else cpuSim.clear();
    faucets.length = 0; drains.length = 0;
});

// ── Boot ───────────────────────────────────────────────────────────────────
initSim();
