import Collider from '../objects/collider.js';
import { GameObject } from '../objects/object.js';

const DEFAULT_BORDER = '#69e394';
const DEFAULT_FILL = '#2d9e5b';

export class LevelCollider extends GameObject {
  constructor(options = {}) {
    super({ id: options.id ?? '', x: 0, y: 0 });
    this.name = options.name ?? '';
    this.shape = ['line', 'rectangle', 'ellipse'].includes(options.shape)
      ? options.shape
      : 'rectangle';
    this.start = normalizePoint(options.start, 0.25, 0.25);
    this.end = normalizePoint(options.end, 0.75, 0.75);
    this.borderColor = options.borderColor ?? DEFAULT_BORDER;
    this.fillColor = options.fillColor ?? DEFAULT_FILL;
    this.borderAlpha = clamp01(options.borderAlpha ?? 1);
    this.fillAlpha = clamp01(options.fillAlpha ?? 0.25);
    const destructible = options.destructible;
    this.maxHealth = destructible
      ? Math.max(1, Math.floor(Number(destructible.health ?? destructible) || 1))
      : null;
    this.health = this.maxHealth;
    this.isDestroyed = false;
    this.collider = new Collider({
      ...(options.collider ?? {}),
      id: options.collider?.id ?? `${this.id}:collider`,
      owner: this,
      isTrigger: options.collider?.isTrigger ?? false,
      layer: options.collider?.layer ?? 'level'
    });
    this.collider.getBounds = () => this.getBounds();
    this.collider.getGeometry = () => this.getGeometry();
  }

  update() {
    if (this.isDestroyed) return;
    this.collider.update();
  }

  destroy() {
    this.collider.destroy();
  }

  getBounds() {
    return {
      x: (this.start.x + this.end.x) / 2,
      y: (this.start.y + this.end.y) / 2,
      left: Math.min(this.start.x, this.end.x),
      right: Math.max(this.start.x, this.end.x),
      top: Math.min(this.start.y, this.end.y),
      bottom: Math.max(this.start.y, this.end.y)
    };
  }

  getGeometry() {
    if (this.shape === 'line') {
      return { type: 'line', points: [this.start, this.end] };
    }

    const bounds = this.getBounds();
    if (this.shape === 'rectangle') {
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

    const radiusX = (bounds.right - bounds.left) / 2;
    const radiusY = (bounds.bottom - bounds.top) / 2;
    return {
      type: 'polygon',
      points: Array.from({ length: 32 }, (_, index) => {
        const angle = index / 32 * Math.PI * 2;
        return {
          x: bounds.x + Math.cos(angle) * radiusX,
          y: bounds.y + Math.sin(angle) * radiusY
        };
      })
    };
  }

  getRenderShape() {
    const healthRatio = this.maxHealth ? this.health / this.maxHealth : 1;
    return {
      shape: this.shape,
      points: this.getGeometry().points,
      borderColor: this.borderColor,
      fillColor: this.fillColor,
      borderAlpha: this.borderAlpha * (0.55 + healthRatio * 0.45),
      fillAlpha: this.fillAlpha * (0.35 + healthRatio * 0.65)
    };
  }

  damage(amount = 1) {
    if (!this.maxHealth || this.isDestroyed) return false;
    this.health = Math.max(0, this.health - Math.max(0, Number(amount) || 0));
    if (this.health > 0) return false;
    this.isDestroyed = true;
    this.collider.enabled = false;
    this.collider.collisions.clear();
    return true;
  }

  applyState(state = {}) {
    if (!this.maxHealth) return;
    const health = Math.max(0, Math.min(this.maxHealth, Number(state.health)));
    if (!Number.isFinite(health)) return;
    this.health = health;
    this.isDestroyed = health <= 0;
    this.collider.enabled = !this.isDestroyed;
  }

  serializeState() {
    return this.maxHealth && this.health !== this.maxHealth
      ? { id: this.id, health: this.health }
      : null;
  }
}

function normalizePoint(point, fallbackX, fallbackY) {
  return {
    x: clamp01(point?.x ?? fallbackX),
    y: clamp01(point?.y ?? fallbackY)
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export default LevelCollider;
