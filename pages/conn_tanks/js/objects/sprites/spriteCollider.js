import Collider from '../collider.js';

export class SpriteCollider extends Collider {
  constructor(sprite, options = {}) {
    super({
      ...options,
      owner: sprite,
      width: options.width ?? sprite?.collisionWidth ?? 0,
      height: options.height ?? sprite?.collisionHeight ?? 0
    });
    this.sprite = sprite;
    this.behavior = options.behavior ?? null;
    this.rotateWithOwner = options.rotateWithOwner ?? false;
    this.pixelWidth = positiveNumber(options.pixelWidth);
    this.pixelHeight = positiveNumber(options.pixelHeight);
  }

  attach(sprite) {
    this.sprite = sprite;
    super.attach(sprite);
    return this;
  }

  handleCollision(other) {
    this.behavior?.({
      collider: this,
      other,
      sprite: this.sprite,
      otherOwner: other.owner
    });
    super.handleCollision(other);
  }

  getGeometry() {
    if (!this.rotateWithOwner) return super.getGeometry();
    const viewport = getViewportSize();
    const { x, y, rotation } = this.getOrientedCenter(viewport);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const halfWidth = (this.pixelWidth ?? this.width * viewport.width) / 2;
    const halfHeight = (this.pixelHeight ?? this.height * viewport.height) / 2;
    const points = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight }
    ].map(point => ({
      x: x + (point.x * cos - point.y * sin) / viewport.width,
      y: y + (point.x * sin + point.y * cos) / viewport.height
    }));
    return { type: 'polygon', points };
  }

  getBounds() {
    if (!this.rotateWithOwner) return super.getBounds();
    const points = this.getGeometry().points;
    const left = Math.min(...points.map(point => point.x));
    const right = Math.max(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y));
    const bottom = Math.max(...points.map(point => point.y));
    return { x: (left + right) / 2, y: (top + bottom) / 2, left, right, top, bottom };
  }

  getOrientedCenter(viewport = getViewportSize()) {
    const rotation = this.sprite?.rotation ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const offsetX = this.offsetX * viewport.width;
    const offsetY = this.offsetY * viewport.height;
    return {
      x: (this.sprite?.x ?? 0) + (offsetX * cos - offsetY * sin) / viewport.width,
      y: (this.sprite?.y ?? 0) + (offsetX * sin + offsetY * cos) / viewport.height,
      rotation
    };
  }
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getViewportSize() {
  return {
    width: Math.max(1, Number(globalThis.innerWidth) || 1),
    height: Math.max(1, Number(globalThis.innerHeight) || 1)
  };
}

export default SpriteCollider;
