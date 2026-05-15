// ── Utilities ─────────────────────────────────────────────────
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const easeOut3 = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;

/**
 * Returns scroll progress [0..1] within a pin-section element.
 * progress = 0 when sticky starts pinning, 1 when it finishes.
 */
function sectionProgress(el) {
  const scrollable = el.offsetHeight - window.innerHeight;
  if (scrollable <= 0) return 0;
  const scrolled = window.scrollY - el.offsetTop;
  return clamp(scrolled / scrollable, 0, 1);
}

// ── Element references ─────────────────────────────────────────
const nav          = document.getElementById('main-nav');
const cursorGlow   = document.getElementById('cursor-glow');

// Hero
const heroL1       = document.getElementById('hero-l1');
const heroL2       = document.getElementById('hero-l2');
const heroL3       = document.getElementById('hero-l3');
const heroContent  = document.getElementById('hero-content');
const scrollHint   = document.getElementById('scroll-hint');

// Word Reveal
const wrSection    = document.getElementById('word-reveal-section');
const wrWords      = Array.from(document.querySelectorAll('.wr-word'));
const wrFill       = document.getElementById('wr-fill');
const wrBg         = document.getElementById('wr-bg');

// Feature Morph
const fmSection    = document.getElementById('feature-morph-section');
const fmCards      = [0, 1, 2].map(i => document.getElementById(`fm-card-${i}`));
const fmPanels     = [0, 1, 2].map(i => document.getElementById(`fm-panel-${i}`));
const fmSpineDots  = Array.from(document.querySelectorAll('.fm-spine-dot'));

// Carousel
const carouselPin  = document.getElementById('carousel-pin');
const carouselTrack= document.getElementById('carousel-track');
const carouselPips = Array.from(document.querySelectorAll('.carousel-pip'));
const carouselCards= Array.from(document.querySelectorAll('.c-card'));

// Depth
const depthSection = document.getElementById('depth-section');
const depthCards   = Array.from(document.querySelectorAll('.depth-card'));

// Stats
const statsSection = document.getElementById('stats-section');
const statsSweep   = document.getElementById('stats-sweep');
const statCells    = Array.from(document.querySelectorAll('.stat-cell'));
const sbvBars      = Array.from(document.querySelectorAll('.sbv-bar'));

// CTA
const ctaSection   = document.getElementById('cta-section');
const ctaL0        = document.getElementById('cta-l0');
const ctaL1        = document.getElementById('cta-l1');
const ctaL2        = document.getElementById('cta-l2');
const ctaRings     = [0, 1, 2].map(i => document.getElementById(`cr-${i}`));
const ctaContent   = document.getElementById('cta-content');

// Marquee speed control
const marqueeFwd   = document.getElementById('marquee-fwd');
const marqueeRev   = document.getElementById('marquee-rev');

// ── Carousel setup ────────────────────────────────────────────
const CARD_W      = 340 + 24; // card width + gap
const NUM_CARDS   = carouselCards.length;
const carouselTotalScroll = CARD_W * (NUM_CARDS - 1);
const carouselPinH = carouselTotalScroll + window.innerHeight;
carouselPin.style.height = carouselPinH + 'px';

// ── Nav opaque on scroll ──────────────────────────────────────
window.addEventListener('scroll', () => {
  nav.classList.toggle('opaque', window.scrollY > 80);
}, { passive: true });

// ── Cursor follow glow ────────────────────────────────────────
document.addEventListener('mousemove', e => {
  cursorGlow.style.left = e.clientX + 'px';
  cursorGlow.style.top  = e.clientY + 'px';
});

// ── Marquee speed driven by scroll velocity ───────────────────
let lastScrollY    = window.scrollY;
let scrollVelocity = 0;

// ── SBV bar heights — random sinusoidal animation ────────────
const sbvPhases = sbvBars.map((_, i) => i * (Math.PI * 2 / sbvBars.length));

// ── Main RAF loop ─────────────────────────────────────────────
let frameCount = 0;

