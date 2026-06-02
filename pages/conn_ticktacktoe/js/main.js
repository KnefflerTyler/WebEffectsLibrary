// main.js — thin glue: wires HTML onclick/UI events to session classes
import { UI }           from './UI.js';
import { HostSession }  from './HostSession.js';
import { GuestSession } from './GuestSession.js';

let ui      = null;
let session = null;
let _role   = null;   // 'host' | 'guest'
let _code   = null;   // room code for guest

function getUI() {
  if (!ui) {
    ui = new UI({
      onCellClick: i          => session?.handleCellClick(i),
      onSlotDrop:  (pid, slot) => session?.assignSlot?.(pid, slot),
      onKick:      pid         => session?.kick?.(pid),
    });
  }
  return ui;
}

// ── Role select screen ─────────────────────────────────────────────
window.showHost = function () {
  _role = 'host';
  document.getElementById('name-screen-title').textContent = 'Create a Room';
  document.getElementById('name-screen-sub').textContent   = 'What should we call you?';
  document.getElementById('name-input').placeholder        = 'Your name';
  getUI().showScreen('name-screen');
};

window.showJoin = function () {
  document.getElementById('join-area').classList.remove('hidden');
  const code = new URLSearchParams(location.search).get('join');
  if (code) document.getElementById('join-code-input').value = code;
};

window.joinGame = function () {
  const raw = document.getElementById('join-code-input').value.trim();
  let code  = raw;
  try { const u = new URL(raw); code = u.searchParams.get('join') || raw; } catch {}
  if (!code) return;
  _role = 'guest';
  _code = code;
  document.getElementById('name-screen-title').textContent = "You're joining!";
  document.getElementById('name-screen-sub').textContent   = 'Enter your name to continue';
  document.getElementById('name-input').placeholder        = 'Your name';
  getUI().showScreen('name-screen');
};

// ── Name screen ────────────────────────────────────────────────────
window.submitName = function () {
  const name = document.getElementById('name-input').value.trim();

  if (_role === 'host') {
    const sess = new HostSession(getUI(), name || 'Host');
    session    = sess;
    getUI().setHost(true);
    getUI().showScreen('game-screen');
    sess.start(new Peer());

  } else {
    const sess = new GuestSession(getUI(), name || 'Guest');
    session    = sess;
    getUI().setHost(false);
    getUI().showScreen('connecting-screen');
    sess.connect(new Peer(), _code);
  }
};

// ── Game screen ────────────────────────────────────────────────────
window.cellClick     = i    => session?.handleCellClick(i);
window.requestReplay = ()   => session?.requestReplay();

window.sendChat = function () {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  session?.sendChat(text);
};

window.copyGameLink  = function (btn) {
  const code = document.getElementById('game-room-code').textContent;
  if (!code || code === 'Generating…') return;
  const link = location.origin + location.pathname + '?join=' + code;
  navigator.clipboard.writeText(link).then(() => getUI().flash(btn, 'Copied!'));
};

// ── Auto-fill join code from URL ───────────────────────────────────
(function () {
  const code = new URLSearchParams(location.search).get('join');
  if (!code) return;
  document.getElementById('join-code-input').value = code;
  document.getElementById('join-area').classList.remove('hidden');
})();