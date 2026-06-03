import { DrawingCanvas } from './DrawingCanvas.js';
import { Toolbar }       from './Toolbar.js';
import { HostSession }   from './HostSession.js';
import { GuestSession }  from './GuestSession.js';
import { UI }            from './UI.js';

// ── Singletons ────────────────────────────────────────────────────────
const ui      = new UI();
const appEl   = document.getElementById('app');
const canvasEl = document.getElementById('draw-canvas');

let session = null;   // HostSession | GuestSession
let isHost  = false;

// ── Drawing canvas (wired to session on connection) ───────────────────
const drawingCanvas = new DrawingCanvas(canvasEl, {
  onOp(msg) {
    if (!session) return;
    if (isHost) session.broadcast(msg);
    else        session.send(msg);
  },
});

// ── Toolbar ───────────────────────────────────────────────────────────
const toolbar = new Toolbar(appEl, {
  onToolChange:  name  => drawingCanvas.setTool(name),
  onColorChange: color => drawingCanvas.setColor(color),
  onSizeChange:  size  => drawingCanvas.setSize(size),
  onClear() {
    drawingCanvas.applyOp({ type: 'clear' });
    if (isHost) session?.broadcast({ type: 'clear' });
    else        session?.send({ type: 'clear' });
  },
  onCopy:  () => drawingCanvas.copySelection(),
  onPaste: () => drawingCanvas.pasteClipboard(),
});

// ── HOST flow ─────────────────────────────────────────────────────────
window.startAsHost = async function () {
  isHost  = true;
  session = new HostSession({
    onOp:          msg => drawingCanvas.applyOp(msg),
    onStateRequest: ()  => drawingCanvas.getDataUrl(),
    onGuestJoined() {
      ui.updatePeerCount(true, session.connectionCount);
      ui.showToast('A guest joined the room.');
    },
    onGuestLeft() {
      ui.updatePeerCount(true, session.connectionCount);
      ui.showToast('A guest left the room.');
    },
    onError(msg) {
      ui.showToast('PeerJS error: ' + msg);
      ui.showStep('role-step');
      ui.closeLobby();
    },
  });

  try {
    const roomCode = await session.start();
    document.getElementById('room-code-display').textContent = roomCode;
    ui.showStep('host-wait-step');
    ui.openApp('host');
    ui.updatePeerCount(true, 0);
  } catch {
    // onError already handled
  }
};

// ── GUEST flow ────────────────────────────────────────────────────────
window.showGuestStep = function () { ui.showStep('guest-join-step'); };

window.startAsGuest = async function () {
  const code = document.getElementById('room-code-input').value.trim();
  if (!code) return;

  isHost  = false;
  session = new GuestSession({
    onOp:     msg => drawingCanvas.applyOp(msg),
    onConnected() {
      ui.openApp('guest');
      ui.updatePeerCount(false, 1);
    },
    onDisconnected() {
      ui.updatePeerCount(false, 0);
      ui.showToast('Disconnected from host.');
    },
    onError(msg) {
      ui.showToast('Connection error: ' + msg);
    },
  });

  ui.showStep('guest-connecting-step');
  try {
    await session.connect(code);
  } catch {
    ui.showStep('guest-join-step');
  }
};

window.copyRoomCode = function (e) { ui.copyRoomCode(e.target); };