function tick() {
  frameCount++;
  const sy = window.scrollY;
  scrollVelocity = lerp(scrollVelocity, sy - lastScrollY, 0.1);
  lastScrollY = sy;

  updateHero(sy);
  updateWordReveal();
  updateFeatureMorph();
  updateCarousel();
  updateDepth();
  updateStats();
  updateCTA();
  updateMarqueeSpeed();
  updateSBV();

  requestAnimationFrame(tick);
}

// ══════════════════════════════════════════════════════════════
// EFFECT 1: Hero — parallax exit
// 3 background layers translate at different rates as hero scrolls
// out. Content fades + rises. Creates depth layering illusion.
// ══════════════════════════════════════════════════════════════
function updateHero(sy) {
  const heroH  = document.getElementById('hero').offsetHeight;
  const p      = clamp(sy / heroH, 0, 1);   // 0 at top, 1 when hero fully scrolled past

  // Layers move at different rates (parallax)
  heroL1.style.transform = `translateY(${p * 180}px)`;
  heroL2.style.transform = `translateY(${p * 80}px)`;
  heroL3.style.transform = `translateY(${p * 40}px)`;

  // Hero content slides up and fades out as user scrolls down
  const contentExit = easeInOut(clamp(p * 2.2, 0, 1));
  heroContent.style.transform = `translateY(${-contentExit * 60}px)`;
  heroContent.style.opacity   = `${1 - contentExit}`;

  // Scroll hint fades out fast
  scrollHint.style.opacity = `${1 - clamp(p * 5, 0, 1)}`;
}

// ══════════════════════════════════════════════════════════════
// EFFECT 2: Word Reveal — Apple-style per-word highlight
// Each word transitions from dim to bright in sequence as the
// user scrolls through the 350vh pin container.
// ══════════════════════════════════════════════════════════════
function updateWordReveal() {
  if (!wrSection) return;
  const p = sectionProgress(wrSection);

  // Progress bar
  wrFill.style.width = `${p * 100}%`;

  // Background color shifts from blue-tinted to purple-tinted
  const hue = Math.round(lerp(220, 260, p));
  wrBg.style.background = `radial-gradient(ellipse 80% 60% at 50% 50%, hsla(${hue},80%,60%,0.06), transparent)`;

  // Each word lights up in sequence.
  // Word i starts lighting at p = (i / total) * 0.8
  // and completes at p = ((i+1) / total) * 0.8
  const total  = wrWords.length;
  const window_size = 0.8 / total; // each word gets this fraction of scroll

  wrWords.forEach((w, i) => {
    const start = (i / total) * 0.85;
    const t     = clamp((p - start) / (window_size * 1.4), 0, 1);
    const ease  = easeOut3(t);
    // colour: from rgba(226,236,248,0.1) to rgba(226,236,248,1)
    const alpha = lerp(0.1, 1.0, ease);
    // slight scale: from 0.95 to 1.0
    const sc    = lerp(0.95, 1.0, ease);
    w.style.color     = `rgba(226,236,248,${alpha.toFixed(3)})`;
    w.style.transform = `scale(${sc.toFixed(3)})`;
    w.style.display   = 'inline-block';
  });
}

// ══════════════════════════════════════════════════════════════
// EFFECT 3: Feature Morph — card + text panel crossfade
// Scroll through 500vh shows 3 feature "chapters". Each chapter
// crossfades the card visual AND its matching text panel.
// ══════════════════════════════════════════════════════════════
function triPhaseAlpha(p, phase) {
  // 3 equal thirds, 0.09 crossfade window either side of boundary
  const third  = 1 / 3;
  const fade   = 0.09;
  const start  = phase * third;
  const end    = start + third;

  if (p < start - fade) return 0;
  if (p < start + fade) return (p - (start - fade)) / (fade * 2);
  if (phase === 2) return 1;                              // last phase never fades out
  if (p < end - fade) return 1;
  if (p < end + fade) return 1 - (p - (end - fade)) / (fade * 2);
  return 0;
}

