/**
 * Owns all toolbar UI: tool buttons, colour picker, size slider, clear button.
 *
 * @param {HTMLElement} appEl  – the #app wrapper (used to set data-tool)
 * @param {{ onToolChange, onColorChange, onSizeChange, onClear, onCopy, onPaste }} callbacks
 */
export class Toolbar {
  constructor(appEl, { onToolChange, onColorChange, onSizeChange, onClear, onCopy, onPaste }) {
    this._app = appEl;

    this._tool  = 'pen';
    this._color = '#e74c3c';
    this._size  = 6;

    this._onToolChange  = onToolChange  ?? (() => {});
    this._onColorChange = onColorChange ?? (() => {});
    this._onSizeChange  = onSizeChange  ?? (() => {});
    this._onClear       = onClear       ?? (() => {});
    this._onCopy        = onCopy        ?? (() => {});
    this._onPaste       = onPaste       ?? (() => {});

    this._bindControls();
    this._selectTool('pen');
  }

  // ── Getters ──────────────────────────────────────────────────────────
  get tool()  { return this._tool; }
  get color() { return this._color; }
  get size()  { return this._size; }

  // ── Private ──────────────────────────────────────────────────────────

  _bindControls() {
    const colorInput   = document.getElementById('color-input');
    const colorPreview = document.getElementById('color-preview');
    const sizeSlider   = document.getElementById('size-slider');
    const sizeLabel    = document.getElementById('size-label');

    colorPreview.style.background = this._color;
    colorInput.value              = this._color;
    sizeSlider.value              = this._size;
    sizeLabel.textContent         = `Size: ${this._size}`;

    colorInput.addEventListener('input', () => {
      this._color               = colorInput.value;
      colorPreview.style.background = this._color;
      this._onColorChange(this._color);
    });

    sizeSlider.addEventListener('input', () => {
      this._size            = parseInt(sizeSlider.value, 10);
      sizeLabel.textContent = `Size: ${this._size}`;
      this._onSizeChange(this._size);
    });

    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this._selectTool(btn.dataset.tool));
    });

    document.getElementById('btn-clear').addEventListener('click', () => this._onClear());
    document.getElementById('btn-copy').addEventListener('click',  () => this._onCopy());
    document.getElementById('btn-paste').addEventListener('click', () => this._onPaste());
  }

  _selectTool(name) {
    this._tool          = name;
    this._app.dataset.tool = name;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === name)
    );
    this._onToolChange(name);
  }
}
