export default {
  id: 'projectilePhasing',

  shouldIgnoreCollision({ projectile, other, otherOwner, options, state }) {
    if (!['level', 'projectile', 'player'].includes(other.layer)) return false;
    if (other.layer === 'player' && otherOwner?.playerId === projectile.ownerId) return false;

    state.passedColliders ??= new WeakSet();
    if (state.passedColliders.has(other)) return true;
    if (!Number.isFinite(state.remaining)) {
      state.remaining = Math.max(1, Math.floor(Number(options.count) || 1));
    }
    if (state.remaining <= 0) return false;
    state.remaining -= 1;
    state.passedColliders.add(other);
    return true;
  }
};
