const IDEAL_DISTANCE = 0.24;
const FIRE_ALIGNMENT = 0.16;

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export class CpuTankController {
  constructor() {
    this.states = new Map();
  }

  remove(playerId) {
    this.states.delete(playerId);
  }

  reset() {
    this.states.clear();
  }

  update(world, dt) {
    const players = [...world.players.values()];
    for (const cpu of players) {
      if (!cpu.isCpu || !cpu.alive) continue;
      const target = this.findTarget(cpu, players);
      if (!target) continue;
      this.controlTank(world, cpu, target, dt);
    }
  }

  findTarget(cpu, players) {
    return players
      .filter(player => player.id !== cpu.id && player.alive)
      .sort((a, b) => distanceBetween(cpu, a) - distanceBetween(cpu, b))[0] ?? null;
  }

  controlTank(world, cpu, target, dt) {
    const state = this.getState(cpu.id);
    state.fireCooldown = Math.max(0, state.fireCooldown - dt);
    state.directionTimer -= dt;
    if (state.directionTimer <= 0) {
      state.directionTimer = 1.25 + Math.random() * 1.75;
      state.turnBias = Math.random() < 0.5 ? -0.22 : 0.22;
    }

    const targetPoint = { x: target.x, y: target.y };
    world.updateAim(cpu.id, targetPoint);

    const distance = distanceBetween(cpu, target);
    const desiredRotation = cpu.getRotationTo(targetPoint) + state.turnBias;
    const chassisDelta = angleDelta(cpu.targetRotation, desiredRotation);
    const rotate = Math.abs(chassisDelta) < 0.04 ? 0 : Math.sign(chassisDelta);
    const throttle = Math.abs(chassisDelta) > 1.15
      ? 0.2
      : distance > IDEAL_DISTANCE
        ? 1
        : distance < IDEAL_DISTANCE * 0.55
          ? -0.65
          : 0.35;

    world.movePlayer(cpu.id, { throttle, rotate }, dt);

    const aimDelta = Math.abs(angleDelta(cpu.aimRotation, cpu.getRotationTo(targetPoint)));
    if (aimDelta <= FIRE_ALIGNMENT && distance <= 0.72 && state.fireCooldown <= 0) {
      if (world.fireProjectile(cpu.id)) state.fireCooldown = 0.18 + Math.random() * 0.28;
    }
  }

  getState(playerId) {
    if (!this.states.has(playerId)) {
      this.states.set(playerId, {
        fireCooldown: 0.35 + Math.random() * 0.4,
        directionTimer: 0,
        turnBias: 0
      });
    }
    return this.states.get(playerId);
  }
}

export default CpuTankController;
