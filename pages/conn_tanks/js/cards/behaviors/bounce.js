export default {
  id: 'bounce',

  onProjectileLevelHit({ projectile, collider, options, state }) {
    if (!projectile.hit || !collider) return;
    if (!Number.isFinite(state.remaining)) state.remaining = Math.max(0, Number(options.count) || 1);
    if (state.remaining <= 0) return;

    const reflection = getWallReflection(projectile, collider);
    projectile.rotation = reflection.rotation;
    projectile.x = reflection.x;
    projectile.y = reflection.y;
    projectile.hit = false;
    projectile.hitLevelObjectId = null;
    projectile.hitLevelCollider = null;
    state.remaining -= 1;
  }
};

export function getWallReflection(projectile, collider) {
  const wall = collider.getBounds();
  const projectileBounds = projectile.collider?.getBounds();
  const halfWidth = projectileBounds ? (projectileBounds.right - projectileBounds.left) / 2 : 0.006;
  const halfHeight = projectileBounds ? (projectileBounds.bottom - projectileBounds.top) / 2 : 0.006;
  const bounds = {
    left: wall.left - halfWidth,
    right: wall.right + halfWidth,
    top: wall.top - halfHeight,
    bottom: wall.bottom + halfHeight
  };
  const previous = { x: projectile.previousX ?? projectile.x, y: projectile.previousY ?? projectile.y };
  const face = getImpactFace(previous, projectile, bounds);
  let vx = Math.sin(projectile.rotation);
  let vy = -Math.cos(projectile.rotation);
  if (face === 'left' || face === 'right') vx *= -1;
  else vy *= -1;
  const epsilon = 0.0005;
  return {
    rotation: Math.atan2(vx, -vy),
    x: face === 'left' ? bounds.left - epsilon : face === 'right' ? bounds.right + epsilon : projectile.x,
    y: face === 'top' ? bounds.top - epsilon : face === 'bottom' ? bounds.bottom + epsilon : projectile.y
  };
}

function getImpactFace(previous, projectile, bounds) {
  if (previous.x <= bounds.left && projectile.x >= bounds.left) return 'left';
  if (previous.x >= bounds.right && projectile.x <= bounds.right) return 'right';
  if (previous.y <= bounds.top && projectile.y >= bounds.top) return 'top';
  if (previous.y >= bounds.bottom && projectile.y <= bounds.bottom) return 'bottom';
  const distances = [
    { face: 'left', value: Math.abs(projectile.x - bounds.left) },
    { face: 'right', value: Math.abs(projectile.x - bounds.right) },
    { face: 'top', value: Math.abs(projectile.y - bounds.top) },
    { face: 'bottom', value: Math.abs(projectile.y - bounds.bottom) }
  ];
  return distances.sort((a, b) => a.value - b.value)[0].face;
}
