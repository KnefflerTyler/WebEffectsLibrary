// TestRunner.js — manages burst/stream test execution for host or guest
export class TestRunner {
  constructor(logger) {
    this._log      = logger;
    this._interval = null;
    this._seq      = 0;
  }

  get running() { return this._interval !== null; }

  stop() {
    if (!this._interval) return;
    clearInterval(this._interval);
    this._interval = null;
    this._log.warn('Test stopped.');
  }

  // ── Host broadcast ──────────────────────────────────────────────
  runBroadcast(channelType, mode, getChannels) {
    this.stop();
    this._seq = 0;
    this._log.info('Broadcasting ' + channelType + ' ' + mode + ' to all guests...');

    if (mode === 'burst') {
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) {
        const payload = JSON.stringify({ type: 'broadcast', seq: this._seq++, ts: Date.now() });
        getChannels().forEach(c => c.send(payload));
      }
      this._log.data('Burst: sent 100 broadcasts in ' + Math.round(performance.now() - t0) + 'ms');
    } else {
      this._interval = setInterval(() => {
        const chs = getChannels();
        if (chs.length === 0) return;
        const payload = JSON.stringify({ type: 'broadcast', seq: this._seq++, ts: Date.now() });
        chs.forEach(c => c.send(payload));
        if (this._seq % 20 === 0) {
          this._log.data('[' + channelType + '] stream broadcast tick ' + this._seq);
        }
      }, 50);
    }
  }

  // ── Guest ping ──────────────────────────────────────────────────
  runPing(channelType, mode, getChannel, stats) {
    this.stop();
    this._seq = 0;
    const ch = getChannel();
    if (!ch?.open) { this._log.warn('Channel not open yet.'); return; }
    this._log.info('Starting ' + channelType + ' ' + mode + ' test...');

    if (mode === 'burst') {
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) {
        ch.send(JSON.stringify({ type: 'ping', seq: this._seq++, ts: Date.now(), label: channelType }));
        stats.channel(channelType).tx++;
      }
      this._log.data('Burst: sent 100 pings in ' + Math.round(performance.now() - t0) + 'ms');
    } else {
      this._interval = setInterval(() => {
        if (!ch.open) { this.stop(); return; }
        ch.send(JSON.stringify({ type: 'ping', seq: this._seq++, ts: Date.now(), label: channelType }));
        stats.channel(channelType).tx++;
        if (this._seq % 20 === 0) {
          this._log.data('[' + channelType + '] stream tick ' + this._seq);
        }
      }, 50);
    }
  }
}