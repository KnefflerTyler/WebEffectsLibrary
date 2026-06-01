// ── State ──────────────────────────────────────────────────────────
let peer = null;
let conn = null;
let nickname = '';

// ── Nickname ───────────────────────────────────────────────────────
function setNickname() {
  const val = document.getElementById('nickname-input').value.trim();
  if (!val) return;
  nickname = val;
  document.getElementById('nickname-overlay').classList.add('hidden');
}
document.getElementById('nickname-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') setNickname();
});

// ── Helpers ────────────────────────────────────────────────────────
function showStep(id) {
  document.querySelectorAll('.step, #chat-step').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── PeerJS connection binding ──────────────────────────────────────
function bindConn(c) {
  conn = c;
  conn.on('open', () => {
    showStep('chat-step');
    appendSys('Connected — messages travel directly between your browsers.');
  });
  conn.on('data', data => {
    try {
      const { nick, text, ts } = JSON.parse(data);
      appendMsg(nick, text, ts, false);
    } catch { /* ignore malformed */ }
  });
  conn.on('close', () => appendSys('Peer disconnected.'));
  conn.on('error', err => appendSys('Connection error: ' + err.message));
}

// ── HOST flow ──────────────────────────────────────────────────────
function startAsHost() {
  peer = new Peer();

  peer.on('open', id => {
    document.getElementById('room-code-display').textContent = id;
    showStep('host-wait-step');
  });

  peer.on('connection', c => {
    bindConn(c);
  });

  peer.on('error', err => {
    alert('PeerJS error: ' + err.message);
    showStep('role-step');
  });
}

function copyRoomCode(event) {
  const code = document.getElementById('room-code-display').textContent;
  const btn = event.currentTarget;
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

// ── GUEST flow ─────────────────────────────────────────────────────
function joinRoom() {
  const code = document.getElementById('join-code-input').value.trim();
  if (!code) { alert('Enter a room code first.'); return; }

  document.getElementById('guest-status').style.display = '';

  peer = new Peer();

  peer.on('open', () => {
    const c = peer.connect(code, { reliable: true });
    bindConn(c);
  });

  peer.on('error', err => {
    document.getElementById('guest-status').style.display = 'none';
    alert('Could not connect: ' + err.message);
  });
}

// ── Chat ───────────────────────────────────────────────────────────
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !conn || !conn.open) return;
  const ts = Date.now();
  conn.send(JSON.stringify({ nick: nickname, text, ts }));
  appendMsg(nickname, text, ts, true);
  input.value = '';
}

function appendMsg(nick, text, ts, isMe) {
  const box = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg ' + (isMe ? 'me' : 'them');
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const nickNode = document.createElement('div');
  const textNode = document.createElement('div');
  const metaNode = document.createElement('div');
  nickNode.style.cssText = 'font-size:11px;opacity:0.55;margin-bottom:2px;';
  metaNode.className = 'meta';
  nickNode.textContent = nick;
  textNode.textContent = text;
  metaNode.textContent = time;
  div.append(nickNode, textNode, metaNode);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function appendSys(text) {
  const box = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'sys-msg';
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}