// ─────────────────────────────────────────────────────────────────────────────
// Connected Mice
//
// Architecture:
//   - Each peer OWNS their own mouse data. They send it upstream to the host.
//   - Host redistributes a full state snapshot to all guests at ~20 Hz.
//   - Guests only send their own position; they never relay others.
//   - All position data is normalised to [0,1] range (relative to screen size).
//   - Connections use unreliable channels (reliable:false) for low latency.
// ─────────────────────────────────────────────────────────────────────────────

const SEND_HZ   = 20;                        // mouse send rate
const BCAST_HZ  = 20;                        // host broadcast rate
const TAIL_LEN  = 12;                        // cursor trail length
const CURSOR_R  = 9;                         // cursor dot radius
const FADE_MS   = 1200;                      // ms before a cursor fades

// ── Palette — stable colours per peer ID ──────────────────────────────────
const PALETTE = [
  '#f87171','#fb923c','#facc15','#4ade80',
  '#34d399','#38bdf8','#818cf8','#e879f9',
  '#f472b6','#a3e635','#2dd4bf','#60a5fa',
];
function peerColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── State ─────────────────────────────────────────────────────────────────
let peer   = null;
let role   = null;    // 'host' | 'guest'
let myId   = '';
let myName = '';

// Host: map of peerId -> DataConnection (unreliable)
const guestConns = new Map();

// Guest: single unreliable connection to host
let hostConn = null;

// Shared cursor state: peerId -> { nx, ny, name, color, tail, lastSeen }
const cursors = new Map();

// Own mouse (normalised)
let myNX = -1, myNY = -1;

// ── Canvas ────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Mouse tracking ────────────────────────────────────────────────────────
window.addEventListener('mousemove', e => {
  myNX = e.clientX / window.innerWidth;
  myNY = e.clientY / window.innerHeight;
  updateOwnCursor();
});

function updateOwnCursor() {
  if (!myId) return;
  let c = cursors.get(myId);
  if (!c) {
    c = { nx: myNX, ny: myNY, name: myName || 'You', color: peerColor(myId), tail: [], lastSeen: Date.now() };
    cursors.set(myId, c);
  }
  c.tail.push({ nx: myNX, ny: myNY });
  if (c.tail.length > TAIL_LEN) c.tail.shift();
  c.nx = myNX;
  c.ny = myNY;
  c.lastSeen = Date.now();
}

// ── Screens ───────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  if (id) document.getElementById(id).classList.add('active');
}

function showJoin() {
  role = 'guest';
  showScreen('join-screen');
}

function showCanvas() {
  showScreen(null);
  canvas.classList.add('active');
  document.getElementById('hud').classList.remove('hidden');
}

// ── HUD ───────────────────────────────────────────────────────────────────
function setHud(code, roleLabel) {
  const val = document.getElementById('hud-code-val');
  val.textContent = code;
  document.getElementById('hud-role').textContent = roleLabel;
  document.getElementById('hud-code').onclick = () => {
    navigator.clipboard.writeText(code);
    val.textContent = 'Copied!';
    setTimeout(() => { val.textContent = code; }, 1400);
  };
}

function updatePeerCount() {
  document.getElementById('hud-peer-count').textContent =
    role === 'host' ? guestConns.size : (hostConn?.open ? 1 : 0);
}

// ── HOST ──────────────────────────────────────────────────────────────────
function initHost() {
  role = 'host';
  peer = new Peer();

  peer.on('open', id => {
    myId = id;
    myName = 'Host';
    setHud(id, 'host');
    showCanvas();
    startSendLoop();
    startBroadcastLoop();
  });

  peer.on('connection', conn => {
    // Only accept unreliable connections
    conn.on('open', () => {
      guestConns.set(conn.peer, conn);
      updatePeerCount();
      // Send current cursor snapshot so new guest isn't blank
      broadcastState();
    });

    conn.on('data', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'mouse') {
          applyRemoteCursor(msg.id, msg);
        }
      } catch { /* ignore */ }
    });

    conn.on('close', () => {
      guestConns.delete(conn.peer);
      cursors.delete(conn.peer);
      updatePeerCount();
    });

    conn.on('error', () => {
      guestConns.delete(conn.peer);
      cursors.delete(conn.peer);
      updatePeerCount();
    });
  });

  peer.on('error', err => console.warn('PeerJS:', err));
}

// Host sends its own mouse to the shared state (no uplink needed)
function startSendLoop() {
  setInterval(() => updateOwnCursor(), 1000 / SEND_HZ);
}

