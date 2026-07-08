export default {
  id: 'shotgun',

  apply(modifiers, options) {
    modifiers.projectile.additionalProjectiles += Math.max(0, Number(options.additionalProjectiles) || 2);
    modifiers.projectile.spread += Math.max(0, Number(options.spread) || 0.28);
  }
};
