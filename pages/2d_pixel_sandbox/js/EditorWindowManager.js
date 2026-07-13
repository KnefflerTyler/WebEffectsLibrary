const STORAGE_KEY = 'pixel-sandbox-editor-layout-v1';

export class EditorWindowManager {
  constructor(root) {
    this.root = root;
    this.panels = [...root.querySelectorAll('.editor-panel')];
    this.launchers = [...document.querySelectorAll('[data-panel-target]')];
    this.topZ = 30;
    this.saveTimer = 0;

    for (const panel of this.panels) {
      this.applyDefault(panel);
      this.bindPanel(panel);
    }
    this.restoreLayout();
    this.bindToolbar();
    this.updateLaunchers();

    window.addEventListener('resize', () => this.clampAll());
    window.addEventListener('pointerup', () => this.scheduleSave());
    window.addEventListener('beforeunload', () => this.saveLayout());
  }

  bindToolbar() {
    for (const launcher of this.launchers) {
      launcher.addEventListener('click', () => {
        const panel = document.getElementById(launcher.dataset.panelTarget);
        if (!panel) return;
        this.setOpen(panel, panel.hidden);
      });
    }

    document.getElementById('layout-reset')?.addEventListener('click', () => this.resetLayout());
  }

  bindPanel(panel) {
    const header = panel.querySelector('.panel-header');
    const close = panel.querySelector('[data-panel-close]');
    const minimize = panel.querySelector('[data-panel-minimize]');

    panel.addEventListener('pointerdown', () => this.bringToFront(panel));
    close?.addEventListener('click', () => this.setOpen(panel, false));
    minimize?.addEventListener('click', () => this.toggleMinimized(panel));
    header?.addEventListener('dblclick', (event) => {
      if (!event.target.closest('button')) this.toggleMinimized(panel);
    });
    header?.addEventListener('pointerdown', (event) => this.startDrag(event, panel, header));
  }

  startDrag(event, panel, header) {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();
    this.bringToFront(panel);
    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    header.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      this.setViewportPosition(panel, moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
    };
    const finish = () => {
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', finish);
      header.removeEventListener('pointercancel', finish);
      this.captureRect(panel);
      this.scheduleSave();
    };

    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', finish);
    header.addEventListener('pointercancel', finish);
  }

  applyDefault(panel) {
    const width = Number(panel.dataset.defaultWidth) || 280;
    const height = Number(panel.dataset.defaultHeight) || 320;
    const insetX = Number(panel.dataset.defaultX) || 16;
    const y = Number(panel.dataset.defaultY) || 62;
    const x = panel.dataset.defaultSide === 'right' ? window.innerWidth - width - insetX : insetX;

    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    panel.classList.remove('is-minimized');
    panel.hidden = panel.dataset.defaultOpen !== 'true';
    this.setViewportPosition(panel, x, y, width, height);
    panel.dataset.expandedHeight = String(height);
    this.updateMinimizeButton(panel);
  }

  setViewportPosition(panel, x, y, width = null, height = null) {
    const rootRect = this.root.getBoundingClientRect();
    const panelWidth = width ?? panel.getBoundingClientRect().width ?? Number(panel.dataset.defaultWidth);
    const panelHeight = panel.classList.contains('is-minimized')
      ? 39
      : (height ?? panel.getBoundingClientRect().height ?? Number(panel.dataset.defaultHeight));
    const minX = rootRect.left + 4;
    const minY = rootRect.top + 4;
    const maxX = Math.max(minX, rootRect.right - Math.min(panelWidth, rootRect.width - 8) - 4);
    const maxY = Math.max(minY, rootRect.bottom - Math.min(panelHeight, rootRect.height - 8) - 4);
    const clampedX = Math.min(maxX, Math.max(minX, x));
    const clampedY = Math.min(maxY, Math.max(minY, y));

    panel.style.left = `${clampedX - rootRect.left}px`;
    panel.style.top = `${clampedY - rootRect.top}px`;
    panel.dataset.windowX = String(clampedX);
    panel.dataset.windowY = String(clampedY);
  }

  setOpen(panel, open) {
    if (!open) this.captureRect(panel);
    panel.hidden = !open;
    if (open) {
      requestAnimationFrame(() => {
        this.clampPanel(panel);
        this.bringToFront(panel);
      });
    }
    this.updateLaunchers();
    this.scheduleSave();
  }

