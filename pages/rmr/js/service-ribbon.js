(function () {
    'use strict';

    const section   = document.querySelector('.sr-scene');
    const columns   = Array.from(document.querySelectorAll('.sr-ribbon-footer .wp-block-column'));
    const indicator = document.getElementById('srIndicator');
    const nav       = document.getElementById('header');   // nav#header (fixed)

    if (!section || !columns.length || !indicator) return;

    const COUNT = columns.length; // 4

    // ── Sync --header-h to the actual rendered nav height ──────────────────
    function syncHeaderHeight() {
        if (!nav) return;
        const h = nav.offsetHeight;
        document.documentElement.style.setProperty('--header-h', h + 'px');
    }

    // ── Layout cache — read once, never inside scroll handler ──────────────
    let sectionTop = 0;
    let scrollable = 0;
    let lastActive = -1;

    function cacheLayout() {
        syncHeaderHeight();
        sectionTop = section.getBoundingClientRect().top + window.scrollY;
        scrollable = section.offsetHeight - window.innerHeight;
        lastActive = -1; // force re-render after resize
    }

    // ── Core update — only reads window.scrollY, zero reflow ───────────────
    function update() {
        const raw      = window.scrollY - sectionTop;
        const progress = scrollable <= 0 ? 0 : Math.max(0, Math.min(1, raw / scrollable));
        const active   = Math.min(COUNT - 1, Math.round(progress * (COUNT - 1)));

        if (active === lastActive) return;
        lastActive = active;

        for (let i = 0; i < COUNT; i++) {
            columns[i].classList.toggle('sr-active', i === active);
        }

        // translateX(calc(N * 100%)) slides the 25%-wide bar to the Nth column
        indicator.style.setProperty('--sr-step', active);
    }

    // ── Passive listeners ───────────────────────────────────────────────────
    let ticking = false;
    window.addEventListener('scroll', function () {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(function () { update(); ticking = false; });
        }
    }, { passive: true });

    window.addEventListener('resize', function () {
        cacheLayout();
        update();
    }, { passive: true });

    cacheLayout();
    update();
}());
