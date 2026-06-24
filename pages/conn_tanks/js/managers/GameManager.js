import {
  DEFAULT_PLAYER_ROTATION_SPEED_SCALER,
  DEFAULT_PLAYER_SPEED_SCALER,
  PLAYER_BOUNDS,
  PLAYER_COLORS
} from '../config.js';
import Player from '../../assets/data/player/Tank.js';
import Projectile from '../../assets/data/Projectile/Projectile.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class GameManager {
  constructor() {
    this.players = new Map();
    this.projectiles = [];
  }

  get sprites() {
    return [
      ...[...this.players.values()].flatMap(player => player.sprites),
      ...this.projectiles
    ];
  }

  addPlayer(data) {
    const existing = this.players.get(data.id);
    if (existing) {
      existing.applyState(data);
      return existing;
    }

    const player = new Player(data);
    this.players.set(player.id, player);
    return player;
  }

  addHost(id, name) {
    return this.addPlayer({ id, name, x: 0.35, y: 0.5, color: PLAYER_COLORS[0] });
  }

  addGuest(id, name = '', index = this.players.size) {
    return this.addPlayer({
      id,
      name: name || `Player ${index + 1}`,
      x: 0.25 + (index % 3) * 0.25,
      y: 0.7,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length]
    });
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  applyPlayerState(id, state) {
    const player = this.players.get(id);
    if (!player || !state) return false;
    const x = Number(state.x);
    const y = Number(state.y);
    const rotation = Number(state.rotation);
    player.move({
      x: clamp(Number.isFinite(x) ? x : player.targetX, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX),
      y: clamp(Number.isFinite(y) ? y : player.targetY, PLAYER_BOUNDS.minY, PLAYER_BOUNDS.maxY),
      rotation: Number.isFinite(rotation) ? rotation : player.targetRotation
    });
    return true;
  }

  applySnapshot(snapshot, localPlayerId = null) {
    const ids = new Set(snapshot.map(player => player.id));
    for (const id of this.players.keys()) {
      if (!ids.has(id)) this.players.delete(id);
    }
    for (const state of snapshot) {
      if (state.id === localPlayerId && this.players.has(state.id)) continue;
      this.addPlayer(state);
    }
  }

  movePlayer(id, movement, dt) {
    const player = this.players.get(id);
    if (!player || !movement || !Number.isFinite(dt) || dt <= 0) return null;

    const throttle = Math.max(-1, Math.min(1, Number(movement.throttle) || 0));
    const turn = Math.max(-1, Math.min(1, Number(movement.turn) || 0));
    const stoppedMoving = player.isMoving && !throttle;
    const stoppedTurning = player.isTurning && !turn;

    player.isMoving = Boolean(throttle);
    player.isTurning = Boolean(turn);

    if (!throttle) player.stopMoving();
    if (!turn) player.stopTurning();
    if (!throttle && !turn && !stoppedMoving && !stoppedTurning) return null;

    const rotation = player.targetRotation
      + turn * player.rotation_speed * DEFAULT_PLAYER_ROTATION_SPEED_SCALER * dt;
    const distance = throttle * player.move_speed * DEFAULT_PLAYER_SPEED_SCALER * dt;
    const x = clamp(
      player.targetX + Math.sin(rotation) * distance,
      PLAYER_BOUNDS.minX,
      PLAYER_BOUNDS.maxX
    );
    const y = clamp(
      player.targetY - Math.cos(rotation) * distance,
      PLAYER_BOUNDS.minY,
      PLAYER_BOUNDS.maxY
    );

    player.move({ x, y, rotation });
    return player.serialize();
  }

  updateAim(id, target) {
    const player = this.players.get(id);
    if (!player || !target) return null;
    player.aimAt(target);
    return player;
  }

  getAimDebugLine(id) {
    return this.players.get(id)?.getAimDebugLine() ?? null;
  }

  fireProjectile(id, target) {
    const player = this.players.get(id);
    if (!player || !target) return null;

    const projectile = new Projectile({
      id: `${id}:projectile:${performance.now()}`,
      x: player.x,
      y: player.y,
      rotation: player.getRotationTo(target)
    });
    this.projectiles.push(projectile);
    return projectile;
  }

  update(dt) {
    for (const player of this.players.values()) player.update(dt);
    for (const projectile of this.projectiles) projectile.update(dt);
    this.projectiles = this.projectiles.filter(projectile => !projectile.expired);
  }

  serialize() {
    return [...this.players.values()].map(player => player.serialize());
  }
}

export default GameManager;
