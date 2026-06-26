import { NETWORK_HZ } from './config.js';
import { PlayerActionType } from './api/models.js';
import GameManager from './managers/GameManager.js';
import NetworkManager from './managers/NetworkManager.js';
import KeyboardInput from './input/keyboardInput.js';
import MouseInput from './input/mouseInput.js';
import WebGLRenderer from './renderer/webglRenderer.js';
import GameUI from './ui/gameUI.js';

const canvas = document.getElementById('game-canvas');
const renderer = await WebGLRenderer.create(canvas);
const world = new GameManager();
await world.loadLevel('default');
const input = new KeyboardInput();
const mouse = new MouseInput(canvas);

let lastTime = performance.now();
let lastNetworkSend = 0;
let pendingNetworkMoveDt = 0;

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

const ui = new GameUI({
  onHost: name => network.host(name),
  onJoin: (roomCode, name) => network.join(roomCode, name)
});

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

function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt, now);
  renderer.render(world.sprites, {
    debugLines: [world.getAimDebugLine(network.localId)].filter(Boolean)
  });
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
