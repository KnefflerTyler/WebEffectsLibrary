// GuestSession.js — guest/viewer PeerJS; only sends moves/name/replay
export class GuestSession {
  /**
   * @param {import('./UI.js').UI} ui
   * @param {string} myName
   */
  constructor(ui, myName) {
    this._ui      = ui;
    this._myName  = myName;
    this._peer    = null;
    this._conn    = null;
    this._myId    = null;
    this._myRole  = 'viewer';
    this._game    = null;   // latest serialized state from host
    this._peers   = [];
  }

  // ── Connect to host ────────────────────────────────────────────
  connect(peer, code) {
    this._peer = peer;

    peer.on('open', myId => {
      this._myId = myId;
      this._conn = peer.connect(code, { label: 'game', reliable: true });

      this._conn.on('open', () => {
        this._ui.appendEvent('Connected to room.');
        this._send({ type: 'name', name: this._myName });
      });

      this._conn.on('data', raw => {
        try { this._handleData(JSON.parse(raw)); } catch {}
      });

      this._conn.on('close', () => {
        this._ui.appendEvent('Disconnected from host.');
        const banner = document.getElementById('turn-banner');
        if (banner) { banner.textContent = 'Host disconnected.'; banner.classList.remove('your-turn'); }
      });
    });

    peer.on('error', err => {
      console.error('PeerJS guest error:', err);
      const banner = document.getElementById('turn-banner');
      if (banner) banner.textContent = 'Connection failed.';
    });
  }

  // ── Incoming data from host ────────────────────────────────────
  _handleData(msg) {
    if (msg.type === 'welcome') {
      this._myId   = msg.myId;
      this._myRole = msg.role;
      this._applyGameState(msg.game, msg.peers);
      this._ui.showScreen('game-screen');
      return;
    }

    if (msg.type === 'state') {
      const me = msg.peers.find(p => p.id === this._myId);
      if (me) this._myRole = me.role;
      this._applyGameState(msg.game, msg.peers);
      return;
    }

    if (msg.type === 'replay-ack') {
      this._ui.appendEvent('New game started.');
      this._ui.hideResult();
      return;
    }

    if (msg.type === 'chat') {
      this._ui.appendChat(msg.from, msg.text, false);
      return;
    }

    if (msg.type === 'kicked') {
      this._conn?.close();
      this._peer?.destroy();
      // Show the role screen with a kicked notice
      this._ui.showScreen('role-screen');
      const sub = document.querySelector('#role-screen .sub');
      if (sub) { sub.textContent = 'You were kicked from the game.'; sub.style.color = '#f07b5b'; }
    }
  }

  _applyGameState(game, peers) {
    this._game  = game;
    this._peers = peers;
    const myMark = this._myRole === 'x' ? 'X' : this._myRole === 'o' ? 'O' : null;
    this._ui.renderViewerBar(peers);
    this._ui.renderPlayerSlots(peers, game.scores);
    this._ui.renderBoard(game.board, game.winLine, myMark, game.over);
    this._ui.updateBanner(game.turn, myMark, game.over);
    if (game.over) this._ui.showResult(game.winner, myMark);
  }

  // ── Cell click ─────────────────────────────────────────────────
  handleCellClick(index) {
    if (!this._game || this._game.over) return;
    if (this._myRole === 'viewer') return;
    const expectedTurn = this._myRole === 'x' ? 'X' : 'O';
    if (this._game.turn !== expectedTurn) return;
    this._send({ type: 'move', index });
  }

  // ── Replay ─────────────────────────────────────────────────────
  requestReplay() {
    if (this._myRole === 'viewer') return;
    document.getElementById('replay-btn').disabled       = true;
    document.getElementById('replay-status').textContent = 'Waiting for opponent…';
    this._send({ type: 'replay' });
  }

  // ── Chat send ──────────────────────────────────────────────────
  sendChat(text) {
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    this._ui.appendChat(this._myName, text, true);
    this._send({ type: 'chat', text });
  }

  // ── Internal ───────────────────────────────────────────────────
  _send(data) {
    if (this._conn?.open) this._conn.send(JSON.stringify(data));
  }
}