  toggleMinimized(panel) {
    if (!panel.classList.contains('is-minimized')) {
      panel.dataset.expandedHeight = String(panel.getBoundingClientRect().height);
      panel.classList.add('is-minimized');
    } else {
      panel.classList.remove('is-minimized');
      panel.style.height = `${Number(panel.dataset.expandedHeight) || Number(panel.dataset.defaultHeight)}px`;
    }
    this.updateMinimizeButton(panel);
    requestAnimationFrame(() => this.clampPanel(panel));
    this.scheduleSave();
  }

  updateMinimizeButton(panel) {
    const button = panel.querySelector('[data-panel-minimize]');
    if (!button) return;
    const minimized = panel.classList.contains('is-minimized');
    const title = panel.querySelector('.panel-title')?.textContent.trim() ?? 'window';
    button.textContent = minimized ? '□' : '−';
    button.setAttribute('aria-label', `${minimized ? 'Restore' : 'Minimize'} ${title}`);
  }

  bringToFront(panel) {
    this.topZ++;
    panel.style.zIndex = String(this.topZ);
    for (const item of this.panels) item.classList.toggle('is-active', item === panel);
  }

  updateLaunchers() {
    for (const launcher of this.launchers) {
      const panel = document.getElementById(launcher.dataset.panelTarget);
      launcher.setAttribute('aria-pressed', String(Boolean(panel && !panel.hidden)));
    }
  }

  captureRect(panel) {
    if (panel.hidden) return;
    const rect = panel.getBoundingClientRect();
    panel.dataset.windowX = String(rect.left);
    panel.dataset.windowY = String(rect.top);
    panel.dataset.windowWidth = String(rect.width);
    if (!panel.classList.contains('is-minimized')) {
      panel.dataset.windowHeight = String(rect.height);
      panel.dataset.expandedHeight = String(rect.height);
    }
  }

  clampPanel(panel) {
    if (panel.hidden) return;
    const rect = panel.getBoundingClientRect();
    this.setViewportPosition(panel, rect.left, rect.top, rect.width, rect.height);
    this.captureRect(panel);
  }

  clampAll() {
    for (const panel of this.panels) this.clampPanel(panel);
    this.scheduleSave();
  }

  resetLayout() {
    localStorage.removeItem(STORAGE_KEY);
    for (const panel of this.panels) this.applyDefault(panel);
    const firstOpen = this.panels.find((panel) => !panel.hidden);
    if (firstOpen) this.bringToFront(firstOpen);
    this.updateLaunchers();
    this.scheduleSave();
  }

  restoreLayout() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return;
    }
    if (!saved || typeof saved !== 'object') return;

    for (const panel of this.panels) {
      const state = saved[panel.id];
      if (!state) continue;
      const width = Math.max(230, Number(state.width) || Number(panel.dataset.defaultWidth));
      const height = Math.max(96, Number(state.height) || Number(panel.dataset.defaultHeight));
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.dataset.expandedHeight = String(height);
      panel.classList.toggle('is-minimized', Boolean(state.minimized));
      panel.hidden = !state.open;
      this.setViewportPosition(panel, Number(state.x) || 8, Number(state.y) || 56, width, height);
      this.updateMinimizeButton(panel);
      if (state.z) {
        panel.style.zIndex = String(state.z);
        this.topZ = Math.max(this.topZ, Number(state.z));
      }
    }
  }

  scheduleSave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveLayout(), 100);
  }

  saveLayout() {
    const state = {};
    for (const panel of this.panels) {
      this.captureRect(panel);
      state[panel.id] = {
        open: !panel.hidden,
        minimized: panel.classList.contains('is-minimized'),
        x: Number(panel.dataset.windowX),
        y: Number(panel.dataset.windowY),
        width: Number(panel.dataset.windowWidth) || Number(panel.dataset.defaultWidth),
        height: Number(panel.dataset.windowHeight) || Number(panel.dataset.expandedHeight) || Number(panel.dataset.defaultHeight),
        z: Number(panel.style.zIndex) || 0,
      };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The editor remains usable when storage is unavailable.
    }
  }
}
