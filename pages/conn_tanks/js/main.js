// #region Imports
import { NETWORK_HZ } from './config.js';
import { PlayerActionType } from './api/models.js';
import { loadProjectileData } from './objects/Projectile/Projectile.js';
import { loadTankData } from './objects/player/Tank.js';
import GameManager from './managers/GameManager.js';
import NetworkManager from './managers/NetworkManager.js';
import KeyboardInput from './input/keyboardInput.js';
import MouseInput from './input/mouseInput.js';
import WebGLRenderer from './renderer/webglRenderer.js';
import GameUI from './ui/gameUI.js';
// #endregion

// #region Initialization
const canvas = document.getElementById('game-canvas');
const renderer = await WebGLRenderer.create(canvas);
await loadTankData();
await loadProjectileData();
const world = new GameManager();
await world.loadLevel('default');
const input = new KeyboardInput();
const mouse = new MouseInput(canvas);
// #endregion

// #region Game State
let lastTime = performance.now();
let lastNetworkSend = 0;
let pendingNetworkMoveDt = 0;
// #endregion

// #region Network
const network = new NetworkManager({
  getSnapshot: () => world.serialize(),
  getLevelData: () => world.getLevelData(),

  onReady: ({ id, roomCode, role, name }) => {
    if (role === 'host') world.addHost(id, name);
    ui.showGame(roomCode, role);
    ui.updatePlayerCount(world.players.size);
  },

  onPlayerJoined: player => {
    world.addGuest(player.id, player.name, player.index);
    ui.updatePlayerCount(world.players.size);
  },

  onPlayerLeft: id => {
    world.removePlayer(id);
    ui.updatePlayerCount(world.players.size);
  },

  onLevelData: level => world.loadLevelData(level),
  onSnapshot: players => {
    world.applySnapshot(players);
    ui.updatePlayerCount(world.players.size);
  },

  onRemoteMove: (id, movement, dt) => world.verifyPlayerMovement(id, movement, dt),
  onRemoteAction: (id, action) => world.verifyPlayerAction(id, action),
  onDisconnected: () => ui.showDisconnected(),
  onError: error => ui.setMenuStatus(error.message)
});
// #endregion

// #region UI
const ui = new GameUI({
  onHost: name => network.host(name),
  onJoin: (roomCode, name) => network.join(roomCode, name)
});
// #endregion

// #region Debug
const debugState = {
  showAimLine: true,
  showColliders: true
};

function setShowColliders(value) {
  debugState.showColliders = Boolean(value);
}

function toggleShowColliders() {
  setShowColliders(!debugState.showColliders);
}

function getDebugLines() {
  return [
    ...(debugState.showAimLine ? [world.getAimDebugLine(network.localId)].filter(Boolean) : []),
    ...(debugState.showColliders ? getColliderDebugLines() : [])
  ];
}

function getColliderDebugLines() {
  return world.sprites.flatMap(sprite => {
    if (!sprite.collider?.enabled) return [];
    return createBoundsDebugLines(sprite.collider.getBounds());
  });
}

function createBoundsDebugLines(bounds) {
  const topLeft = { x: bounds.left, y: bounds.top };
  const topRight = { x: bounds.right, y: bounds.top };
  const bottomRight = { x: bounds.right, y: bounds.bottom };
  const bottomLeft = { x: bounds.left, y: bounds.bottom };
  const color = [0.2, 1, 0.35, 0.9];

  return [
    { start: topLeft, end: topRight, color },
    { start: topRight, end: bottomRight, color },
    { start: bottomRight, end: bottomLeft, color },
    { start: bottomLeft, end: topLeft, color }
  ];
}

window.connTanksDebug = {
  get showColliders() {
    return debugState.showColliders;
  },
  set showColliders(value) {
    setShowColliders(value);
  },
  setShowColliders,
  toggleShowColliders
};
// #endregion

// #region Update
function update(dt, now) {
  const movement = input.getMovement();
  const state = world.movePlayer(network.localId, movement, dt);
  if (state) pendingNetworkMoveDt += dt;
  world.updateAim(network.localId, mouse.getPosition());
  const click = mouse.consumePrimaryClick();
  if (click) {
    world.fireProjectile(network.localId);
    network.sendLocalAction({ type: PlayerActionType.FIRE, target: click });
  }
  world.update(dt);

  const shouldSendMove = state && (
    now - lastNetworkSend >= 1000 / NETWORK_HZ
    || (!movement.throttle && !movement.rotate)
  );

  if (shouldSendMove) {
    lastNetworkSend = now;
    network.sendLocalMove(movement, pendingNetworkMoveDt);
    pendingNetworkMoveDt = 0;
  }
}
// #endregion

// #region Render Loop
function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt, now);
  renderer.render(world.sprites, {
    shapes: world.levelShapes,
    debugLines: getDebugLines()
  });
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
// #endregion
