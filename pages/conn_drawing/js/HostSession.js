/**
 * Manages the PeerJS host side of a collaborative drawing session.
 *
 * The host is the single source of truth for the canvas. It:
 *   - Opens a Peer and exposes the room code.
 *   - Accepts incoming guest connections.
 *   - Sends each new guest a full canvas snapshot on connect.
 *   - Rebroadcasts every op it receives to all other connected guests.
 *
 * @param {{
 *   onOp:          (msg: object) => void,   // incoming remote op to apply locally
 *   onStateRequest: () => string,            // called to get current canvas dataUrl
 *   onGuestJoined:  () => void,
 *   onGuestLeft:    () => void,
 *   onError:        (msg: string) => void,
 * }} callbacks
 */
export class HostSession {
  constructor({ onOp, onStateRequest, onGuestJoined, onGuestLeft, onError }) {
    this._onOp           = onOp;
    this._onStateRequest = onStateRequest;
    this._onGuestJoined  = onGuestJoined ?? (() => {});
    this._onGuestLeft    = onGuestLeft   ?? (() => {});
    this._onError        = onError       ?? (() => {});

    this._peer        = null;
    this._connections = [];
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** Opens a Peer and returns a Promise that resolves to the room code string. */
  start() {
    return new Promise((resolve, reject) => {
      this._peer = new Peer();

      this._peer.on('open', id => resolve(id));

      this._peer.on('connection', incoming => this._handleIncoming(incoming));

      this._peer.on('error', err => {
        this._onError(err.message);
        reject(err);
      });
    });
  }

  /** Send an op to every connected guest. Optionally exclude one connection. */
  broadcast(msg, exceptConn = null) {
    const data = JSON.stringify(msg);
    this._connections.forEach(c => {
      if (c !== exceptConn && c.open) c.send(data);
    });
  }

  get connectionCount() {
    return this._connections.filter(c => c.open).length;
  }

  get peerId() {
    return this._peer?.id ?? null;
  }

  // ── Private ──────────────────────────────────────────────────────────

  _handleIncoming(conn) {
    this._connections.push(conn);

    conn.on('open', () => {
      conn.send(JSON.stringify({ type: 'canvas_sync', dataUrl: this._onStateRequest() }));
      this._onGuestJoined();
    });

    conn.on('data', raw => {
      try {
        const msg = JSON.parse(raw);
        this._onOp(msg);
        // Rebroadcast to all other guests
        this.broadcast(msg, conn);
      } catch { /* ignore malformed */ }
    });

    conn.on('close', () => {
      const leaveMsg = { type: 'cursor_leave', peerId: conn.peer };
      this._connections = this._connections.filter(c => c !== conn);
      this.broadcast(leaveMsg);
      this._onOp(leaveMsg);  // update host's own cursor overlay
      this._onGuestLeft();
    });

    conn.on('error', () => {
      const leaveMsg = { type: 'cursor_leave', peerId: conn.peer };
      this._connections = this._connections.filter(c => c !== conn);
      this.broadcast(leaveMsg);
      this._onOp(leaveMsg);
      this._onGuestLeft();
    });
  }
}
