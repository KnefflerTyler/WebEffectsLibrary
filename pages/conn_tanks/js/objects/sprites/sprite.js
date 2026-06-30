import { GameObject } from '../object.js';
import SpriteCollider from './spriteCollider.js';
import SpriteAnimation from './spriteAnimation.js';

export class Sprite extends GameObject {
  constructor(options = {}) {
    super(options);
    this.width = options.width ?? 48;
    this.height = options.height ?? 48;
    this.originOffsetX = options.originOffsetX ?? 0;
    this.originOffsetY = options.originOffsetY ?? 0;
    this.frameOffsets = options.frameOffsets ?? null;
    this.backgroundKey = options.backgroundKey ?? null;
    this.color = options.color ?? '#ffffff';
    this.image = options.image ?? null;
    this.name = options.name ?? '';
    this.wrapWithScreen = options.wrapWithScreen ?? true;
    this.sheetCols = options.sheetCols ?? 1;
    this.sheetRows = options.sheetRows ?? 1;
    this.animations = new Map();
    this.currentAnimation = null;
    this.animationElapsed = 0;
    this.collider = null;

    if (options.collider) this.setCollider(options.collider);
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
    return this.collider?.update(dt) ?? [];
  }

  setCollider(collider = {}) {
    this.collider?.destroy();
    this.collider = collider instanceof SpriteCollider
      ? collider.attach(this)
      : new SpriteCollider(this, collider);
    return this.collider;
  }

  removeCollider() {
    this.collider?.destroy();
    this.collider = null;
  }

  getFrame() {
    const animation = this.currentAnimation;
    const column = animation?.frameAt(this.animationElapsed) ?? 0;
    const row = animation?.row ?? 0;
    const offset = this.frameOffsets?.[row]?.[column] ?? null;
    return {
      column,
      row,
      cols: this.sheetCols,
      rows: this.sheetRows,
      offsetX: offset?.x ?? 0,
      offsetY: offset?.y ?? 0
    };
  }
}

export default Sprite;
