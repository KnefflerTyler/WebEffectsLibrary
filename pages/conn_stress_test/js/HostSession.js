// HostSession.js — manages host-side PeerJS connections and peer list UI
import { PeerStats } from './Stats.js';

export class HostSession {
  constructor(logger, runner) {
    this._log         = logger;
    this._runner      = runner;
    this._peer        = null;
    this._connections = new Map(); // peerId -> { reliable, unreliable, stats: PeerStats }
  }

  get connections() { return this._connections; }

  start(peer) {
    this._peer = peer;

    peer.on('open', id => {
      document.getElementById('room-code').textContent = id;
      this._log.ok('Room open. Code: ' + id);
    });

    peer.on('connection', conn => {
      this._log.info('Incoming connection from ' + conn.peer);
      this._initSlot(conn.peer);
      this._setupConn(conn);
    });

    peer.on('error', err => this._log.error('PeerJS error: ' + err.message));
  }

  _initSlot(peerId) {
    if (this._connections.has(peerId)) return;
    this._connections.set(peerId, { reliable: null, unreliable: null, stats: new PeerStats() });
  }

  _setupConn(conn) {
    const label  = conn.label;
    const peerId = conn.peer;
    const short  = peerId.slice(0, 8);

    conn.on('open', () => {
      this._connections.get(peerId)[label] = conn;
      this._log.ok('[' + short + '] ' + label + ' channel open');
      conn.send(JSON.stringify({ type: 'hello', label }));
      this._renderPeerList();
    });

    conn.on('data', raw => {
      try { this._handleData(peerId, label, JSON.parse(raw)); } catch { /* ignore */ }
    });

    conn.on('close', () => {
      this._log.warn('[' + short + '] ' + label + ' closed');
      const slot = this._connections.get(peerId);
      if (slot) slot[label] = null;
      this._renderPeerList();
    });

    conn.on('error', err => this._log.error('[' + short + '] error: ' + err.message));
  }

  _handleData(peerId, label, msg) {
    const slot  = this._connections.get(peerId);
    if (!slot) return;
    const short = peerId.slice(0, 8);
    const st    = slot.stats;

    if (msg.type === 'ping') {
      const ch = slot[label];
      if (ch?.open) ch.send(JSON.stringify({ type: 'pong', seq: msg.seq, ts: msg.ts, label }));

      const rxTotal = st.recordRx(label);
      if (msg.seq === 0)           this._log.info('[' + short + '] [' + label + '] ping stream started');
      if (rxTotal % 20 === 0)      this._log.data('[' + short + '] [' + label + '] ping rx tick ' + rxTotal);
      if (msg.seq === 99)          this._log.ok('[' + short + '] [' + label + '] burst of 100 pings received');

      if (label === 'unreliable') st.trackSeqGap(msg.seq);
      this._renderPeerList();
      return;
    }

    if (msg.type === 'ack') {
      const rtt = Date.now() - msg.ts;
      st.recordRx(label);
      st.recordRtt(rtt);
      const avg = st.avgRtt();

      if (msg.seq === 0)              { st.ackWindow = 0; this._log.info('[' + short + '] [' + label + '] ack stream started'); }
      st.ackWindow = (st.ackWindow || 0) + 1;
      if (st.ackWindow % 20 === 0)    this._log.data('[' + short + '] [' + label + '] ack tick ' + st.ackWindow + ' | avg RTT ' + avg + 'ms');
      if (st.ackWindow === 100)        this._log.ok('[' + short + '] [' + label + '] burst of 100 acked | avg RTT ' + avg + 'ms');

      if (label === 'unreliable') st.trackSeqGap(msg.seq);
      this._renderPeerList();
    }
  }

  _renderPeerList() {
    const list  = document.getElementById('peer-list');
    const count = document.getElementById('peer-count');
    const active = [...this._connections.values()].filter(s => s.reliable || s.unreliable);
    count.textContent = '(' + active.length + ')';
    list.innerHTML = '';

    for (const [id, slot] of this._connections.entries()) {
      const rOpen = slot.reliable?.open;
      const uOpen = slot.unreliable?.open;
      if (!rOpen && !uOpen) continue;

      const avg = slot.stats.avgRtt() ?? '--';
      const div = document.createElement('div');
      div.className = 'peer-item';
      div.innerHTML =
        '<span class="peer-status' + (rOpen || uOpen ? '' : ' disconnected') + '"></span>' +
        'Peer<div class="peer-id">' + id + '</div>' +
        '<div class="peer-stats">' +
          '<div class="stat">Reliable rx: <span>'   + slot.stats.rxR  + '</span></div>' +
          '<div class="stat">Unreliable rx: <span>' + slot.stats.rxU  + '</span></div>' +
          '<div class="stat">Lost (est): <span>'    + slot.stats.lost + '</span></div>' +
          '<div class="stat">Avg RTT: <span>'       + avg + ' ms</span></div>' +
        '</div>';
      list.appendChild(div);
    }
  }

  getChannels(channelType) {
    return [...this._connections.values()]
      .map(s => s[channelType])
      .filter(c => c?.open);
  }
}