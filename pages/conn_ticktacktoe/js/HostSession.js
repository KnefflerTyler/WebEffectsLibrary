// HostSession.js — all host-side PeerJS + game orchestration
// Host is the single source of truth; all state is pushed to guests.
import { Game } from './Game.js';

export class HostSession {
  /**
   * @param {import('./UI.js').UI} ui
   * @param {string} hostName
   */
  constructor(ui, hostName) {
    this._ui   = ui;
    this._peer = null;
    this._game = new Game();
    // Map<peerId, { conn: DataConnection|null, name: string, role: 'x'|'o'|'viewer' }>
    // 'host' entry always present with conn=null
    this._peers = new Map([
      ['host', { conn: null, name: hostName, role: 'x' }],
    ]);
  }

  // ── Bootstrap ──────────────────────────────────────────────────
  start(peer) {
    this._peer = peer;

    peer.on('open', id => {
      document.getElementById('game-room-code').textContent = id;
      document.getElementById('room-info-bar').classList.remove('hidden');
      this._render();
    });

    peer.on('connection', conn => {
      conn.on('open', () => {
        // Auto-assign role: first open slot wins, otherwise viewer
        const hasO = [...this._peers.values()].some(p => p.role === 'o');
        const role = hasO ? 'viewer' : 'o';
        this._peers.set(conn.peer, { conn, name: 'Guest', role });
        this._ui.appendEvent('Guest connected (' + role + ' slot)');
        // Send welcome + current state snapshot
        this._sendTo(conn, {
          type:  'welcome',
          myId:  conn.peer,
          role,
          game:  this._game.serialize(),
          peers: this._peersArray(),
        });
        this._update();
      });

      conn.on('data', raw => {
        try { this._handleData(conn.peer, JSON.parse(raw)); } catch {}
      });

      conn.on('close', () => {
        const leaving = this._peers.get(conn.peer);
        if (leaving) this._ui.appendEvent((leaving.name || 'Guest') + ' disconnected.');
        this._peers.delete(conn.peer);
        this._update();
      });

      conn.on('error', err => console.warn('conn error', err));
    });

    peer.on('error', err => console.error('PeerJS host error:', err));
  }

  // ── Incoming data from guests ─────────────────────────────────
  _handleData(peerId, msg) {
    const p = this._peers.get(peerId);
    if (!p) return;

    if (msg.type === 'name') {
      const oldName = p.name;
      p.name = String(msg.name).slice(0, 20) || 'Guest';
      if (oldName === 'Guest') this._ui.appendEvent(p.name + ' joined as ' + p.role + '.');
      else                     this._ui.appendEvent(oldName + ' is now ' + p.name + '.');
      this._update();
      return;
    }

    if (msg.type === 'move') {
      if (this._game.over) return;
      const expectedRole = this._game.turn === 'X' ? 'x' : 'o';
      if (p.role !== expectedRole) return;
      if (this._game.applyMove(msg.index)) {
        this._ui.appendEvent(p.name + ' played cell ' + (msg.index + 1) + '.');
        this._update();
        if (this._game.over) {
          const w = this._game.winner;
          this._ui.appendEvent(w === 'draw' ? "It's a draw!" : (w === 'X' ? this._peers.get('host')?.name : p.name) + ' wins!');
          this._ui.showResult(w, this._myMark());
        }
      }
      return;
    }

    if (msg.type === 'replay') {
      this._ui.appendEvent(p.name + ' wants to replay.');
      this._game.replayVotes.add(peerId);
      this._checkReplay();
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 200);
      if (!text) return;
      this._ui.appendChat(p.name, text, false);
      this._broadcastRaw({ type: 'chat', from: p.name, text });
    }
  }

  // ── Host cell click ────────────────────────────────────────────
  handleCellClick(index) {
    if (this._game.over) return;
    const myRole       = this._peers.get('host')?.role;
    const expectedRole = this._game.turn === 'X' ? 'x' : 'o';
    if (myRole !== expectedRole) return;
    if (this._game.applyMove(index)) {
      this._update();
      if (this._game.over) this._ui.showResult(this._game.winner, this._myMark());
    }
  }

  // ── Replay ────────────────────────────────────────────────────
  requestReplay() {
    document.getElementById('replay-btn').disabled       = true;
    document.getElementById('replay-status').textContent = 'Waiting for opponent…';
    this._game.replayVotes.add('host');
    this._checkReplay();
  }

  _checkReplay() {
    const players = [...this._peers.entries()]
      .filter(([, p]) => p.role === 'x' || p.role === 'o')
      .map(([id]) => id);
    if (players.length === 0) return;
    if (!players.every(id => this._game.replayVotes.has(id))) return;

    this._ui.appendEvent('New game started.');
    this._game.reset();
    this._ui.hideResult();
    // Notify guests replay is starting, then push fresh state
    this._broadcastRaw({ type: 'replay-ack' });
    this._update();
  }

  // ── Host chat send ────────────────────────────────────────────
  sendChat(text) {
    text = String(text || '').trim().slice(0, 200);
    if (!text) return;
    const myName = this._peers.get('host')?.name || 'Host';
    this._ui.appendChat(myName, text, true);
    this._broadcastRaw({ type: 'chat', from: myName, text });
  }

  // ── Kick (host only) ───────────────────────────────────────────
  kick(peerId) {
    if (peerId === 'host') return;            // can't kick yourself
    const p = this._peers.get(peerId);
    if (!p) return;
    this._ui.appendEvent('Kicked ' + (p.name || 'Guest') + '.');
    this._sendTo(p.conn, { type: 'kicked' }); // notify before close
    p.conn?.close();
    this._peers.delete(peerId);
    this._update();
  }

  // ── Slot drag/drop (host only) ─────────────────────────────────
  assignSlot(peerId, slot) {
    // 'slot' is 'x' or 'o'
    const target = this._peers.get(peerId);
    if (!target || target.role === slot) return;
    // Displace current occupant
    for (const [, p] of this._peers.entries()) {
      if (p.role === slot) p.role = 'viewer';
    }
    target.role = slot;
    this._update();
  }

  // ── Internal helpers ──────────────────────────────────────────
  _update() {
    this._broadcastState();
    this._render();
  }

  _broadcastState() {
    const msg = { type: 'state', game: this._game.serialize(), peers: this._peersArray() };
    this._broadcastRaw(msg);
  }

  _broadcastRaw(data) {
    for (const [id, p] of this._peers.entries()) {
      if (id !== 'host') this._sendTo(p.conn, data);
    }
  }

  _sendTo(conn, data) {
    if (conn?.open) conn.send(JSON.stringify(data));
  }

  _render() {
    const arr  = this._peersArray();
    const mark = this._myMark();
    this._ui.renderViewerBar(arr);
    this._ui.renderPlayerSlots(arr, this._game.scores);
    this._ui.renderBoard(this._game.board, this._game.winLine, mark, this._game.over);
    this._ui.updateBanner(this._game.turn, mark, this._game.over);
  }

  _peersArray() {
    return [...this._peers.entries()].map(([id, p]) => ({
      id, name: p.name, role: p.role,
    }));
  }

  _myMark() {
    const r = this._peers.get('host')?.role;
    if (r === 'x') return 'X';
    if (r === 'o') return 'O';
    return null;
  }
}