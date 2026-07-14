// #region Imports
import GameWorld from '../game/gameWorld.js';
import CardManager, { getCardData } from './CardManager.js';
import CpuTankController from '../objects/cpu/CpuTankController.js';
// #endregion

const DEFAULT_HEALTH = 100;
const GAME_OVER_DELAY = 3;
const LOBBY_REGEN_DELAY = 3;
const LOBBY_LEVEL_FILE = 'lobby.level.json';

export class GameManager {
  // #region Lifecycle
  constructor(
    world = new GameWorld(),
    cardManager = new CardManager(),
    cpuController = new CpuTankController()
  ) {
    this.world = world;
    this.cardManager = cardManager;
    this.cpuController = cpuController;
    this.phase = 'lobby';
    this.winnerId = null;
    this.matchWinnerId = null;
    this.winsRequired = 3;
    this.roundWins = {};
    this.roundNumber = 0;
    this.levelPool = [];
    this.levelIndex = 0;
    this.levelRevision = 0;
    this.gameOverElapsed = 0;
    this.returningToLobby = false;
    this.startingGame = false;
    this.roundTransitioning = false;
    this.cardSelectionAdvancesRound = true;
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

  async startGame(levels, winsRequired = 3) {
    const levelPool = (Array.isArray(levels) ? levels : [levels])
      .filter(level => level?.file);
    if (this.phase !== 'lobby' || this.startingGame || !levelPool.length) return false;
    this.startingGame = true;
    try {
      this.levelPool = levelPool;
      this.levelIndex = 0;
      this.winsRequired = Math.max(1, Math.min(20, Math.floor(Number(winsRequired) || 3)));
      this.roundWins = Object.fromEntries([...this.players.keys()].map(id => [id, 0]));
      this.cardManager.reset([...this.players.keys()]);
      this.applyAllCardModifiers();
      this.roundNumber = 1;
      this.matchWinnerId = null;
      this.phase = 'loading';
      this.notifyGameStateChanged();
      await this.world.loadLevel(this.levelPool[this.levelIndex].file);
      this.world.resetPlayers(DEFAULT_HEALTH);
      this.winnerId = null;
      this.gameOverElapsed = 0;
      this.levelRevision += 1;
      this.beginCardSelection({ advanceRound: false });
      return true;
    } catch (error) {
      this.phase = 'lobby';
      this.notifyGameStateChanged();
      throw error;
    } finally {
      this.startingGame = false;
    }
  }

  endGame({ awardWinner = true } = {}) {
    if (this.phase !== 'playing') return false;
    const alive = [...this.players.values()].filter(player => player.alive);
    this.phase = 'gameOver';
    this.winnerId = awardWinner && alive.length === 1 ? alive[0].id : null;
    if (this.winnerId) {
      const wins = (this.roundWins[this.winnerId] ?? 0) + 1;
      this.roundWins[this.winnerId] = wins;
      if (wins >= this.winsRequired) this.matchWinnerId = this.winnerId;
    }
    this.gameOverElapsed = 0;
    this.notifyGameStateChanged();
    return true;
  }

  endRoundWithoutWinner() {
    return this.endGame({ awardWinner: false });
  }

  async returnToLobbyLevel() {
    if (this.returningToLobby) return;
    this.returningToLobby = true;
    try {
      await this.world.loadLevel(LOBBY_LEVEL_FILE);
      this.world.resetPlayers(DEFAULT_HEALTH);
      this.phase = 'lobby';
      this.winnerId = null;
      this.matchWinnerId = null;
      this.roundWins = {};
      this.roundNumber = 0;
      this.levelPool = [];
      this.levelIndex = 0;
      this.cardManager.reset();
      this.applyAllCardModifiers();
      this.cardSelectionAdvancesRound = true;
      this.levelRevision += 1;
      this.notifyGameStateChanged();
    } finally {
      this.returningToLobby = false;
    }
  }

  async startNextRound() {
    if (this.roundTransitioning || this.phase !== 'cardSelection' || this.matchWinnerId) return;
    const nextLevel = this.levelPool[(this.levelIndex + 1) % this.levelPool.length];
    if (!nextLevel) return this.returnToLobbyLevel();
    this.roundTransitioning = true;
    try {
      this.levelIndex = (this.levelIndex + 1) % this.levelPool.length;
      this.phase = 'loading';
      this.notifyGameStateChanged();
      await this.world.loadLevel(nextLevel.file);
      this.world.resetPlayers(DEFAULT_HEALTH);
      this.roundNumber += 1;
      this.phase = 'playing';
      this.winnerId = null;
      this.gameOverElapsed = 0;
      this.levelRevision += 1;
      this.notifyGameStateChanged();
    } catch (error) {
      this.phase = 'gameOver';
      this.gameOverElapsed = 0;
      this.notifyGameStateChanged();
      console.error('Failed to load next round', error);
    } finally {
      this.roundTransitioning = false;
    }
  }

  beginCardSelection({ advanceRound = true } = {}) {
    const allowedPhase = advanceRound ? 'gameOver' : 'loading';
    if (this.phase !== allowedPhase || this.matchWinnerId) return false;
    this.cardSelectionAdvancesRound = advanceRound;
    if (!getCardData().length) {
      this.phase = 'cardSelection';
      this.completeCardSelection();
      return true;
    }
    this.cardManager.createOffers([...this.players.keys()]);
    this.phase = 'cardSelection';
    this.notifyGameStateChanged();
    this.selectCpuCards();
    return true;
  }

  selectCpuCards() {
    for (const player of this.players.values()) {
      if (!player.isCpu) continue;
      const offers = this.cardManager.offers[player.id];
      if (offers?.length) this.selectCard(player.id, offers[Math.floor(Math.random() * offers.length)]);
    }
  }

  selectCard(playerId, cardId) {
    if (this.phase !== 'cardSelection' || !this.players.has(playerId)) return false;
    if (!this.cardManager.select(playerId, cardId)) return false;
    this.applyCardModifiers(playerId);
    this.notifyGameStateChanged();
    if (this.cardManager.allSelected) this.completeCardSelection();
    return true;
  }

  grantCard(playerId, cardId) {
    if (!this.players.has(playerId) || !this.cardManager.grant(playerId, cardId)) return false;
    this.applyCardModifiers(playerId);
    this.notifyGameStateChanged();
    return true;
  }

  removeCard(playerId, cardId) {
    if (!this.players.has(playerId) || !this.cardManager.removeCard(playerId, cardId)) return false;
    this.applyCardModifiers(playerId);
    this.notifyGameStateChanged();
    return true;
  }

  completeCardSelection() {
    if (this.cardSelectionAdvancesRound) {
      this.startNextRound();
      return;
    }
    this.phase = 'playing';
    this.winnerId = null;
    this.gameOverElapsed = 0;
    this.notifyGameStateChanged();
  }

  applyGameState(state = {}) {
    this.phase = ['lobby', 'loading', 'playing', 'gameOver', 'cardSelection'].includes(state.phase)
      ? state.phase
      : 'lobby';
    this.winnerId = state.winnerId ?? null;
    this.matchWinnerId = state.matchWinnerId ?? null;
    this.winsRequired = Math.max(1, Math.floor(Number(state.winsRequired) || 3));
    this.roundWins = normalizeRoundWins(state.roundWins);
    this.roundNumber = Math.max(0, Math.floor(Number(state.roundNumber) || 0));
    this.cardManager.applyState(state.cardState);
    this.applyAllCardModifiers();
    this.levelRevision = Math.max(0, Number(state.levelRevision) || 0);
    this.world.applyLevelState(Array.isArray(state.levelObjects) ? state.levelObjects : []);
  }

  serializeGameState() {
    return {
      phase: this.phase,
      winnerId: this.winnerId,
      matchWinnerId: this.matchWinnerId,
      winsRequired: this.winsRequired,
      roundWins: { ...this.roundWins },
      roundNumber: this.roundNumber,
      cardState: this.cardManager.serialize(),
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
    const player = this.world.addPlayer(data);
    this.cardManager.ensurePlayer(player.id);
    if (this.phase === 'cardSelection') this.cardManager.createOffer(player.id);
    this.applyCardModifiers(player.id);
    return player;
  }

  addHost(id, name) {
    const player = this.world.addHost(id, name);
    this.cardManager.ensurePlayer(player.id);
    this.applyCardModifiers(player.id);
    return player;
  }

  addGuest(id, name = '', index = this.players.size) {
    const player = this.world.addGuest(id, name, index);
    this.cardManager.ensurePlayer(player.id);
    if (this.phase === 'cardSelection') this.cardManager.createOffer(player.id);
    this.applyCardModifiers(player.id);
    if (this.phase === 'playing') {
      player.resetForMatch(this.getSpawnLocation(index) ?? undefined, DEFAULT_HEALTH);
    }
    return player;
  }

  addCpu(id, name = '', index = this.players.size) {
    const player = this.world.addCpu(id, name, index);
    this.cardManager.ensurePlayer(player.id);
    this.applyCardModifiers(player.id);
    return player;
  }

  setCpuCount(count) {
    if (this.phase !== 'lobby') return false;
    const requested = Math.max(0, Math.min(5, Math.floor(Number(count) || 0)));
    const current = [...this.players.values()].filter(player => player.isCpu);
    while (current.length > requested) {
      const player = current.pop();
      this.removePlayer(player.id);
    }
    for (let number = current.length + 1; number <= requested; number += 1) {
      const id = `cpu-${number}`;
      this.addCpu(id, `CPU ${number}`, this.players.size);
    }
    this.notifyGameStateChanged();
    return true;
  }

  removePlayer(id) {
    this.world.removePlayer(id);
    this.cpuController.remove(id);
    this.cardManager.removePlayer(id);
    if (this.phase === 'cardSelection' && this.cardManager.allSelected) this.completeCardSelection();
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
    this.applyAllCardModifiers();
  }
  // #endregion

  // #region Player Actions
  movePlayer(id, movement, dt) {
    if (this.phase !== 'playing' && this.phase !== 'lobby') return null;
    return this.world.movePlayer(id, movement, dt);
  }

  verifyPlayerMovement(id, movement, dt) {
    if (this.phase !== 'playing' && this.phase !== 'lobby') return null;
    return this.world.verifyPlayerMovement(id, movement, dt);
  }

  verifyPlayerAction(id, action) {
    if (this.phase === 'cardSelection' && action?.type === 'cardSelect') {
      return this.selectCard(id, action.cardId);
    }
    if (this.phase !== 'playing' && this.phase !== 'lobby') return null;
    return this.world.verifyPlayerAction(id, action);
  }

  updateAim(id, target) {
    return this.world.updateAim(id, target);
  }

  getAimDebugLine(id) {
    return this.world.getAimDebugLine(id);
  }

  fireProjectile(id) {
    if (this.phase !== 'playing' && this.phase !== 'lobby') return null;
    return this.world.fireProjectile(id);
  }
  // #endregion

  // #region Update and Serialization
  update(dt, { authoritative = false } = {}) {
    const activeCombat = this.phase === 'playing' || this.phase === 'lobby';
    if (authoritative && this.phase === 'playing') this.cpuController.update(this.world, dt);
    this.world.update(dt, {
      authoritative: authoritative && activeCombat,
      behaviorsActive: activeCombat
    });
    if (!authoritative) return;

    if (this.phase === 'lobby') {
      for (const player of this.players.values()) {
        if (player.alive) {
          player.lobbyRegenElapsed = 0;
          continue;
        }
        player.lobbyRegenElapsed += dt;
        if (player.lobbyRegenElapsed >= LOBBY_REGEN_DELAY) player.regenerate();
      }
    } else if (this.phase === 'playing') {
      const aliveCount = [...this.players.values()].filter(player => player.alive).length;
      if (aliveCount === 0) {
        this.endGame({ awardWinner: false });
      } else if (this.players.size > 1 && aliveCount === 1) {
        this.endGame();
      }
    } else if (this.phase === 'gameOver') {
      this.gameOverElapsed += dt;
      if (this.gameOverElapsed >= GAME_OVER_DELAY) {
        if (this.matchWinnerId) this.returnToLobbyLevel();
        else this.beginCardSelection();
      }
    }
  }

  serialize() {
    return this.world.serialize();
  }

  applyCardModifiers(playerId) {
    this.players.get(playerId)?.applyCardModifiers(this.cardManager.getModifiers(playerId));
  }

  applyAllCardModifiers() {
    for (const id of this.players.keys()) this.applyCardModifiers(id);
  }
  // #endregion
}

function normalizeRoundWins(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([id, wins]) => [
    id,
    Math.max(0, Math.floor(Number(wins) || 0))
  ]));
}

export default GameManager;
