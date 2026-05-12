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
