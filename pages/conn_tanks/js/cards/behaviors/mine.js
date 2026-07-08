export default {
  id: 'mine',

  updatePlayer({ player, dt, options, state, spawnMine }) {
    if (!player.alive) return;
    const interval = Math.max(0.25, Number(options.interval) || 4);
    state.elapsed = (state.elapsed ?? 0) + dt;
    if (state.elapsed < interval) return;
    state.elapsed %= interval;
    spawnMine({
      triggerRadius: Math.max(0.01, Number(options.triggerRadius) || 0.065),
      explosion: {
        damage: Math.max(0, Number(options.damage) || 25),
        radius: Math.max(0.005, Number(options.radius) || 0.045),
        duration: Math.max(0.05, Number(options.duration) || 0.4)
      }
    });
  }
};
