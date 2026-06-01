// ── State ──────────────────────────────────────────────────────────
let pc = null;
let dc = null;        // RTCDataChannel
let nickname = '';
let isHost = false;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

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

function copyText(id) {
  const el = document.getElementById(id);
  navigator.clipboard.writeText(el.value).then(() => {
    const orig = event.target.textContent;
    event.target.textContent = 'Copied!';
    setTimeout(() => event.target.textContent = orig, 1500);
  });
}

function encodeSD(sd) { return btoa(JSON.stringify(sd)); }
function decodeSD(s)  { return JSON.parse(atob(s.trim())); }

// ── RTCPeerConnection setup ────────────────────────────────────────
function createPC() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = () => {
    // We wait for ICE gathering to complete so the SDP includes all candidates
    // (trickle ICE is skipped for simplicity — works well for LAN / common NAT)
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      appendSys('⚠ Peer disconnected.');
    }
  };
}

function waitForICE(peerConn) {
  return new Promise(resolve => {
    if (peerConn.iceGatheringState === 'complete') { resolve(); return; }
    peerConn.onicegatheringstatechange = () => {
      if (peerConn.iceGatheringState === 'complete') resolve();
    };
    // Fallback timeout so slow STUN doesn't block forever
    setTimeout(resolve, 4000);
  });
}

function bindDataChannel(channel) {
  dc = channel;
  dc.onopen = () => {
    showStep('chat-step');
    appendSys('Connection established — messages are end-to-end between your browsers.');
  };
  dc.onclose   = () => appendSys('Connection closed.');
  dc.onmessage = e => {
    try {
      const { nick, text, ts } = JSON.parse(e.data);
      appendMsg(nick, text, ts, false);
    } catch { /* ignore malformed */ }
  };
}

// ── HOST flow ──────────────────────────────────────────────────────
async function startAsHost() {
  isHost = true;
  createPC();

  // Create data channel before offer
  const channel = pc.createDataChannel('chat', { ordered: true });
  bindDataChannel(channel);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForICE(pc);

  document.getElementById('offer-out').value = encodeSD(pc.localDescription);
  showStep('host-offer-step');
}

async function hostAcceptAnswer() {
  const raw = document.getElementById('answer-in').value.trim();
  if (!raw) { alert('Paste the answer first.'); return; }
  try {
    const answer = decodeSD(raw);
    await pc.setRemoteDescription(answer);
  } catch (err) {
    alert('Invalid answer — make sure you copied it exactly.\n\n' + err.message);
  }
}

// ── GUEST flow ─────────────────────────────────────────────────────
async function startAsGuest() {
  isHost = false;
  createPC();
  pc.ondatachannel = e => bindDataChannel(e.channel);
  showStep('guest-offer-step');
}

async function guestProcessOffer() {
  const raw = document.getElementById('offer-in').value.trim();
  if (!raw) { alert('Paste the offer first.'); return; }
  try {
    const offer = decodeSD(raw);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForICE(pc);

    document.getElementById('answer-out').value = encodeSD(pc.localDescription);
    document.getElementById('guest-answer-card').style.display = '';
  } catch (err) {
    alert('Invalid offer — make sure you copied it exactly.\n\n' + err.message);
  }
}

// ── Chat ───────────────────────────────────────────────────────────
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !dc || dc.readyState !== 'open') return;
  const ts = Date.now();
  dc.send(JSON.stringify({ nick: nickname, text, ts }));
  appendMsg(nickname, text, ts, true);
  input.value = '';
}

function appendMsg(nick, text, ts, isMe) {
  const box = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg ' + (isMe ? 'me' : 'them');
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // Sanitise display — no innerHTML from user content
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
