export class P2PSession {
  constructor({
    PeerClass = window.Peer,
    getSnapshot = () => [],
    onReady = () => {},
    onPlayerJoined = () => {},
    onPlayerLeft = () => {},
    onSnapshot = () => {},
    onRemoteMove = () => {},
    onDisconnected = () => {},
    onError = () => {}
  } = {}) {
    if (!PeerClass) throw new Error('PeerJS did not load.');
    this.PeerClass = PeerClass;
    this.getSnapshot = getSnapshot;
    this.handlers = {
      onReady, onPlayerJoined, onPlayerLeft, onSnapshot,
      onRemoteMove, onDisconnected, onError
    };
    this.connections = new Map();
    this.peer = null;
    this.hostConnection = null;
    this.role = null;
    this.localId = null;
  }

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
      this.send(connection, { type: 'welcome', players: this.getSnapshot() });
      this.broadcastSnapshot();
    });
    connection.on('data', raw => this.handleHostData(connection, raw));
    connection.on('close', remove);
    connection.on('error', remove);
  }

  handleHostData(connection, raw) {
    const message = this.parse(raw);
    if (message?.type !== 'move') return;
    this.handlers.onRemoteMove(connection.peer, message.player);
    this.broadcastSnapshot();
  }

  handleGuestData(raw) {
    const message = this.parse(raw);
    if (message?.type !== 'welcome' && message?.type !== 'state') return;
    if (!Array.isArray(message.players)) return;
    this.handlers.onSnapshot(message.players, { preserveLocal: message.type === 'state' });
  }

  sendLocalState(player) {
    if (this.role === 'host') {
      this.broadcastSnapshot();
      return;
    }
    this.send(this.hostConnection, { type: 'move', player });
  }

  broadcastSnapshot() {
    if (this.role !== 'host') return;
    this.broadcast({ type: 'state', players: this.getSnapshot() });
  }

  broadcast(message) {
    for (const connection of this.connections.values()) this.send(connection, message);
  }

  send(connection, message) {
    if (connection?.open) connection.send(JSON.stringify(message));
  }

  parse(raw) {
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  destroy() {
    this.hostConnection?.close();
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
    this.peer?.destroy();
  }
}

export default P2PSession;
