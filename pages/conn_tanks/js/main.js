import { NETWORK_HZ } from './config.js';
import Game from './managers/GameManager.js';
import KeyboardInput from './input/keyboardInput.js';
import P2PSession from './network/p2pSession.js';
import WebGLRenderer from './renderer/webglRenderer.js';
import GameUI from './ui/gameUI.js';

const canvas = document.getElementById('game-canvas');
const renderer = await WebGLRenderer.create(canvas);
const world = new Game();
const input = new KeyboardInput();

let lastTime = performance.now();
let lastNetworkSend = 0;

const session = new P2PSession({
  getSnapshot: () => world.serialize(),

  onReady: ({ id, roomCode, role, name }) => {
    if (role === 'host') world.addHost(id, name);
    ui.showGame(roomCode);
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

  onSnapshot: (players, { preserveLocal }) => {
    world.applySnapshot(players, preserveLocal ? session.localId : null);
    ui.updatePlayerCount(world.players.size);
  },

  onRemoteMove: (id, state) => world.applyPlayerState(id, state),
  onDisconnected: () => ui.showDisconnected(),
  onError: error => ui.setMenuStatus(error.message)
});

const ui = new GameUI({
  onHost: name => session.host(name),
  onJoin: (roomCode, name) => session.join(roomCode, name)
});

function update(dt, now) {
  world.update(dt);
  const state = world.movePlayer(session.localId, input.getMovement(), dt);
  if (!state || now - lastNetworkSend < 1000 / NETWORK_HZ) return;
  lastNetworkSend = now;
  session.sendLocalState(state);
}

function animate(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt, now);
  renderer.render(world.sprites);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
