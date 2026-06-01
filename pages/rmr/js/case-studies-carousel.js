/**
 * Case Studies Scrolljack Carousel
 *
 * Performance notes:
 *  - Layout reads (sectionTop, scrollable, radius) are cached and only
 *    refreshed on resize — never inside the scroll handler.
 *  - The scroll handler reads only window.scrollY (no reflow).
 *  - filter:blur is intentionally omitted — it forces a full composite
 *    layer flush every frame and is the primary cause of scroll stutter.
 *  - zIndex is written only when it changes.
 *  - transform + opacity are compositor-only properties; no repaints.
 */
(function () {
    'use strict';

    const section  = document.querySelector('.cs-section');
    const carousel = document.getElementById('csCarousel');
    if (!section || !carousel) return;

    const items = Array.from(carousel.querySelectorAll('.cs-item'));
    const dots  = Array.from(document.querySelectorAll('.cs-dot'));
    const COUNT = items.length;   // 3
    const ANGLE = 360 / COUNT;    // 120°

    const cfg = {
        focusThreshold: 45,
        lockZone:       10,
    };

    // ── Cached layout values — only read during cacheLayout(), not on scroll ──
    let sectionTop = 0;   // section's top offset from document top (px)
    let scrollable = 0;   // section.offsetHeight - window.innerHeight
    let radius     = 240;
    const zCache   = new Array(COUNT).fill(null); // track last-written zIndex per item

    function cacheLayout() {
        // getBoundingClientRect + scrollY avoids offsetTop walking the tree
        sectionTop = section.getBoundingClientRect().top + window.scrollY;
        scrollable = section.offsetHeight - window.innerHeight;
        radius     = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--cs-radius'), 10
        ) || 240;
        // Reset zIndex cache so values are rewritten after a resize
        zCache.fill(null);
    }

    function updateCarousel() {
        // Single cheap read — no reflow
        const raw      = window.scrollY - sectionTop;
        const progress = scrollable <= 0 ? 0
                       : Math.max(0, Math.min(1, raw / scrollable));

        const totalRot  = -progress * (COUNT - 1) * ANGLE;
        let activeIndex = 0;
        let bestDist    = Infinity;

        for (let index = 0; index < COUNT; index++) {
            const item = items[index];

            const deg  = ((index * ANGLE) + totalRot) % 360;
            const norm = deg < 0 ? deg + 360 : deg;
            const rad  = (norm * Math.PI) / 180;

            const cx   = Math.sin(rad)  * radius;
            const cy   = -Math.cos(rad) * radius;
            const dist = Math.min(norm, 360 - norm);

            // 3-zone smoothstep interpolation
            let interp;
            if (dist <= cfg.lockZone) {
                interp = 1;
            } else if (dist <= cfg.focusThreshold) {
                const t = 1 - (dist - cfg.lockZone) / (cfg.focusThreshold - cfg.lockZone);
                interp  = t * t * (3 - 2 * t);
            } else {
                interp = 0;
            }

            const x     = cx * (1 - interp);
            const y     = cy * (1 - interp);
            const scale = 0.52 + interp * 0.48;
            const opa   = 0.15 + (1 - dist / 180) * 0.85;
            const z     = Math.round(100 - dist);

            // Write transform + opacity every frame (compositor-only, no reflow/repaint)
            item.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
            item.style.opacity   = opa.toFixed(3);

            // Write zIndex only when it changes (avoids unnecessary repaints)
            if (zCache[index] !== z) {
                item.style.zIndex = z;
                zCache[index]     = z;
            }

            if (dist < bestDist) {
                bestDist    = dist;
                activeIndex = index;
            }
        }

        // Sync active classes (dot + card glow are CSS-transition-driven, no perf cost)
        for (let i = 0; i < COUNT; i++) {
            items[i].classList.toggle('is-active', i === activeIndex);
            dots[i].classList.toggle('is-active',  i === activeIndex);
        }
    }

    // RAF-throttled scroll — reads nothing from the DOM, only window.scrollY
    let ticking = false;
    window.addEventListener('scroll', function () {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(function () {
                updateCarousel();
                ticking = false;
            });
        }
    }, { passive: true });

    window.addEventListener('resize', function () {
        cacheLayout();
        updateCarousel();
    }, { passive: true });

    // Initial run
    cacheLayout();
    updateCarousel();
}());
