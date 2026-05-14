// Hides settings UI when the page is loaded with ?preview in the URL.
// Uses CSS injection so timing of DOM ready state doesn't matter.
(() => {
  if (!new URLSearchParams(window.location.search).has('preview')) return;

  const style = document.createElement('style');
  style.textContent = [
    '#settingsBtn, .settings-btn, #spBtn, .sp-btn,',
    '#settingsPanel, .settings-panel, #spPanel, .sp-panel { display: none !important; }',
    'body { overflow: hidden !important; }',
  ].join('\n');
  // Inject before DOM is parsed so elements are hidden on first paint
  (document.head || document.documentElement).appendChild(style);
})();

// ── Preview animation pause / resume ─────────────────────────────────────────
// Intercepts requestAnimationFrame *before* any effect module runs so the
// page can freeze after a few frames render (for a static thumbnail).
// Only active when loaded with ?preview.
(() => {
  if (!new URLSearchParams(window.location.search).has('preview')) return;

  let paused = false;
  let pendingCb = null;
  let framesFired = 0;
  let autoPauseDone = false;
  const AUTO_PAUSE_AFTER = 3; // frames to render before freezing
  const _raf = window.requestAnimationFrame.bind(window);

  window.requestAnimationFrame = function(cb) {
    if (paused) { pendingCb = cb; return 0; }

    // Only wrap callbacks until the initial auto-pause fires once.
    if (!autoPauseDone) {
      return _raf(function(t) {
        cb(t);
        framesFired++;
        if (framesFired >= AUTO_PAUSE_AFTER) {
          autoPauseDone = true;
          paused = true;
          if (window.parent !== window) {
            window.parent.postMessage('preview-auto-paused', '*');
          }
        }
      });
    }

    return _raf(cb);
  };

  window.addEventListener('message', e => {
    if (e.source !== window.parent) return;
    if (e.data === 'preview-pause') {
      paused = true;
    } else if (e.data === 'preview-resume') {
      paused = false;
      if (pendingCb) { const cb = pendingCb; pendingCb = null; _raf(cb); }
    }
  });
})();
