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
}

export default SpriteCollider;
