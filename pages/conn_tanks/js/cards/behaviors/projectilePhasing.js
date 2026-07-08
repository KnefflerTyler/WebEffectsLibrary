export default {
  id: 'projectilePhasing',

  shouldIgnoreCollision({ projectile, other, otherOwner, options, state }) {
    if (!['level', 'projectile', 'player'].includes(other.layer)) return false;
    if (other.layer === 'player' && otherOwner?.playerId === projectile.ownerId) return false;

    state.activeColliders ??= new Set();
    if (state.activeColliders.has(other)) return true;
    if (!Number.isFinite(state.remaining)) {
      state.remaining = Math.max(1, Math.floor(Number(options.count) || 1));
    }
    if (state.remaining <= 0) return false;
    state.remaining -= 1;
    state.activeColliders.add(other);
    return true;
  },

  afterProjectileMove({ projectile, state }) {
    if (!state.activeColliders?.size) return;
    const projectileBounds = projectile.collider?.getBounds();
    if (!projectileBounds) return;
    for (const collider of state.activeColliders) {
      const bounds = collider.getBounds();
      if (projectileBounds.right < bounds.left || projectileBounds.left > bounds.right
        || projectileBounds.bottom < bounds.top || projectileBounds.top > bounds.bottom) {
        state.activeColliders.delete(collider);
      }
    }
  }
};
