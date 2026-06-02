// Stats.js — per-peer stat tracking and UI rendering
export class PeerStats {
  constructor() {
    this.rxR       = 0;
    this.rxU       = 0;
    this.lost      = 0;
    this.lastSeq   = -1;
    this.rtt       = [];
    this.ackWindow = 0;
  }

  recordRx(label) {
    if (label === 'reliable') this.rxR++;
    else this.rxU++;
    return label === 'reliable' ? this.rxR : this.rxU;
  }

  recordRtt(rtt, max = 200) {
    this.rtt.push(rtt);
    if (this.rtt.length > max) this.rtt.shift();
  }

  avgRtt() {
    if (!this.rtt.length) return null;
    return Math.round(this.rtt.reduce((a, b) => a + b, 0) / this.rtt.length);
  }

  trackSeqGap(seq) {
    if (this.lastSeq >= 0) {
      const gap = seq - this.lastSeq - 1;
      if (gap > 0) this.lost += gap;
    }
    this.lastSeq = seq;
  }
}

// ── Guest stats (two channels) ──────────────────────────────────────────
export class GuestStats {
  constructor() {
    this.reliable   = { rtt: [], tx: 0, rx: 0, burstWindow: 0 };
    this.unreliable = { rtt: [], tx: 0, rx: 0, burstWindow: 0, lost: 0 };
  }

  channel(label) { return this[label]; }

  recordRtt(label, rtt) {
    const s = this.channel(label);
    s.rtt.push(rtt);
    if (s.rtt.length > 50) s.rtt.shift();
  }

  avgRtt(label) {
    const s = this.channel(label);
    if (!s.rtt.length) return null;
    return Math.round(s.rtt.reduce((a, b) => a + b, 0) / s.rtt.length);
  }

  render(hostReliable, hostConn) {
    const card = document.getElementById('guest-host-card');
    const testCard = document.getElementById('guest-test-card');
    const info = document.getElementById('guest-host-info');
    if (!info) return;
    card?.classList.remove('hidden');
    testCard?.classList.remove('hidden');

    const rOpen = hostReliable?.open;
    const uOpen = hostConn?.open;
    const avgR = this.avgRtt('reliable')   ?? '--';
    const avgU = this.avgRtt('unreliable') ?? '--';

    info.innerHTML =
      '<span class="peer-status' + (rOpen || uOpen ? '' : ' disconnected') + '"></span>Host' +
      '<div class="peer-stats">' +
        '<div class="stat">Reliable ch: <span>'    + (rOpen ? 'open' : 'closed') + '</span></div>' +
        '<div class="stat">Unreliable ch: <span>'  + (uOpen ? 'open' : 'closed') + '</span></div>' +
        '<div class="stat">RTT (reliable): <span>' + avgR + ' ms</span></div>' +
        '<div class="stat">RTT (unreliable): <span>' + avgU + ' ms</span></div>' +
        '<div class="stat">Reliable tx: <span>'   + this.reliable.tx   + '</span></div>' +
        '<div class="stat">Reliable rx: <span>'   + this.reliable.rx   + '</span></div>' +
        '<div class="stat">Unreliable tx: <span>' + this.unreliable.tx + '</span></div>' +
        '<div class="stat">Unreliable rx: <span>' + this.unreliable.rx + '</span></div>' +
      '</div>';
  }
}