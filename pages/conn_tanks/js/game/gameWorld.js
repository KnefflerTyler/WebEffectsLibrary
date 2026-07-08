// #region Imports
import { PLAYER_BOUNDS, PLAYER_COLORS } from '../config.js';
import LevelManager from '../managers/LevelManager.js';
import Player from '../objects/player/Player.js';
import Projectile, { getProjectileData } from '../objects/Projectile/Projectile.js';
import Explosion from '../objects/Projectile/Explosion.js';
import Mine from '../objects/Projectile/Mine.js';
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
    this.explosions = [];
    this.mines = [];
    this.behaviorStates = new Map();
  }
  // #endregion

  // #region Scene Access
  get sprites() {
    return [
      ...this.levelManager.sprites,
      ...[...this.players.values()].filter(player => player.alive).flatMap(player => player.sprites),
      ...this.projectiles
      , ...this.mines
    ];
  }

  get levelShapes() {
    return [
      ...this.levelManager.colliders.map(collider => collider.getRenderShape()),
      ...this.explosions.flatMap(explosion =>
        explosion.getRenderShapes({ wrap: this.screenWrap })
      )
    ];
  }

  get screenWrap() {
    return this.levelManager.screenWrap;
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

  serializeLevelState() {
    return this.levelManager.serializeObjectState();
  }

  applyLevelState(states) {
    this.levelManager.applyObjectState(states);
  }

  resetPlayers(lives = 100) {
    let index = 0;
    for (const player of this.players.values()) {
      player.resetForMatch(this.getSpawnLocation(index) ?? fallbackSpawn(index), lives);
      index += 1;
    }
    this.clearProjectiles();
  }

  respawnPlayer(player) {
    const index = [...this.players.keys()].indexOf(player.id);
    player.respawn(this.getSpawnLocation(index) ?? fallbackSpawn(index));
  }

  clearProjectiles() {
    for (const projectile of this.projectiles) projectile.removeCollider?.();
    this.projectiles = [];
    this.explosions = [];
    for (const mine of this.mines) mine.removeCollider?.();
    this.mines = [];
    this.behaviorStates.clear();
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
    this.players.get(id)?.destroy();
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
      if (!ids.has(id)) this.removePlayer(id);
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
    return player.moveFromInput(movement, dt, {
      ...PLAYER_BOUNDS,
      wrap: this.levelManager.screenWrap
    })
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
    if (!player?.alive) return null;

    const projectileData = getProjectileData();
    const modifiers = player.projectileModifiers ?? {};
    const reloadDuration = projectileData.reload.default * projectileData.reload.scaler;
    if (!player.consumeAmmo(reloadDuration)) return null;
    const projectileCount = 1 + Math.max(0, Math.floor(modifiers.additionalProjectiles ?? 0));
    const spread = Math.max(0, Number(modifiers.spread) || 0);
    const firedAt = performance.now();
    const projectiles = Array.from({ length: projectileCount }, (_, index) => {
      const spreadPosition = projectileCount === 1 ? 0 : index / (projectileCount - 1) - 0.5;
      return new Projectile({
        id: `${id}:projectile:${firedAt}:${index}`,
        ownerId: id,
        volleyId: `${id}:${firedAt}`,
        x: player.x,
        y: player.y,
        rotation: player.aimRotation + spreadPosition * spread,
        speed: projectileData.speed.default * (modifiers.speed ?? 1),
        size: projectileData.size.default * (modifiers.size ?? 1),
        ttl: projectileData.ttl.default * (modifiers.ttl ?? 1),
        damage: projectileData.damage * (modifiers.damage ?? 1),
        explosion: {
          ...projectileData.explosion,
          damage: projectileData.explosion.damage * (modifiers.damage ?? 1)
        },
        ownerImmune: modifiers.ownerImmune ?? false,
        collideProjectiles: modifiers.collideProjectiles ?? true
        , cardBehaviors: player.cardBehaviors ?? []
      });
    });
    this.projectiles.push(...projectiles);
    return projectiles;
  }

  verifyPlayerAction(id, action) {
    if (!action || action.type !== 'fire') return null;
    if (action.target) this.updateAim(id, action.target);
    return this.fireProjectile(id);
  }
  // #endregion

  // #region Update and Serialization
  update(dt, { authoritative = false, behaviorsActive = true } = {}) {
    this.levelManager.update(dt);
    for (const player of this.players.values()) player.update(dt);
    for (const projectile of this.projectiles) {
      projectile.update(dt, { wrap: this.screenWrap });
      if (projectile.hitLevelCollider) this.runProjectileLevelBehaviors(projectile);
    }
    if (behaviorsActive) this.updatePlayerBehaviors(dt);
    for (const mine of this.mines) mine.update(dt, this.players, { wrap: this.screenWrap });
    for (const explosion of this.explosions) {
      explosion.update(dt, this.players, {
        authoritative,
        wrap: this.screenWrap
      });
    }
    if (authoritative) {
      for (const projectile of this.projectiles) {
        if (projectile.hitLevelObjectId) {
          this.levelManager.damageObject(projectile.hitLevelObjectId, projectile.levelDamage);
        }
        if (!projectile.hitPlayerId) continue;
        const player = this.players.get(projectile.hitPlayerId);
        player?.loseLife(projectile.damage);
      }
    }
    const expired = this.projectiles.filter(projectile => projectile.expired);
    for (const projectile of expired) {
      projectile.removeCollider?.();
      this.explosions.push(new Explosion({
        x: projectile.x,
        y: projectile.y,
        ...projectile.explosion
      }));
    }
    this.projectiles = this.projectiles.filter(projectile => !projectile.expired);
    this.explosions = this.explosions.filter(explosion => !explosion.expired);
    const detonatedMines = this.mines.filter(mine => mine.detonated);
    for (const mine of detonatedMines) {
      mine.removeCollider?.();
      this.explosions.push(new Explosion({
        x: mine.x,
        y: mine.y,
        ...mine.explosion,
        ignoredPlayerIds: [mine.ownerId]
      }));
    }
    this.mines = this.mines.filter(mine => !mine.detonated);
  }

  runProjectileLevelBehaviors(projectile) {
    projectile.cardBehaviors.forEach((behavior, index) => {
      behavior.module.onProjectileLevelHit?.({
        world: this,
        projectile,
        collider: projectile.hitLevelCollider,
        options: behavior.options,
        state: getBehaviorState(projectile.behaviorState, `${behavior.id}:${index}`),
        spawnFan: options => this.spawnProjectileFan(projectile, options)
      });
    });
  }

  updatePlayerBehaviors(dt) {
    for (const player of this.players.values()) {
      player.cardBehaviors?.forEach((behavior, index) => {
        const key = `${player.id}:${behavior.id}:${index}`;
        behavior.module.updatePlayer?.({
          world: this,
          player,
          dt,
          options: behavior.options,
          state: getBehaviorState(this.behaviorStates, key),
          spawnMine: options => this.spawnMine(player, options)
        });
      });
    }
  }

  spawnProjectileFan(source, { count = 3, spread = 0.5, rotation = source.rotation + Math.PI } = {}) {
    const total = Math.max(1, Math.floor(count));
    const volleyId = `${source.id}:burst:${performance.now()}`;
    const spawned = Array.from({ length: total }, (_, index) => new Projectile({
      ownerId: source.ownerId,
      volleyId,
      x: source.x,
      y: source.y,
      rotation: rotation + (total === 1 ? 0 : (index / (total - 1) - 0.5) * spread),
      speed: source.speed / getProjectileData().speed.scaler,
      size: source.size,
      ttl: Math.max(0.1, source.ttl - source.age),
      damage: source.damage,
      explosion: source.explosion,
      ownerImmune: source.ownerImmune,
      collideProjectiles: source.collideProjectiles,
      cardBehaviors: []
    }));
    this.projectiles.push(...spawned);
    return spawned;
  }

  spawnMine(player, options = {}) {
    const mine = new Mine({ ownerId: player.id, x: player.x, y: player.y, ...options });
    this.mines.push(mine);
    return mine;
  }

  serialize() {
    return [...this.players.values()].map(player => player.serialize());
  }
  // #endregion
}

function getBehaviorState(states, key) {
  if (!states.has(key)) states.set(key, {});
  return states.get(key);
}

function fallbackSpawn(index) {
  const angle = index * Math.PI / 2;
  return {
    x: 0.5 + Math.cos(angle) * 0.2,
    y: 0.5 + Math.sin(angle) * 0.2,
    rotation: angle + Math.PI
  };
}

export default GameWorld;
