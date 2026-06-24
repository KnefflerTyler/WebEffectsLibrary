export class MouseInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.position = { x: 0.5, y: 0.5 };
    this.pendingPrimaryClick = null;

    this.onPointerMove = event => {
      this.position = this.getCanvasPosition(event);
    };
    this.onPointerDown = event => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.position = this.getCanvasPosition(event);
      this.pendingPrimaryClick = { ...this.position };
    };

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
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

  destroy() {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.pendingPrimaryClick = null;
  }
}

export default MouseInput;
