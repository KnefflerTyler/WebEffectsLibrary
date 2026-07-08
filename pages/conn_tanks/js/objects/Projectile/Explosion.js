export class Explosion {
  constructor({
    x = 0, y = 0, damage = 8.5, radius = 0.0175, duration = 0.35,
    ignoredPlayerIds = []
  } = {}) {
    this.x = x;
    this.y = y;
    this.damage = Math.max(0, Number(damage) || 0);
    this.maxRadius = Math.max(0, Number(radius) || 0);
    this.duration = Math.max(0.01, Number(duration) || 0.35);
    this.age = 0;
    this.damagedPlayerIds = new Set();
    this.ignoredPlayerIds = new Set(ignoredPlayerIds);
  }

  get radius() {
    return this.maxRadius * Math.min(1, this.age / this.duration);
  }

  get expired() {
    return this.age >= this.duration;
  }

  update(dt, players, { authoritative = false, wrap = false } = {}) {
    this.age += Math.max(0, Number(dt) || 0);
    if (!authoritative || !this.damage) return;
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1);
    const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 1);
    for (const player of players.values()) {
      if (!player.alive || this.ignoredPlayerIds.has(player.id)
        || this.damagedPlayerIds.has(player.id)) continue;
      const dx = wrappedDelta(player.x - this.x, wrap) * viewportWidth;
      const dy = wrappedDelta(player.y - this.y, wrap) * viewportHeight;
      if (Math.hypot(dx, dy) > this.radius * viewportWidth) continue;
      player.loseLife(this.damage);
      this.damagedPlayerIds.add(player.id);
    }
  }

  getRenderShapes({ wrap = false } = {}) {
    const offsets = wrap ? [-1, 0, 1] : [0];
    return offsets.flatMap(offsetX => offsets.map(offsetY => ({
      shape: 'screenCircle',
      center: { x: this.x + offsetX, y: this.y + offsetY },
      radius: this.radius,
      borderColor: '#ffca66',
      fillColor: '#ef7d32',
      borderAlpha: Math.max(0, 1 - this.age / this.duration),
      fillAlpha: Math.max(0, 0.32 * (1 - this.age / this.duration))
    })));
  }
}

function wrappedDelta(delta, wrap) {
  if (!wrap) return delta;
  return delta - Math.round(delta);
}

export default Explosion;
