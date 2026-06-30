// #region Imports
import { ApiMessageType } from '../api/models.js';
import {
  createActionRequest,
  createMoveRequest,
  createStateRequest,
  createWelcomeRequest,
  getSnapshotLevel,
  getSnapshotGame,
  getSnapshotPlayers,
  parseApiRequest
} from '../api/requests.js';
// #endregion

export class NetworkManager {
  // #region Lifecycle
  constructor({
    PeerClass = window.Peer,
    getSnapshot = () => [],
    getLevelData = () => null,
    getGameState = () => null,
    onReady = () => {},
    onPlayerJoined = () => {},
    onPlayerLeft = () => {},
    onSnapshot = () => {},
    onLevelData = () => {},
    onGameState = () => {},
    onRemoteMove = () => {},
    onRemoteAction = () => {},
    onDisconnected = () => {},
    onError = () => {}
  } = {}) {
    if (!PeerClass) throw new Error('PeerJS did not load.');
    this.PeerClass = PeerClass;
    this.getSnapshot = getSnapshot;
    this.getLevelData = getLevelData;
    this.getGameState = getGameState;
    this.handlers = {
      onReady, onPlayerJoined, onPlayerLeft, onSnapshot,
      onLevelData, onGameState, onRemoteMove, onRemoteAction, onDisconnected, onError
    };
    this.connections = new Map();
    this.peer = null;
    this.hostConnection = null;
    this.role = null;
    this.localId = null;
    this.lastLevelRevision = null;
    this.lastBroadcastLevelRevision = null;
    this.levelBroadcastsRemaining = 0;
  }
  // #endregion

  // #region Session Setup
  host(name) {
    this.role = 'host';
    this.peer = this.createPeer();
    this.peer.on('open', id => {
      this.localId = id;
      this.handlers.onReady({ id, roomCode: id, role: this.role, name });
    });
    this.peer.on('connection', connection => this.acceptConnection(connection));
  }

  join(roomCode, name) {
    this.role = 'guest';
    this.peer = this.createPeer();
    this.peer.on('open', id => {
      this.localId = id;
      const connection = this.peer.connect(roomCode, {
        label: 'tanks',
        reliable: false,
        metadata: { name }
      });
      this.hostConnection = connection;
      connection.on('open', () => {
        this.handlers.onReady({ id, roomCode, role: this.role, name });
      });
      connection.on('data', raw => this.handleGuestData(raw));
      connection.on('close', () => this.handlers.onDisconnected());
      connection.on('error', error => this.handlers.onError(error));
    });
  }
  // #endregion

  // #region Peer Connections
  createPeer() {
    const peer = new this.PeerClass();
    peer.on('error', error => this.handlers.onError(error));
    return peer;
  }

  acceptConnection(connection) {
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      this.connections.delete(connection.peer);
      this.handlers.onPlayerLeft(connection.peer);
      this.broadcastSnapshot();
    };

    connection.on('open', () => {
      this.connections.set(connection.peer, connection);
      this.handlers.onPlayerJoined({
        id: connection.peer,
        name: String(connection.metadata?.name || '').slice(0, 18),
        index: this.connections.size
      });
      this.send(connection, createWelcomeRequest({
        players: this.getSnapshot(),
        level: this.getLevelData(),
        game: this.getGameState()
      }));
      this.broadcastSnapshot();
    });
    connection.on('data', raw => this.handleHostData(connection, raw));
    connection.on('close', remove);
    connection.on('error', remove);
  }
  // #endregion

  // #region Incoming Messages
  handleHostData(connection, raw) {
    const request = parseApiRequest(raw);
    if (request?.type === ApiMessageType.MOVE) {
      this.handlers.onRemoteMove(connection.peer, request.movement, request.dt);
    } else if (request?.type === ApiMessageType.ACTION) {
      this.handlers.onRemoteAction(connection.peer, request.action);
    } else {
      return;
    }
    this.broadcastSnapshot();
  }

  async handleGuestData(raw) {
    const request = parseApiRequest(raw);
    const players = getSnapshotPlayers(request);
    if (!players) return;
    const level = getSnapshotLevel(request);
    const game = getSnapshotGame(request);
    const revision = game.levelRevision;
    if (level && revision !== this.lastLevelRevision) {
      await this.handlers.onLevelData(level);
      this.lastLevelRevision = revision;
    }
    if (game) this.handlers.onGameState(game);
    this.handlers.onSnapshot(players);
  }
  // #endregion

  // #region Outgoing Messages
  sendLocalMove(movement, dt) {
    if (this.role === 'host') {
      this.broadcastSnapshot();
      return;
    }
    this.send(this.hostConnection, createMoveRequest(movement, dt));
  }

  sendLocalAction(action) {
    if (this.role === 'host') {
      this.broadcastSnapshot();
      return;
    }
    this.send(this.hostConnection, createActionRequest(action));
  }

  broadcastSnapshot() {
    if (this.role !== 'host') return;
    const game = this.getGameState();
    const revision = game.levelRevision;
    if (revision !== this.lastBroadcastLevelRevision) {
      this.lastBroadcastLevelRevision = revision;
      this.levelBroadcastsRemaining = 3;
    }
    const includeLevel = this.levelBroadcastsRemaining > 0;
    this.broadcast(createStateRequest({
      players: this.getSnapshot(),
      level: includeLevel ? this.getLevelData() : null,
      game
    }));
    if (includeLevel) this.levelBroadcastsRemaining -= 1;
  }

  broadcast(message) {
    for (const connection of this.connections.values()) this.send(connection, message);
  }

  send(connection, message) {
    if (connection?.open && message) connection.send(JSON.stringify(message));
  }
  // #endregion

  // #region Teardown
  destroy() {
    this.hostConnection?.close();
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
    this.peer?.destroy();
  }
  // #endregion
}

export default NetworkManager;
