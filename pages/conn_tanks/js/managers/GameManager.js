// #region Imports
import GameWorld from '../game/gameWorld.js';
// #endregion

const DEFAULT_LIVES = 3;
const GAME_OVER_DELAY = 3;

export class GameManager {
  // #region Lifecycle
  constructor(world = new GameWorld()) {
    this.world = world;
    this.phase = 'lobby';
    this.winnerId = null;
    this.levelRevision = 0;
    this.gameOverElapsed = 0;
    this.returningToLobby = false;
    this.startingGame = false;
    this.onGameStateChanged = null;
  }
  // #endregion

  // #region Scene Access
  get players() {
    return this.world.players;
  }

  get sprites() {
    return this.world.sprites;
  }

  get levelShapes() {
    return this.world.levelShapes;
  }

  get screenWrap() {
    return this.world.screenWrap;
  }
  // #endregion

  // #region Level Management
  loadLevel(level) {
    return this.world.loadLevel(level);
  }

  loadLevelData(data) {
    return this.world.loadLevelData(data);
  }

  async startGame(level) {
    if (this.phase !== 'lobby' || this.startingGame || !level) return false;
    this.startingGame = true;
    try {
      await this.world.loadLevel(level.file);
      this.world.resetPlayers(DEFAULT_LIVES);
      this.phase = 'playing';
      this.winnerId = null;
      this.gameOverElapsed = 0;
      this.levelRevision += 1;
      this.notifyGameStateChanged();
      return true;
    } finally {
      this.startingGame = false;
    }
  }

  endGame() {
    if (this.phase !== 'playing') return false;
    const alive = [...this.players.values()].filter(player => player.alive);
    this.phase = 'gameOver';
    this.winnerId = alive.length === 1 ? alive[0].id : null;
    this.gameOverElapsed = 0;
    this.notifyGameStateChanged();
    return true;
  }

  async returnToDefaultLevel() {
    if (this.returningToLobby) return;
    this.returningToLobby = true;
    try {
      await this.world.loadLevel('default.level.json');
      this.world.resetPlayers(DEFAULT_LIVES);
      this.phase = 'lobby';
      this.winnerId = null;
      this.levelRevision += 1;
      this.notifyGameStateChanged();
    } finally {
      this.returningToLobby = false;
    }
  }

  applyGameState(state = {}) {
    this.phase = ['lobby', 'playing', 'gameOver'].includes(state.phase) ? state.phase : 'lobby';
    this.winnerId = state.winnerId ?? null;
    this.levelRevision = Math.max(0, Number(state.levelRevision) || 0);
    this.world.applyLevelState(Array.isArray(state.levelObjects) ? state.levelObjects : []);
  }

  serializeGameState() {
    return {
      phase: this.phase,
      winnerId: this.winnerId,
      levelRevision: this.levelRevision,
      levelObjects: this.world.serializeLevelState()
    };
  }

  notifyGameStateChanged() {
    this.onGameStateChanged?.(this.serializeGameState());
  }

  unloadLevel() {
    this.world.unloadLevel();
  }

  getLevelData() {
    return this.world.getLevelData();
  }

  getSpawnLocations() {
    return this.world.getSpawnLocations();
  }

  getSpawnLocation(index = 0) {
    return this.world.getSpawnLocation(index);
  }
  // #endregion

  // #region Player Management
  addPlayer(data) {
    return this.world.addPlayer(data);
  }

  addHost(id, name) {
    return this.world.addHost(id, name);
  }

  addGuest(id, name = '', index = this.players.size) {
    const player = this.world.addGuest(id, name, index);
    if (this.phase === 'playing') {
      player.resetForMatch(this.getSpawnLocation(index) ?? undefined, DEFAULT_LIVES);
    }
    return player;
  }

  removePlayer(id) {
    this.world.removePlayer(id);
  }
  // #endregion

  // #region State Sync
  applyTrustedPlayerState(id, state) {
    return this.world.applyTrustedPlayerState(id, state);
  }

  applyPlayerState(id, state) {
    return this.applyTrustedPlayerState(id, state);
  }

  applySnapshot(snapshot, localPlayerId = null) {
    this.world.applySnapshot(snapshot, localPlayerId);
  }
  // #endregion

  // #region Player Actions
  movePlayer(id, movement, dt) {
    if (this.phase !== 'playing') return null;
    return this.world.movePlayer(id, movement, dt);
  }

  verifyPlayerMovement(id, movement, dt) {
    if (this.phase !== 'playing') return null;
    return this.world.verifyPlayerMovement(id, movement, dt);
  }

  verifyPlayerAction(id, action) {
    if (this.phase !== 'playing') return null;
    return this.world.verifyPlayerAction(id, action);
  }

  updateAim(id, target) {
    return this.world.updateAim(id, target);
  }

  getAimDebugLine(id) {
    return this.world.getAimDebugLine(id);
  }

  fireProjectile(id) {
    if (this.phase !== 'playing') return null;
    return this.world.fireProjectile(id);
  }
  // #endregion

  // #region Update and Serialization
  update(dt, { authoritative = false } = {}) {
    this.world.update(dt, { authoritative: authoritative && this.phase === 'playing' });
    if (!authoritative) return;

    if (this.phase === 'playing' && this.players.size > 1) {
      const aliveCount = [...this.players.values()].filter(player => player.alive).length;
      if (aliveCount <= 1) this.endGame();
    } else if (this.phase === 'gameOver') {
      this.gameOverElapsed += dt;
      if (this.gameOverElapsed >= GAME_OVER_DELAY) this.returnToDefaultLevel();
    }
  }

  serialize() {
    return this.world.serialize();
  }
  // #endregion
}

export default GameManager;
