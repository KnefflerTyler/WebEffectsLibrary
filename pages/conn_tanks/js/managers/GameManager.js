import { PLAYER_BOUNDS, PLAYER_COLORS, PLAYER_SPEED } from '../config.js';
import Player from '../../assets/data/player/player.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class GameManager {
  constructor() {
    this.players = new Map();
  }

  get sprites() {
    return [...this.players.values()];
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
    if (!player || (!movement.x && !movement.y)) return null;

    const x = clamp(
      player.targetX + movement.x * PLAYER_SPEED * dt,
      PLAYER_BOUNDS.minX,
      PLAYER_BOUNDS.maxX
    );
    const y = clamp(
      player.targetY + movement.y * PLAYER_SPEED * dt,
      PLAYER_BOUNDS.minY,
      PLAYER_BOUNDS.maxY
    );
    player.move({
      x,
      y,
      rotation: Math.atan2(movement.y, movement.x) + Math.PI / 2
    });
    return player.serialize();
  }

  update(dt) {
    for (const player of this.players.values()) player.update(dt);
  }

  serialize() {
    return this.sprites.map(player => player.serialize());
  }
}

export default GameManager;
