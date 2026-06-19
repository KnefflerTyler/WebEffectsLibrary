const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

export class KeyboardInput {
  constructor(target = window) {
    this.target = target;
    this.keys = new Set();

    this.onKeyDown = event => {
      if (MOVEMENT_KEYS.has(event.code)) event.preventDefault();
      this.keys.add(event.code);
    };
    this.onKeyUp = event => this.keys.delete(event.code);
    this.onBlur = () => this.keys.clear();

    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  getMovement() {
    let x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    let y = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    const length = Math.hypot(x, y);
    if (length) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  destroy() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.keys.clear();
  }
}

export default KeyboardInput;
