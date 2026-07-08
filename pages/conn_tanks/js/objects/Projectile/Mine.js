import Sprite from '../sprites/sprite.js';
import { getProjectileData, getProjectileImage } from './Projectile.js';

export class Mine extends Sprite {
  constructor(options = {}) {
    const data = getProjectileData();
    super({
      ...options,
      image: getProjectileImage(data),
      width: options.width ?? 16,
      height: options.height ?? 16,
      color: options.color ?? '#ef7d9a',
      collider: {
        enabled: true,
        isTrigger: true,
        layer: 'mine',
        collidesWith: ['projectile'],
        width: 0.014,
        height: 0.014
      }
    });
    this.ownerId = options.ownerId ?? '';
    this.triggerRadius = options.triggerRadius ?? 0.065;
    this.explosion = options.explosion ?? { damage: 25, radius: 0.045, duration: 0.4 };
    this.detonated = false;
  }

  onCollision({ otherOwner }) {
    if (otherOwner?.ownerId !== this.ownerId) this.detonated = true;
  }

  update(dt, players, { wrap = false } = {}) {
    super.update(dt);
    for (const player of players.values()) {
      if (!player.alive || player.id === this.ownerId) continue;
      const dx = wrappedDelta(player.x - this.x, wrap);
      const dy = wrappedDelta(player.y - this.y, wrap);
      if (Math.hypot(dx, dy) <= this.triggerRadius) this.detonated = true;
    }
  }
}

function wrappedDelta(delta, wrap) {
  return wrap ? delta - Math.round(delta) : delta;
}

export default Mine;
