/**
 * Persistent configuration with localStorage backing.
 * Uses 'fs3:' prefix to avoid collisions with the 2D sim.
 */
export const LS = {
    get: (k, def) => { const v = localStorage.getItem('fs3:' + k); return v === null ? def : v; },
    set: (k, v)   => localStorage.setItem('fs3:' + k, v),
};

export const CFG = {
    viscosity    : parseFloat(LS.get('viscosity',    '0')),
    diffusion    : parseFloat(LS.get('diffusion',    '0')),
    gravity      : LS.get('gravity',     'true') === 'true',
    gravStrength : parseFloat(LS.get('gravStrength', '4')),
    colorTheme   : LS.get('colorTheme',  'water'),
    brushSize    : parseInt(LS.get('brushSize',   '2'), 10),
    brushStrength: parseFloat(LS.get('brushStrength', '60')),
};

export const THEME_IDX = { water: 0, fire: 1, plasma: 2, neon: 3, lava: 4 };

/** Wire all settings panel controls to CFG and localStorage. */
export function bindSettings(onClear) {
    function range(id, valId, key, decimals) {
        const el = document.getElementById(id);
        const vl = document.getElementById(valId);
        if (!el) return;
        el.value = CFG[key];
        vl.textContent = Number(CFG[key]).toFixed(decimals);
        el.addEventListener('input', () => {
            CFG[key] = parseFloat(el.value);
            LS.set(key, CFG[key]);
            vl.textContent = CFG[key].toFixed(decimals);
        });
    }
    function check(id, key) {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = CFG[key];
        el.addEventListener('change', () => { CFG[key] = el.checked; LS.set(key, el.checked); });
    }
    function select(id, key) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = CFG[key];
        el.addEventListener('change', () => { CFG[key] = el.value; LS.set(key, el.value); });
    }

    range('cfgViscosity',    'valViscosity',    'viscosity',    5);
    range('cfgDiffusion',    'valDiffusion',    'diffusion',    6);
    range('cfgGravStrength', 'valGravStrength', 'gravStrength', 1);
    range('cfgBrushSize',    'valBrushSize',    'brushSize',    0);
    range('cfgBrushStrength','valBrushStrength','brushStrength',0);
    check('cfgGravity', 'gravity');
    select('cfgColorTheme', 'colorTheme');

    document.getElementById('btnClear')?.addEventListener('click', onClear);

    // Settings panel gear toggle
    const btn   = document.getElementById('spBtn');
    const panel = document.getElementById('spPanel');
    btn?.addEventListener('click', () => {
        btn.classList.toggle('sp-open');
        panel.classList.toggle('sp-open');
    });
}
