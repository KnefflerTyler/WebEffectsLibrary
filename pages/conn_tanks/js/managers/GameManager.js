// #region Imports
import GameWorld from '../game/gameWorld.js';
// #endregion

export class GameManager {
  // #region Lifecycle
  constructor(world = new GameWorld()) {
    this.world = world;
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
  // #endregion

  // #region Level Management
  loadLevel(level) {
    return this.world.loadLevel(level);
  }

  loadLevelData(data) {
    return this.world.loadLevelData(data);
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
    return this.world.addGuest(id, name, index);
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
    return this.world.movePlayer(id, movement, dt);
  }

  verifyPlayerMovement(id, movement, dt) {
    return this.world.verifyPlayerMovement(id, movement, dt);
  }

  verifyPlayerAction(id, action) {
    return this.world.verifyPlayerAction(id, action);
  }

  updateAim(id, target) {
    return this.world.updateAim(id, target);
  }

  getAimDebugLine(id) {
    return this.world.getAimDebugLine(id);
  }

  fireProjectile(id) {
    return this.world.fireProjectile(id);
  }
  // #endregion

  // #region Update and Serialization
  update(dt) {
    this.world.update(dt);
  }

  serialize() {
    return this.world.serialize();
  }
  // #endregion
}

export default GameManager;
