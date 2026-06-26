// #region Imports
import { PLAYER_BOUNDS, PLAYER_COLORS } from '../config.js';
import LevelManager from '../managers/LevelManager.js';
import Player from '../objects/player/Player.js';
import Projectile from '../objects/Projectile/Projectile.js';
// #endregion

// #region Constants and Helpers
const MAX_VERIFIED_DT = 0.1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
// #endregion

export class GameWorld {
  // #region Lifecycle
  constructor(levelManager = new LevelManager()) {
    this.levelManager = levelManager;
    this.players = new Map();
    this.projectiles = [];
  }
  // #endregion

  // #region Scene Access
  get sprites() {
    return [
      ...this.levelManager.sprites,
      ...[...this.players.values()].flatMap(player => player.sprites),
      ...this.projectiles
    ];
  }
  // #endregion

  // #region Level Management
  loadLevel(level) {
    return this.levelManager.loadLevel(level);
  }

  loadLevelData(data) {
    return this.levelManager.loadLevelData(data);
  }

  unloadLevel() {
    this.levelManager.unloadLevel();
  }

  getLevelData() {
    return this.levelManager.getLevelData();
  }

  getSpawnLocations() {
    return this.levelManager.getSpawnLocations();
  }

  getSpawnLocation(index = 0) {
    return this.levelManager.getSpawnLocation(index);
  }
  // #endregion

  // #region Player Management
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
  // #endregion

  // #region State Sync
  applyTrustedPlayerState(id, state) {
    const player = this.players.get(id);
    if (!player || !state) return false;
    const x = Number(state.x);
    const y = Number(state.y);
    const rotation = Number(state.rotation);
    player.applyState({
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
  // #endregion

  // #region Movement and Aim
  movePlayer(id, movement, dt) {
    const player = this.players.get(id);
    if (!player) return null;
    return player.moveFromInput(movement, dt, PLAYER_BOUNDS)
      ? player.serialize()
      : null;
  }

  verifyPlayerMovement(id, movement, dt) {
    const safeDt = Math.max(0, Math.min(Number(dt) || 0, MAX_VERIFIED_DT));
    return this.movePlayer(id, movement, safeDt);
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
  // #endregion

  // #region Player Actions
  fireProjectile(id) {
    const player = this.players.get(id);
    if (!player) return null;

    const projectile = new Projectile({
      id: `${id}:projectile:${performance.now()}`,
      x: player.x,
      y: player.y,
      rotation: player.aimRotation
    });
    this.projectiles.push(projectile);
    return projectile;
  }

  verifyPlayerAction(id, action) {
    if (!action || action.type !== 'fire') return null;
    return this.fireProjectile(id);
  }
  // #endregion

  // #region Update and Serialization
  update(dt) {
    this.levelManager.update(dt);
    for (const player of this.players.values()) player.update(dt);
    for (const projectile of this.projectiles) projectile.update(dt);
    this.projectiles = this.projectiles.filter(projectile => !projectile.expired);
  }

  serialize() {
    return [...this.players.values()].map(player => player.serialize());
  }
  // #endregion
}

export default GameWorld;
