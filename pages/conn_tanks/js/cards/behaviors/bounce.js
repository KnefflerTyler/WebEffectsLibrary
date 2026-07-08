export default {
  id: 'bounce',

  onProjectileLevelHit({ projectile, collider, options, state }) {
    if (!projectile.hit || !collider) return;
    if (!Number.isFinite(state.remaining)) state.remaining = Math.max(0, Number(options.count) || 1);
    if (state.remaining <= 0) return;

    const bounds = collider.getBounds();
    const distances = [
      { axis: 'x', value: Math.abs(projectile.x - bounds.left) },
      { axis: 'x', value: Math.abs(projectile.x - bounds.right) },
      { axis: 'y', value: Math.abs(projectile.y - bounds.top) },
      { axis: 'y', value: Math.abs(projectile.y - bounds.bottom) }
    ];
    const axis = distances.sort((a, b) => a.value - b.value)[0].axis;
    let vx = Math.sin(projectile.rotation);
    let vy = -Math.cos(projectile.rotation);
    if (axis === 'x') vx *= -1;
    else vy *= -1;
    projectile.rotation = Math.atan2(vx, -vy);
    projectile.x += vx * 0.006;
    projectile.y += vy * 0.006;
    projectile.hit = false;
    projectile.hitLevelObjectId = null;
    projectile.hitLevelCollider = null;
    state.remaining -= 1;
  }
};