function updateFeatureMorph() {
  if (!fmSection) return;
  const p = sectionProgress(fmSection);

  const alphas = [0, 1, 2].map(i => clamp(triPhaseAlpha(p, i), 0, 1));

  fmCards.forEach((card, i) => {
    card.style.opacity       = alphas[i].toFixed(3);
    card.style.pointerEvents = alphas[i] > 0.5 ? 'auto' : 'none';
  });

  fmPanels.forEach((panel, i) => {
    panel.style.opacity       = alphas[i].toFixed(3);
    panel.style.pointerEvents = alphas[i] > 0.5 ? 'auto' : 'none';
  });

  // Update spine dots
  const activePhase = alphas.indexOf(Math.max(...alphas));
  fmSpineDots.forEach((d, i) => d.classList.toggle('active', i === activePhase));
}

// ══════════════════════════════════════════════════════════════
// EFFECT 4: Horizontal Carousel
// Vertical scroll progress within the pin container is mapped
// directly to a negative translateX on the card track.
// ══════════════════════════════════════════════════════════════
function updateCarousel() {
  if (!carouselPin) return;
  const rect     = carouselPin.getBoundingClientRect();
  const scrolled = -rect.top;
  const maxS     = carouselPinH - window.innerHeight;
  const p        = clamp(scrolled / maxS, 0, 1);
  const tx       = -(p * carouselTotalScroll);

  carouselTrack.style.transform = `translateX(${tx}px)`;

  const activeIdx = Math.round(p * (NUM_CARDS - 1));
  carouselPips.forEach((pip, i) => pip.classList.toggle('active', i === activeIdx));
}

// ══════════════════════════════════════════════════════════════
// EFFECT 5: Depth Zoom
// Cards begin at extreme scale(0.04) + blur(40px) + opacity(0).
// As section progress advances, each card zooms in with a
// staggered delay — simulating rushing in from far depth.
// ══════════════════════════════════════════════════════════════
function updateDepth() {
  if (!depthSection) return;
  const p     = sectionProgress(depthSection);
  const count = depthCards.length;

  depthCards.forEach((card, i) => {
    const delay   = i / count * 0.45;        // stagger start
    const cardP   = clamp((p - delay) / 0.55, 0, 1);
    const ease    = easeOut3(cardP);

    const scale   = lerp(0.04, 1,    ease);
    const ty      = lerp(120,  0,    ease);
    const blur    = lerp(40,   0,    ease);
    const opacity = ease;

    card.style.transform = `scale(${scale.toFixed(4)}) translateY(${ty.toFixed(1)}px)`;
    card.style.opacity   = opacity.toFixed(3);
    card.style.filter    = `blur(${blur.toFixed(1)}px)`;
  });

  // Background glow intensifies
  const bg = document.querySelector('.depth-bg');
  if (bg) {
    const glow = clamp(p * 2, 0, 1);
    bg.style.background = `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(59,130,246,${(glow * 0.07).toFixed(3)}), transparent), var(--bg)`;
  }
}

// ══════════════════════════════════════════════════════════════
// EFFECT 6: Scroll Stats
// Stat values are derived DIRECTLY from scroll position — not
// just triggered by intersection. Scroll back up and they
// decrease, making the scroll-jacking completely obvious.
// Also animates a gradient sweep and bar visualiser.
// ══════════════════════════════════════════════════════════════
function updateStats() {
  if (!statsSection) return;
  const p = sectionProgress(statsSection);

  // Gradient sweep moves left → right
  statsSweep.style.transform = `translateX(${lerp(-60, 60, p)}%)`;

  // Each stat has its own start/end progress window (staggered)
  const targets = [60, 120, 50, 99];
  const starts  = [0.05, 0.15, 0.25, 0.35];
  const ends    = [0.70, 0.75, 0.80, 0.85];

  statCells.forEach((cell, i) => {
    const statP  = clamp((p - starts[i]) / (ends[i] - starts[i]), 0, 1);
    const ease   = easeOut3(statP);
    const value  = Math.floor(targets[i] * ease);
    cell.querySelector('.stat-val').textContent = value;
  });

  // Bar visualiser — each bar height based on sin wave + scroll
  sbvBars.forEach((bar, i) => {
    const wave = (Math.sin(sbvPhases[i] + p * Math.PI * 4) * 0.5 + 0.5);
    const h    = lerp(8, 100, wave * easeOut3(p));
    bar.style.height = `${h}%`;
  });
}

