// GuestSession.js — manages guest-side PeerJS connections and host info UI
import { GuestStats } from './Stats.js';

export class GuestSession {
  constructor(logger) {
    this._log      = logger;
    this._peer     = null;
    this.reliable   = null;
    this.unreliable = null;
    this.stats      = new GuestStats();
  }

  connect(peer, hostCode) {
    this._peer = peer;

    peer.on('open', myId => {
      this._log.info('My peer ID: ' + myId);
      this.reliable   = peer.connect(hostCode, { label: 'reliable',   reliable: true  });
      this.unreliable = peer.connect(hostCode, { label: 'unreliable', reliable: false });
      this._setupConn(this.reliable,   'reliable');
      this._setupConn(this.unreliable, 'unreliable');
    });

    peer.on('error', err => this._log.error('PeerJS error: ' + err.message));
  }

  _setupConn(conn, label) {
    conn.on('open', () => {
      this._log.ok(label + ' channel open');
      this._renderHostCard();
    });

    conn.on('data', raw => {
      try { this._handleData(label, JSON.parse(raw)); } catch { /* ignore */ }
    });

    conn.on('close', () => {
      this._log.warn(label + ' channel closed');
      this._renderHostCard();
    });

    conn.on('error', err => this._log.error(label + ' error: ' + err.message));
  }

  _handleData(label, msg) {
    if (msg.type === 'hello') {
      this._log.ok('Host acknowledged ' + msg.label + ' channel');
      return;
    }

    if (msg.type === 'pong') {
      const rtt = Date.now() - msg.ts;
      this.stats.recordRtt(label, rtt);
      const avg = this.stats.avgRtt(label);

      if (msg.seq === 0)              this._log.info('[' + label + '] pong stream started');
      if ((msg.seq + 1) % 20 === 0)  this._log.data('[' + label + '] pong tick ' + (msg.seq + 1) + ' | avg RTT ' + avg + 'ms');
      if (msg.seq === 99)            this._log.ok('[' + label + '] burst of 100 ponged | avg RTT ' + avg + 'ms');

      this._renderHostCard();
      return;
    }

    if (msg.type === 'broadcast') {
      const ch = label === 'reliable' ? this.reliable : this.unreliable;
      if (ch?.open) ch.send(JSON.stringify({ type: 'ack', seq: msg.seq, ts: msg.ts, label }));

      const s = this.stats.channel(label);
      s.rx++;

      if (msg.seq === 0) {
        this._log.info('[' + label + '] receiving from host...');
        s.burstWindow = 0;
      }
      s.burstWindow++;

      if (s.rx % 20 === 0)       this._log.data('[' + label + '] rx tick ' + s.rx + ' (seq ' + msg.seq + ')');
      if (s.burstWindow === 100) {
        this._log.ok('[' + label + '] burst of 100 received (total rx: ' + s.rx + ')');
        s.burstWindow = 0;
      }

      this._renderHostCard();
    }
  }

  getChannel(channelType) {
    return channelType === 'reliable' ? this.reliable : this.unreliable;
  }

  _renderHostCard() {
    this.stats.render(this.reliable, this.unreliable);
  }
}