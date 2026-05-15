/**
 * Scrolljack Progress Bar
 * 
 * Fills a progress bar based on the user's scroll position down the page.
 * Uses requestAnimationFrame for smooth, performant updates.
 */

import { initPanelToggle, makeWirer } from '../../../shared/settings.js';

const progressFill   = document.getElementById('progressFill');
const progressBar    = document.getElementById('progressBar');
const scrollSpacer   = document.querySelector('.scroll-spacer');

// Mutable config
let cfg = {
    height:    8,
    color:     '#8b6fef',
    scrollLen: 400,
};

function applyConfig() {
    progressBar.style.height = cfg.height + 'px';
    progressFill.style.background = `linear-gradient(90deg, ${cfg.color}, ${cfg.color}dd, ${cfg.color})`;
    if (scrollSpacer) scrollSpacer.style.height = cfg.scrollLen + 'vh';
}

// Update progress bar on scroll
function updateProgress() {
    const windowHeight   = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop      = window.scrollY || document.documentElement.scrollTop;
    const totalScroll    = documentHeight - windowHeight;
    const progress       = totalScroll <= 0 ? 0 : (scrollTop / totalScroll) * 100;
    progressFill.style.width = `${progress}%`;
}

// RAF-throttled scroll handler
let ticking = false;
function onScroll() {
    if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { updateProgress(); ticking = false; });
    }
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('load', () => { applyConfig(); updateProgress(); });
window.addEventListener('resize', updateProgress, { passive: true });
applyConfig();
updateProgress();

// ── Settings panel ────────────────────────────────────────────────────────────
{
    const NS = 'pb:';
    initPanelToggle();
    const { wire, apply, restore } = makeWirer(NS);

    wire('cfgHeight',    'valHeight',    v => { cfg.height    = +v; applyConfig(); });
    wire('cfgColor',     null,           v => { cfg.color     = v;  applyConfig(); });
    wire('cfgScrollLen', 'valScrollLen', v => { cfg.scrollLen = +v; applyConfig(); });

    restore();
    document.getElementById('spApply')?.addEventListener('click', apply);
}