// ══════════════════════════════════════════════════════════════
// EFFECT 7a: CTA Parallax layers
// 3 background layers translate at -30%, -15%, -5% of the
// section's scroll range — fastest layer appears closest.
// ══════════════════════════════════════════════════════════════
// EFFECT 7b: CTA Content scale reveal
// The text/buttons scale from 1.25→1.0 and fade in as scroll
// enters the section. Makes content feel like it "arrives".
// ══════════════════════════════════════════════════════════════
function updateCTA() {
  if (!ctaSection) return;
  const p = sectionProgress(ctaSection);

  // Parallax layers (percentage of container height)
  const ctaH  = ctaSection.offsetHeight;
  const shift = p * ctaH * 0.25;   // max shift = 25% of section height

  ctaL0.style.transform = `translateY(${shift * -0.5}px)`;
  ctaL1.style.transform = `translateY(${shift * -0.28}px)`;
  ctaL2.style.transform = `translateY(${shift * -0.1}px)`;

  // Expanding rings scale outward + fade
  const ringP = easeOut3(clamp(p * 1.8, 0, 1));
  ctaRings.forEach((ring, i) => {
    const delay = i * 0.12;
    const rp    = easeOut3(clamp((p - delay) * 2, 0, 1));
    ring.style.transform = `scale(${lerp(0.3, 1.1, rp)})`;
    ring.style.opacity   = `${lerp(0, 0.8, rp) * (1 - clamp((p - 0.7) * 3, 0, 1))}`;
  });

  // Content reveal: scale 1.25→1.0, opacity 0→1, arriving in first 30% of scroll
  const revealP = easeOut3(clamp(p / 0.35, 0, 1));
  const scale   = lerp(1.25, 1.0, revealP);
  ctaContent.style.transform = `scale(${scale.toFixed(4)})`;
  ctaContent.style.opacity   = `${lerp(0, 1, revealP).toFixed(3)}`;
}

// ══════════════════════════════════════════════════════════════
// BONUS: Marquee speed modulation
// When the user scrolls fast, marquees speed up to feel kinetic.
// ══════════════════════════════════════════════════════════════
function updateMarqueeSpeed() {
  const speed   = clamp(1 + Math.abs(scrollVelocity) * 0.04, 1, 4);
  const dur     = (30 / speed).toFixed(2);
  marqueeFwd.style.animationDuration = `${dur}s`;
  marqueeRev.style.animationDuration = `${dur}s`;
}

// ══════════════════════════════════════════════════════════════
// BONUS: SBV bars — animated continuously
// (updated inside updateStats but also need a time tick when
// stats section is not in view)
// ══════════════════════════════════════════════════════════════
function updateSBV() {
  const t = frameCount * 0.025;
  sbvBars.forEach((bar, i) => {
    // only animate when stats section is NOT in scroll range
    if (statsSection) {
      const rect = statsSection.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) return; // let updateStats handle it
    }
    const wave = (Math.sin(sbvPhases[i] + t) * 0.5 + 0.5);
    bar.style.height = `${lerp(8, 70, wave)}%`;
  });
}

// ── Resize handler ────────────────────────────────────────────
window.addEventListener('resize', () => {
  const newPinH = CARD_W * (NUM_CARDS - 1) + window.innerHeight;
  carouselPin.style.height = newPinH + 'px';
}, { passive: true });

// ── Start ─────────────────────────────────────────────────────
tick();
