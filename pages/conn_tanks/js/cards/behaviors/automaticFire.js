export default {
  id: 'automaticFire',

  apply(modifiers, options) {
    modifiers.projectile.automatic = true;
    const interval = Number(options.fireInterval);
    if (Number.isFinite(interval) && interval > 0) {
      modifiers.projectile.fireInterval = Math.min(modifiers.projectile.fireInterval, interval);
    }
  }
};
