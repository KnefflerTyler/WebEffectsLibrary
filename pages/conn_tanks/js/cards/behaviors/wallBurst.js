import { getWallReflection } from './bounce.js';

export default {
  id: 'wallBurst',

  onProjectileLevelHit({ projectile, collider, options, spawnFan }) {
    if (!projectile.hit || !collider) return;
    const reflection = getWallReflection(projectile, collider);
    spawnFan({
      count: Math.max(1, Number(options.count) || 3),
      spread: Math.max(0, Number(options.spread) || 0.65),
      rotation: reflection.rotation,
      x: reflection.x,
      y: reflection.y
    });
  }
};
