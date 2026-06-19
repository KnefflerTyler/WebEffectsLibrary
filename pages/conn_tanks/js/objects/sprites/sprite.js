import { GameObject } from '../object.js';
import SpriteAnimation from './spriteAnimation.js';

export class Sprite extends GameObject {
  constructor(options = {}) {
    super(options);
    this.width = options.width ?? 48;
    this.height = options.height ?? 48;
    this.color = options.color ?? '#ffffff';
    this.image = options.image ?? null;
    this.name = options.name ?? '';
    this.sheetCols = options.sheetCols ?? 1;
    this.sheetRows = options.sheetRows ?? 1;
    this.animations = new Map();
    this.currentAnimation = null;
    this.animationElapsed = 0;
  }

  addAnimation(animation) {
    const value = animation instanceof SpriteAnimation
      ? animation
      : new SpriteAnimation(animation);
    this.animations.set(value.name, value);
    return value;
  }

  setAnimation(name, { reset = true } = {}) {
    const animation = this.animations.get(name);
    if (!animation) throw new Error(`Unknown animation: ${name}`);
    this.currentAnimation = animation;
    if (reset) this.animationElapsed = 0;
  }

  update(dt) {
    this.animationElapsed += dt;
  }

  getFrame() {
    const animation = this.currentAnimation;
    return {
      column: animation?.frameAt(this.animationElapsed) ?? 0,
      row: animation?.row ?? 0,
      cols: this.sheetCols,
      rows: this.sheetRows
    };
  }
}

export default Sprite;