// Host broadcasts full state snapshot to all guests
function startBroadcastLoop() {
  setInterval(() => broadcastState(), 1000 / BCAST_HZ);
}

function broadcastState() {
  if (guestConns.size === 0) return;
  const snapshot = [];
  for (const [id, c] of cursors.entries()) {
    snapshot.push({ id, nx: c.nx, ny: c.ny, name: c.name, color: c.color });
  }
  const payload = JSON.stringify({ type: 'state', cursors: snapshot });
  for (const conn of guestConns.values()) {
    if (conn.open) conn.send(payload);
  }
}

// ── GUEST ─────────────────────────────────────────────────────────────────
function joinRoom() {
  const code = document.getElementById('join-code').value.trim();
  const name = document.getElementById('join-name').value.trim();
  if (!code) return;
  myName = name || '';

  peer = new Peer();

  peer.on('open', id => {
    myId = id;
    if (!myName) myName = 'Guest ' + id.slice(0, 4);

    // Open single unreliable channel to host
    hostConn = peer.connect(code, {
      label: 'mice',
      reliable: false,
      serialization: 'raw',   // raw string is fine; we JSON.stringify ourselves
    });

    hostConn.on('open', () => {
      setHud(code, 'guest');
      showCanvas();
      updatePeerCount();
      startGuestSendLoop();
    });

    hostConn.on('data', raw => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'state') {
          applyStateSnapshot(msg.cursors);
        }
      } catch { /* ignore */ }
    });

    hostConn.on('close', () => updatePeerCount());
    hostConn.on('error', err => console.warn('hostConn error:', err));
  });

  peer.on('error', err => console.warn('PeerJS:', err));
}

// Guest sends only its own mouse position up to the host
function startGuestSendLoop() {
  setInterval(() => {
    if (!hostConn?.open) return;
    updateOwnCursor();
    const c = cursors.get(myId);
    if (!c) return;
    hostConn.send(JSON.stringify({
      type: 'mouse',
      id: myId,
      nx: c.nx,
      ny: c.ny,
      name: myName,
      color: c.color,
    }));
  }, 1000 / SEND_HZ);
}

// ── Cursor state helpers ──────────────────────────────────────────────────
function applyRemoteCursor(id, data) {
  if (id === myId) return;   // never overwrite own cursor
  let c = cursors.get(id);
  if (!c) {
    c = { nx: data.nx, ny: data.ny, name: data.name || id.slice(0,6),
          color: data.color || peerColor(id), tail: [], lastSeen: Date.now() };
    cursors.set(id, c);
  }
  c.tail.push({ nx: data.nx, ny: data.ny });
  if (c.tail.length > TAIL_LEN) c.tail.shift();
  c.nx = data.nx;
  c.ny = data.ny;
  c.name = data.name || c.name;
  c.lastSeen = Date.now();
}

function applyStateSnapshot(list) {
  for (const entry of list) {
    applyRemoteCursor(entry.id, entry);
  }
}

// ── Render loop ───────────────────────────────────────────────────────────
function render() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const now = Date.now();

  for (const [id, c] of cursors.entries()) {
    const age   = now - c.lastSeen;
    const alpha = id === myId ? 1.0 : Math.max(0, 1 - age / FADE_MS);
    if (alpha <= 0) continue;

    const x = c.nx * W;
    const y = c.ny * H;

    // Trail
    if (c.tail.length > 1) {
      for (let i = 1; i < c.tail.length; i++) {
        const t = i / c.tail.length;
        ctx.beginPath();
        ctx.moveTo(c.tail[i-1].nx * W, c.tail[i-1].ny * H);
        ctx.lineTo(c.tail[i].nx   * W, c.tail[i].ny   * H);
        ctx.strokeStyle = c.color;
        ctx.globalAlpha = alpha * t * 0.45;
        ctx.lineWidth   = 2 + t * 2;
        ctx.lineCap     = 'round';
        ctx.stroke();
      }
    }

    // Dot
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, CURSOR_R, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();

    // Ring for own cursor
    if (id === myId) {
      ctx.beginPath();
      ctx.arc(x, y, CURSOR_R + 4, 0, Math.PI * 2);
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
    }

    // Name label
    ctx.globalAlpha = alpha;
    ctx.font        = '12px system-ui, sans-serif';
    ctx.fillStyle   = c.color;
    ctx.fillText(id === myId ? (c.name + ' (you)') : c.name, x + CURSOR_R + 5, y + 4);
  }

  ctx.globalAlpha = 1;
  requestAnimationFrame(render);
}

requestAnimationFrame(render);