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
    if (a.left > b.right || a.right < b.left || a.top > b.bottom || a.bottom < b.top) {
      return false;
    }

    return geometriesIntersect(this.getGeometry(), other.getGeometry());
  }

  getGeometry() {
    const bounds = this.getBounds();
    return {
      type: 'polygon',
      points: [
        { x: bounds.left, y: bounds.top },
        { x: bounds.right, y: bounds.top },
        { x: bounds.right, y: bounds.bottom },
        { x: bounds.left, y: bounds.bottom }
      ]
    };
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

function geometriesIntersect(a, b) {
  if (!a || !b) return false;
  if (a.type === 'line') return lineIntersectsGeometry(a, b);
  if (b.type === 'line') return lineIntersectsGeometry(b, a);
  return polygonsIntersect(a.points ?? [], b.points ?? []);
}

function lineIntersectsGeometry(line, geometry) {
  const [start, end] = line.points ?? [];
  const points = geometry.points ?? [];
  if (!start || !end || points.length < 2) return false;
  if (pointInPolygon(start, points) || pointInPolygon(end, points)) return true;
  return points.some((point, index) => segmentsIntersect(
    start,
    end,
    point,
    points[(index + 1) % points.length]
  ));
}

function polygonsIntersect(a, b) {
  if (a.length < 3 || b.length < 3) return false;
  return [...polygonAxes(a), ...polygonAxes(b)].every(axis => {
    const rangeA = projectPoints(a, axis);
    const rangeB = projectPoints(b, axis);
    return rangeA.max >= rangeB.min && rangeB.max >= rangeA.min;
  });
}

function polygonAxes(points) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const x = -(next.y - point.y);
    const y = next.x - point.x;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  });
}

function projectPoints(points, axis) {
  const values = points.map(point => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
}

function pointInPolygon(point, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index];
    const b = points[previous];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  const onSegment = (p, q, r) => Math.abs(cross(p, q, r)) < 1e-10
    && r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x)
    && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);
  return onSegment(a, b, c) || onSegment(a, b, d)
    || onSegment(c, d, a) || onSegment(c, d, b);
}

export default Collider;
