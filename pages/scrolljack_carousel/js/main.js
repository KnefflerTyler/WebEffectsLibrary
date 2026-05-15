/**
 * Scrolljack Carousel
 * 
 * Rotates a circular arrangement of items based on scroll position.
 * The top item becomes larger, more opaque, and focused.
 */

import { initPanelToggle, makeWirer } from '../../../shared/settings.js';

const carousel = document.querySelector('.carousel');
const items = Array.from(document.querySelectorAll('.carousel-item'));
const itemCount = items.length;
const anglePerItem = 360 / itemCount;

// Mutable config — updated by settings Apply
let cfg = {
    rotations:      3,
    reverse:        false,
    radius:         parseInt(getComputedStyle(document.documentElement).getPropertyValue('--circle-radius')) || 300,
    itemSize:       parseInt(getComputedStyle(document.documentElement).getPropertyValue('--item-size'))    || 180,
    focusThreshold: 45,
};

// ── Debug init ───────────────────────────────────────────────────────────────
console.log('[Carousel] init', {
    itemCount,
    anglePerItem,
    cfg,
    carouselEl: carousel,
    items,
});

// Update carousel rotation based on scroll
function updateCarousel() {
    const windowHeight   = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop      = window.scrollY || document.documentElement.scrollTop;
    const totalScroll    = documentHeight - windowHeight;
    const progress       = totalScroll <= 0 ? 0 : scrollTop / totalScroll;

    const dir           = cfg.reverse ? -1 : 1;
    const totalRotation = dir * progress * 360 * cfg.rotations;

    // ── Debug scroll (throttled to first call or every ~5% change) ──────────
    if (typeof updateCarousel._lastProgress === 'undefined' ||
        Math.abs(progress - updateCarousel._lastProgress) > 0.05) {
        updateCarousel._lastProgress = progress;
        console.log('[Carousel] scroll', {
            scrollTop: scrollTop.toFixed(0),
            totalScroll: totalScroll.toFixed(0),
            progress: progress.toFixed(3),
            totalRotation: totalRotation.toFixed(1),
            radius: cfg.radius,
        });
    }

    items.forEach((item, index) => {
        const deg           = ((index * anglePerItem) + totalRotation) % 360;
        const normalizedDeg = deg < 0 ? deg + 360 : deg;
        const rad           = (normalizedDeg * Math.PI) / 180;

        const circleX = Math.sin(rad)  * cfg.radius;
        const circleY = -Math.cos(rad) * cfg.radius;

        const distanceFromTop = Math.min(normalizedDeg, 360 - normalizedDeg);
        const interpolation   = Math.max(0, 1 - distanceFromTop / cfg.focusThreshold);

        const x = circleX * (1 - interpolation);
        const y = circleY * (1 - interpolation);

        const scaleFactor = 1 - (distanceFromTop / 180) * 0.4;
        const opacity     = (0.3 + (1 - distanceFromTop / 180) * 0.7) / 1.2;
        const zIndex      = Math.round(100 - distanceFromTop);

        // Debug: log first item every 5% scroll tick
        if (index === 0 && typeof updateCarousel._lastProgress !== 'undefined') {
            console.log(`[Carousel] item[0] deg=${normalizedDeg.toFixed(1)} x=${x.toFixed(1)} y=${y.toFixed(1)} scale=${scaleFactor.toFixed(2)}`);
        }

        // CSS margin already centers items (top:50%+margin:-itemSize/2),
        // so NO -50% offset needed in the transform.
        item.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scaleFactor.toFixed(4)})`;
        item.style.opacity   = opacity;
        item.style.zIndex    = zIndex;
    });
}

// RAF-throttled scroll handler
let ticking = false;
function onScroll() {
    if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { updateCarousel(); ticking = false; });
    }
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('load', updateCarousel);
window.addEventListener('resize', updateCarousel, { passive: true });
updateCarousel();

// ── Settings panel ────────────────────────────────────────────────────────────
{
    const NS = 'sc:';
    initPanelToggle();
    const { wire, apply, restore } = makeWirer(NS);

    wire('cfgRotations', 'valRotations', v => { cfg.rotations      = +v;          updateCarousel(); });
    wire('cfgReverse',   null,           v => { cfg.reverse        = v === true || v === 'true'; updateCarousel(); });
    wire('cfgRadius',    'valRadius',    v => { cfg.radius         = +v;          updateCarousel(); });
    wire('cfgItemSize',  'valItemSize',  v => {
        cfg.itemSize = +v;
        document.documentElement.style.setProperty('--item-size', v + 'px');
        updateCarousel();
    });
    wire('cfgFocus',     'valFocus',     v => { cfg.focusThreshold = +v;          updateCarousel(); });

    restore();
    document.getElementById('spApply')?.addEventListener('click', apply);
}
