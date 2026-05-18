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
    rotations:      1,
    reverse:        false,
    radius:         parseInt(getComputedStyle(document.documentElement).getPropertyValue('--circle-radius')) || 300,
    itemSize:       parseInt(getComputedStyle(document.documentElement).getPropertyValue('--item-size'))    || 180,
    focusThreshold: 45,  // degrees — outer edge of transition zone
    lockZone:       10,  // degrees — inner dead-zone where item is fully locked to center
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

    const dir = cfg.reverse ? -1 : 1;
    // One "lap" = rotate until the last frame reaches its lock zone.
    // Beyond that, cfg.rotations acts as a lap multiplier.
    const oneLap       = (itemCount - 1) * anglePerItem + cfg.lockZone;
    const totalRotation = dir * progress * oneLap * cfg.rotations;

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

        // Interpolation: 3-zone model
        //   > focusThreshold  → 0 (on circle)
        //   lockZone..focusThreshold → 0..1 (easing in)
        //   < lockZone        → 1 (fully locked to center)
        let interpolation;
        if (distanceFromTop <= cfg.lockZone) {
            interpolation = 1;
        } else if (distanceFromTop <= cfg.focusThreshold) {
            const range = cfg.focusThreshold - cfg.lockZone;
            const t = 1 - (distanceFromTop - cfg.lockZone) / range;
            interpolation = t * t * (3 - 2 * t); // smoothstep
        } else {
            interpolation = 0;
        }

        const x = circleX * (1 - interpolation);
        const y = circleY * (1 - interpolation);

        const scaleFactor = 1.35 - (distanceFromTop / 180) * 0.9;   // 1.35 focused → 0.45 opposite
        const opacity     = 0.12 + (1 - distanceFromTop / 180) * 0.88; // 1.0 focused → 0.12 opposite
        const blurPx      = (distanceFromTop / 180) * 7;               // 0px focused → 7px opposite
        const zIndex      = Math.round(100 - distanceFromTop);

        // Debug: log first item every 5% scroll tick
        if (index === 0 && typeof updateCarousel._lastProgress !== 'undefined') {
            console.log(`[Carousel] item[0] deg=${normalizedDeg.toFixed(1)} x=${x.toFixed(1)} y=${y.toFixed(1)} scale=${scaleFactor.toFixed(2)}`);
        }

        // CSS margin already centers items (top:50%+margin:-itemSize/2),
        // so NO -50% offset needed in the transform.
        item.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scaleFactor.toFixed(4)})`;
        item.style.opacity   = opacity;
        item.style.filter    = blurPx > 0.1 ? `blur(${blurPx.toFixed(2)}px)` : '';
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
    wire('cfgFocus',     'valFocus',     v => { cfg.focusThreshold = Math.max(+v, cfg.lockZone + 1); updateCarousel(); });
    wire('cfgLock',      'valLock',      v => { cfg.lockZone      = Math.min(+v, cfg.focusThreshold - 1); updateCarousel(); });

    restore();
    document.getElementById('spApply')?.addEventListener('click', apply);
}
