(function () {
    'use strict';

    // ── Target elements ───────────────────────────────────────────────────
    const ribbon  = document.querySelector('.contact-us-streamer');
    const canvas  = document.getElementById('ctaParticleCanvas');

    if (!ribbon) return;

    // ══════════════════════════════════════════════════════════════════════
    // 1. PARTICLE SHIMMER — gold dust floating across the ribbon
    // ══════════════════════════════════════════════════════════════════════
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Palette: warm gold tones matching #a47951
    const COLORS = [
        'rgba(255, 235, 185, {a})',
        'rgba(212, 170, 110, {a})',
        'rgba(255, 255, 255, {a})',
        'rgba(247, 228, 210, {a})',
    ];

    const PARTICLE_COUNT = 55;
    let particles = [];
    let W = 0, H = 0;

    function resize() {
        W = canvas.offsetWidth;
        H = canvas.offsetHeight;
        canvas.width  = W;
        canvas.height = H;
    }

    function randomParticle(forceY) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        return {
            x:     Math.random() * W,
            y:     forceY !== undefined ? forceY : Math.random() * H,
            r:     0.8 + Math.random() * 2.2,          // radius 0.8–3px
            alpha: 0.15 + Math.random() * 0.55,
            alphaTarget: 0.15 + Math.random() * 0.55,
            alphaDelta: (Math.random() < 0.5 ? 1 : -1) * (0.003 + Math.random() * 0.008),
            vx:    (Math.random() - 0.5) * 0.35,       // gentle horizontal drift
            vy:    -0.18 - Math.random() * 0.32,        // drift upward
            color: color,
        };
    }

    function initParticles() {
        particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(randomParticle());
        }
    }

    function drawParticle(p) {
        const col = p.color.replace('{a}', p.alpha.toFixed(3));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
    }

    let animId = null;

    function tick() {
        animId = requestAnimationFrame(tick);
        ctx.clearRect(0, 0, W, H);

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // move
            p.x += p.vx;
            p.y += p.vy;

            // twinkle
            p.alpha += p.alphaDelta;
            if (p.alpha <= 0.1 || p.alpha >= 0.7) p.alphaDelta *= -1;

            // recycle once particle drifts off top edge
            if (p.y + p.r < 0) {
                particles[i] = randomParticle(H + p.r);
            }
            // wrap horizontal
            if (p.x < -p.r)   p.x = W + p.r;
            if (p.x > W + p.r) p.x = -p.r;

            drawParticle(p);
        }
    }

    // ── Pause animation when ribbon is off-screen (perf) ─────────────────
    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                if (!animId) tick();
            } else {
                if (animId) {
                    cancelAnimationFrame(animId);
                    animId = null;
                }
            }
        });
    }, { threshold: 0 });

    observer.observe(ribbon);

    // ── Init ──────────────────────────────────────────────────────────────
    resize();
    initParticles();

    const resizeObserver = new ResizeObserver(function () {
        resize();
        initParticles();
    });
    resizeObserver.observe(ribbon);

}());
