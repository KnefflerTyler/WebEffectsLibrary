export class Collider {
  static colliders = new Set();

  constructor(options = {}) {
    this.id = options.id ?? '';
    this.owner = options.owner ?? null;
    this.enabled = options.enabled ?? true;
    this.isTrigger = options.isTrigger ?? true;
    this.layer = options.layer ?? 'default';
    this.collidesWith = options.collidesWith
      ? new Set(options.collidesWith)
      : null;
    this.offsetX = options.offsetX ?? 0;
    this.offsetY = options.offsetY ?? 0;
    this.width = options.width ?? 0;
    this.height = options.height ?? 0;
    this.onCollision = options.onCollision ?? null;
    this.collisions = new Set();

    if (this.owner) this.register();
  }

  // #region Lifecycle
  attach(owner) {
    this.owner = owner;
    this.register();
    return this;
  }

  register() {
    Collider.colliders.add(this);
    return this;
  }

  unregister() {
    Collider.colliders.delete(this);
    this.collisions.clear();
  }

  destroy() {
    this.unregister();
    this.owner = null;
  }
  // #endregion

  // #region Collision Checks
  update() {
    if (!this.enabled || !this.owner) return [];

    const hits = [];
    for (const other of Collider.colliders) {
      if (other === this || !this.canCollideWith(other)) continue;
      if (!this.intersects(other)) continue;
      hits.push(other);
      this.handleCollision(other);
    }

    this.collisions = new Set(hits);
    return hits;
  }

  canCollideWith(other) {
    if (!other?.enabled || !other.owner) return false;
    if (this.collidesWith && !this.collidesWith.has(other.layer)) return false;
    if (other.collidesWith && !other.collidesWith.has(this.layer)) return false;
    return true;
  }

  intersects(other) {
    const a = this.getBounds();
    const b = other.getBounds();
    return a.left <= b.right
      && a.right >= b.left
      && a.top <= b.bottom
      && a.bottom >= b.top;
  }

  getBounds() {
    const x = (this.owner?.x ?? 0) + this.offsetX;
    const y = (this.owner?.y ?? 0) + this.offsetY;
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    return {
      x,
      y,
      left: x - halfWidth,
      right: x + halfWidth,
      top: y - halfHeight,
      bottom: y + halfHeight
    };
  }
  // #endregion

  // #region Events
  handleCollision(other) {
    const event = this.createCollisionEvent(other);
    this.onCollision?.(event);
    this.owner?.onCollision?.(event);
    other.receiveCollision(this, event);
  }

  receiveCollision(source, sourceEvent = null) {
    const event = this.createCollisionEvent(source, sourceEvent);
    this.onCollision?.(event);
    this.owner?.onCollision?.(event);
  }

  createCollisionEvent(other, sourceEvent = null) {
    return {
      collider: this,
      other,
      owner: this.owner,
      otherOwner: other.owner,
      sourceEvent
    };
  }
  // #endregion
}

export default Collider;
