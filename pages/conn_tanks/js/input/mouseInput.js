export class MouseInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.position = { x: 0.5, y: 0.5 };
    this.pendingPrimaryClick = null;
    this.primaryDown = false;

    this.onPointerMove = event => {
      this.position = this.getCanvasPosition(event);
    };
    this.onPointerDown = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.primaryDown = true;
      this.position = this.getCanvasPosition(event);
      this.pendingPrimaryClick = { ...this.position };
    };
    this.onPointerUp = event => {
      if (event.type === 'pointercancel' || event.button === 0) this.primaryDown = false;
    };
    this.onBlur = () => { this.primaryDown = false; };

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('blur', this.onBlur);
  }

  getCanvasPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const y = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  }

  getPosition() {
    return { ...this.position };
  }

  consumePrimaryClick() {
    const click = this.pendingPrimaryClick;
    this.pendingPrimaryClick = null;
    return click;
  }

  get isPrimaryDown() {
    return this.primaryDown;
  }

  destroy() {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('blur', this.onBlur);
    this.pendingPrimaryClick = null;
    this.primaryDown = false;
  }
}

export default MouseInput;
