/**
 * two-problems.js — Sticky split-screen scrolljack for the
 * "Two problems. One team that solves both." section.
 *
 * Scroll phases (relative to section progress 0 → 1):
 *   0.00 – 0.25   Problem 1 readable; nothing moves
 *   0.25 – 0.65   Transition: track slides up 100vh (P1 exits, P2 enters)
 *   0.65 – 1.00   Problem 2 readable; closing paragraph fades in on left
 *
 * The only DOM side-effect is CSS transform / opacity on a handful of
 * elements — no layout is touched after init, so there is zero reflow cost.
 */
(function () {
  'use strict';

  // ── Utilities ───────────────────────────────────────────────────────────────
  const clamp     = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const mapRange  = (v, a, b)   => clamp((v - a) / (b - a), 0, 1);
  const easeInOut = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  /**
   * Returns scroll progress [0, 1] while the scene element is pinned.
   * 0 = sticky starts, 1 = sticky releases.
   */
  function sectionProgress(el) {
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    return clamp((window.scrollY - el.offsetTop) / scrollable, 0, 1);
  }

  // ── Element references ───────────────────────────────────────────────────────
  const scene    = document.getElementById('twoProblemsScene');
  const track    = document.getElementById('tpTrack');
  const divFill  = document.querySelector('#tpDivider .tp-divider-fill');
  const closer   = document.getElementById('tpCloser');
  const tpRight  = document.querySelector('.tp-right');

  // Bail out gracefully if the section isn't on this page
  if (!scene || !track) return;

  // ── On mobile the layout is static — no JS needed ─────────────────────────
  const mq = window.matchMedia('(max-width: 700px)');
  if (mq.matches) return;

  // ── Cached layout measurements — refreshed on resize, never on scroll ────
  const headerH = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
  let vh = window.innerHeight;
  let panel1H = 0;      // rendered height of panel 1
  let panel2H = 0;      // rendered height of panel 2 (may exceed viewport)
  let vpH     = 0;      // visible height of .tp-right

  function measureLayout() {
    vh      = window.innerHeight;
    panel1H = track.children[0] ? track.children[0].offsetHeight : vh;
    panel2H = track.children[1] ? track.children[1].offsetHeight : vh;
    vpH     = tpRight ? tpRight.clientHeight : (vh - headerH());
  }

  window.addEventListener('resize', () => { measureLayout(); }, { passive: true });
  measureLayout();

  // ── RAF loop ─────────────────────────────────────────────────────────────────
  let prevP = -1; // skip updates when nothing has changed

  function tick() {
    requestAnimationFrame(tick);

    const p = sectionProgress(scene);

    // Round to 4 decimal places — avoids sub-pixel thrashing
    const pR = Math.round(p * 10000) / 10000;
    if (pR === prevP) return;
    prevP = pR;

    // ── 1a. Slide panel 2 into view: p [0.25 → 0.65] → translateY 0 → -panel1H
    const slideRaw   = mapRange(p, 0.25, 0.65);
    const slidePx    = easeInOut(slideRaw) * panel1H;

    // ── 1b. Reveal panel 2 overflow: p [0.65 → 1.0] → continue sliding ──────
    const panel2Overflow = Math.max(0, panel2H - vpH);
    const revealPx       = easeInOut(mapRange(p, 0.65, 1.0)) * panel2Overflow;

    track.style.transform = `translateY(${-(slidePx + revealPx)}px)`;

    // ── 2. Progress bar: fills top→bottom across the full section ─────────────
    if (divFill) divFill.style.transform = `scaleY(${p})`;

    // ── 3. Closing paragraph: fades in once Problem 2 is fully visible ──────
    const closerP = mapRange(p, 0.72, 0.92);
    closer.style.opacity   = closerP;
    closer.style.transform = `translateY(${(1 - closerP) * 18}px)`;

    // ── 4. (dots removed) ────────────────────────────────────────────────────
  }

  requestAnimationFrame(tick);
}());
