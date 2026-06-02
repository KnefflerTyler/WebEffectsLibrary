// main.js — thin glue layer: wires UI events to session classes
import { Logger }       from './Logger.js';
import { TestRunner }   from './TestRunner.js';
import { HostSession }  from './HostSession.js';
import { GuestSession } from './GuestSession.js';

// ── Instances (created on demand) ──────────────────────────────────
let hostLog   = null;
let guestLog  = null;
let session   = null;  // HostSession | GuestSession
let runner    = null;  // TestRunner
let role      = null;  // 'host' | 'guest'

// ── Screen helpers ─────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── Role: HOST ─────────────────────────────────────────────────────
window.initHost = function () {
  role     = 'host';
  hostLog  = new Logger('host-log');
  runner   = new TestRunner(hostLog);
  session  = new HostSession(hostLog, runner);

  showScreen('host-screen');
  hostLog.info('Creating room...');
  session.start(new Peer());
};

window.copyCode = function () {
  const code = document.getElementById('room-code').textContent;
  const btn  = event.currentTarget;
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
};

// ── Role: GUEST ────────────────────────────────────────────────────
window.showGuestScreen = function () {
  role     = 'guest';
  guestLog = new Logger('guest-log');
  runner   = new TestRunner(guestLog);
  showScreen('guest-screen');
  guestLog.info('Waiting for room code...');
};

window.joinRoom = function () {
  const code = document.getElementById('join-code-input').value.trim();
  if (!code) return;
  guestLog.info('Connecting to room: ' + code);
  session = new GuestSession(guestLog);
  session.connect(new Peer(), code);
};

// ── Shared: Test controls ──────────────────────────────────────────
window.runTest = function (channelType, mode) {
  if (role === 'host') {
    runner.runBroadcast(channelType, mode, () => session.getChannels(channelType));
  } else {
    runner.runPing(channelType, mode, () => session.getChannel(channelType), session.stats);
  }
};

window.stopTest = function () {
  runner?.stop();
};