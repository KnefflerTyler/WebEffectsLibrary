// #region Imports
import { NETWORK_HZ } from './config.js';
import { PlayerActionType } from './api/models.js';
import { loadProjectileData } from './objects/Projectile/Projectile.js';
import { loadTankData } from './objects/player/Tank.js';
import { getCardData, loadCardData } from './managers/CardManager.js';
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
await loadCardData();
const world = new GameManager();
await world.loadLevel('lobby.level.json');
const availableLevels = await loadAvailableLevels();
const input = new KeyboardInput();
const mouse = new MouseInput(canvas);
// #endregion

// #region Game State
let lastTime = performance.now();
let lastNetworkSend = 0;
let pendingNetworkMoveDt = 0;
let lastLocalFire = -Infinity;
// #endregion

// #region Network
const network = new NetworkManager({
  getSnapshot: () => world.serialize(),
  getLevelData: () => world.getLevelData(),
  getGameState: () => world.serializeGameState(),

  onReady: ({ id, roomCode, role, name }) => {
    if (role === 'host') {
      world.addHost(id, name);
      sessionStorage.setItem('connTanksHostLobby', JSON.stringify({ roomCode, name }));
    }
    ui.showGame(roomCode, role);
    ui.updatePlayerCount(world.players.size);
    ui.updateMatchState(world.serializeGameState(), world.serialize(), network.localId);
  },

  onPlayerJoined: player => {
    world.addGuest(player.id, player.name, world.players.size);
    ui.updatePlayerCount(world.players.size);
  },

  onPlayerLeft: id => {
    world.removePlayer(id);
    ui.updatePlayerCount(world.players.size);
  },

  onLevelData: async level => {
    ui.setLoading(true);
    try {
      await world.loadLevelData(level);
    } catch (error) {
      ui.setLoading(false);
      throw error;
    }
  },
  onGameState: game => world.applyGameState(game),
  onSnapshot: players => {
    world.applySnapshot(players);
    ui.updatePlayerCount(world.players.size);
    ui.updateMatchState(world.serializeGameState(), world.serialize(), network.localId);
  },

  onRemoteMove: (id, movement, dt) => world.verifyPlayerMovement(id, movement, dt),
  onRemoteAction: (id, action) => world.verifyPlayerAction(id, action),
  onDisconnected: () => ui.showDisconnected(),
  onError: error => ui.setMenuStatus(error.message)
});
// #endregion

// #region UI
const ui = new GameUI({
  onHost: (name, roomCode) => network.host(name, roomCode),
  onJoin: (roomCode, name) => network.join(roomCode, name),
  onCpuCountChange: count => {
    if (network.role !== 'host' || !world.setCpuCount(count)) return;
    ui.updatePlayerCount(world.players.size);
  },
  onStartGame: async (levels, winsRequired) => {
    ui.setHostStatus(`Loading ${levels[0].name ?? levels[0].id}…`);
    try {
      await world.startGame(levels, winsRequired);
      sessionStorage.removeItem('connTanksHostLobby');
      network.broadcastSnapshot();
      ui.updateMatchState(world.serializeGameState(), world.serialize(), network.localId);
    } catch (error) {
      ui.setHostStatus(error.message);
    }
  },
  onSelectCard: cardId => {
    if (network.role === 'host') world.selectCard(network.localId, cardId);
    else network.sendLocalAction({ type: PlayerActionType.CARD_SELECT, cardId });
  },
  onGrantCard: (playerId, cardId) => network.role === 'host' && world.grantCard(playerId, cardId),
  onRemoveCard: (playerId, cardId) => network.role === 'host' && world.removeCard(playerId, cardId),
  onEndRound: () => world.endRoundWithoutWinner(),
  onExit: () => {
    sessionStorage.removeItem('connTanksHostLobby');
    network.destroy();
    location.replace(location.pathname);
  }
});
ui.setLevels(availableLevels);
ui.setCards(getCardData());
world.onGameStateChanged = () => {
  if (network.role === 'host' && world.phase === 'lobby' && network.localId) {
    const name = world.players.get(network.localId)?.name || 'Player';
    sessionStorage.setItem('connTanksHostLobby', JSON.stringify({
      roomCode: network.localId,
      name
    }));
  }
  network.broadcastSnapshot();
  ui.updateMatchState(world.serializeGameState(), world.serialize(), network.localId);
};
window.addEventListener('pagehide', () => network.destroy());
// #endregion

// #region Debug
const debugState = {
  showAimLine: false,
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
    const points = sprite.collider.getGeometry()?.points ?? [];
    return points.map((point, index) => ({
      start: point,
      end: points[(index + 1) % points.length],
      color: [0.2, 1, 0.35, 0.9]
    }));
  });
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
  const localPlayer = world.players.get(network.localId);
  const weapon = localPlayer?.projectileModifiers ?? {};
  const automaticReady = weapon.automatic
    && mouse.isPrimaryDown
    && now - lastLocalFire >= (weapon.fireInterval ?? 0.11) * 1000;
  const fireTarget = click ?? (automaticReady ? mouse.getPosition() : null);
  if (fireTarget) {
    const projectiles = world.fireProjectile(network.localId);
    if (projectiles) {
      lastLocalFire = now;
      network.sendLocalAction({ type: PlayerActionType.FIRE, target: fireTarget });
    }
  }
  world.update(dt, { authoritative: network.role === 'host' });

  const shouldSendMove = network.role !== 'host' && state && (
    now - lastNetworkSend >= 1000 / NETWORK_HZ
    || (!movement.throttle && !movement.rotate)
  );

  if (shouldSendMove) {
    lastNetworkSend = now;
    network.sendLocalMove(movement, pendingNetworkMoveDt);
    pendingNetworkMoveDt = 0;
  }

  if (network.role === 'host' && now - lastNetworkSend >= 1000 / NETWORK_HZ) {
    lastNetworkSend = now;
    network.broadcastSnapshot();
    ui.updateMatchState(world.serializeGameState(), world.serialize(), network.localId);
  }
}
// #endregion

// #region Render Loop
function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt, now);
  ui.updateAmmo([...world.players.values()].map(player => ({
    ...player.serialize(),
    x: player.x,
    y: player.y
  })));
  ui.setScreenWrap(world.screenWrap);
  renderer.render(world.sprites, {
    shapes: world.levelShapes,
    screenWrap: world.screenWrap,
    debugLines: getDebugLines()
  });
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
// #endregion

async function loadAvailableLevels() {
  try {
    const response = await fetch('../assets/data/level/levels.json');
    if (!response.ok) throw new Error('Unable to load level list');
    const levels = await response.json();
    return Array.isArray(levels) && levels.length
      ? levels
      : [{ id: 'default', name: 'Default Arena', file: 'default.level.json' }];
  } catch (error) {
    console.warn(error);
    return [{ id: 'default', name: 'Default Arena', file: 'default.level.json' }];
  }
}
