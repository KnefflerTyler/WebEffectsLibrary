/**
 * Manages the PeerJS guest side of a collaborative drawing session.
 *
 * The guest connects to a host by room code and forwards every local op
 * to the host, which rebroadcasts it to all other participants.
 *
 * @param {{
 *   onOp:           (msg: object) => void,  // incoming remote op to apply locally
 *   onConnected:    () => void,
 *   onDisconnected: () => void,
 *   onError:        (msg: string) => void,
 * }} callbacks
 */
export class GuestSession {
  constructor({ onOp, onConnected, onDisconnected, onError }) {
    this._onOp           = onOp;
    this._onConnected    = onConnected    ?? (() => {});
    this._onDisconnected = onDisconnected ?? (() => {});
    this._onError        = onError        ?? (() => {});

    this._peer = null;
    this._conn = null;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** Connects to the host by room code. Returns a Promise that resolves on open. */
  connect(roomCode) {
    return new Promise((resolve, reject) => {
      this._peer = new Peer();

      this._peer.on('open', () => {
        this._conn = this._peer.connect(roomCode, { reliable: true });

        this._conn.on('open', () => {
          this._onConnected();
          resolve();
        });

        this._conn.on('data', raw => {
          try {
            const msg = JSON.parse(raw);
            this._onOp(msg);
          } catch { /* ignore malformed */ }
        });

        this._conn.on('close', () => {
          this._onDisconnected();
        });

        this._conn.on('error', err => {
          this._onError(err.message);
        });
      });

      this._peer.on('error', err => {
        this._onError(err.message);
        reject(err);
      });
    });
  }

  /** Send an op to the host. */
  send(msg) {
    if (this._conn?.open) this._conn.send(JSON.stringify(msg));
  }

  get isConnected() {
    return this._conn?.open ?? false;
  }
}
