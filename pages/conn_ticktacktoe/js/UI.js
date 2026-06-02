// UI.js — all DOM rendering; no PeerJS, no game logic
export class UI {
  constructor({ onCellClick, onSlotDrop, onKick }) {
    this._onCellClick = onCellClick;
    this._onSlotDrop  = onSlotDrop;
    this._onKick      = onKick;
    this._isHost      = false;
  }

  setHost(v) { this._isHost = v; }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // ── Viewer bar ─────────────────────────────────────────────────
  // peers: [{ id, name, role: 'x'|'o'|'viewer' }]
  renderViewerBar(peers) {
    const bar = document.getElementById('viewer-bar');
    bar.innerHTML = '';
    for (const p of peers) {
      const chip = document.createElement('div');
      chip.className   = 'viewer-chip' + (p.role !== 'viewer' ? ' is-player' : '');
      chip.dataset.pid = p.id;

      const badge = p.role !== 'viewer'
        ? '<span class="chip-role ' + p.role + '">' + p.role.toUpperCase() + '</span>'
        : '';

      const kickBtn = (this._isHost && p.id !== 'host')
        ? '<button class="chip-kick" title="Kick ' + _esc(p.name) + '">&times;</button>'
        : '';

      chip.innerHTML =
        '<span class="chip-avatar">' + p.name[0].toUpperCase() + '</span>' +
        '<span class="chip-name">'   + _esc(p.name)             + '</span>' +
        badge +
        kickBtn;

      if (this._isHost) {
        if (p.id !== 'host') {
          chip.querySelector('.chip-kick').addEventListener('click', e => {
            e.stopPropagation();
            this._onKick(p.id);
          });
        }
        chip.draggable = (p.id !== 'host');
        if (p.id !== 'host') {
          chip.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', p.id);
            chip.classList.add('dragging');
          });
          chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
        }
      }
      bar.appendChild(chip);
    }
  }

  // ── Player slots ───────────────────────────────────────────────
  // peers: same array; scores: { x, o }
  renderPlayerSlots(peers, scores) {
    const xPeer = peers.find(p => p.role === 'x');
    const oPeer = peers.find(p => p.role === 'o');
    this._renderSlot('slot-x', xPeer, scores?.x ?? 0, 'X');
    this._renderSlot('slot-o', oPeer, scores?.o ?? 0, 'O');
  }

  _renderSlot(slotId, peer, score, mark) {
    const el = document.getElementById(slotId);
    el.innerHTML = peer
      ? '<div class="slot-mark ' + mark + '">' + mark + '</div>' +
        '<div class="slot-name">'  + _esc(peer.name) + '</div>' +
        '<div class="slot-score">' + score           + '</div>'
      : '<div class="slot-mark empty">?</div>' +
        '<div class="slot-name empty-slot">Empty</div>' +
        '<div class="slot-score">0</div>';

    // Reset drag listeners
    el.ondragover  = null;
    el.ondragleave = null;
    el.ondrop      = null;

    if (this._isHost) {
      el.ondragover  = e => { e.preventDefault(); el.classList.add('drag-over'); };
      el.ondragleave = ()=> el.classList.remove('drag-over');
      el.ondrop      = e => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const pid = e.dataTransfer.getData('text/plain');
        this._onSlotDrop(pid, mark.toLowerCase());
      };
    }
  }

  // ── Board ──────────────────────────────────────────────────────
  renderBoard(board, winLine, myMark, over) {
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, i) => {
      const mark     = board[i];
      cell.textContent = mark ?? '';
      cell.className   = 'cell' + (mark ? ' taken ' + mark : '') +
                         (winLine?.includes(i) ? ' win' : '');
    });
  }

  // ── Turn banner ────────────────────────────────────────────────
  updateBanner(turn, myMark, over) {
    const banner = document.getElementById('turn-banner');
    if (over || !myMark) {
      banner.textContent = '';
      banner.classList.remove('your-turn');
      return;
    }
    const isMyTurn = myMark.toUpperCase() === turn;
    banner.textContent = isMyTurn ? 'Your turn' : "Opponent's turn";
    banner.classList.toggle('your-turn', isMyTurn);
  }

  // ── Result overlay ─────────────────────────────────────────────
  showResult(winner, myMark) {
    const overlay = document.getElementById('result-overlay');
    const text    = document.getElementById('result-text');
    document.getElementById('replay-btn').disabled       = false;
    document.getElementById('replay-status').textContent = '';

    if (winner === 'draw') {
      text.textContent = "It's a draw!";
    } else {
      const winnerIsMe = myMark && winner === myMark.toUpperCase();
      text.textContent = winnerIsMe ? 'You win! 🎉' : 'You lost.';
    }
    overlay.classList.remove('hidden');
  }

  hideResult() {
    document.getElementById('result-overlay').classList.add('hidden');
    document.getElementById('replay-btn').disabled       = false;
    document.getElementById('replay-status').textContent = '';
  }

  flash(btn, label) {
    const orig = btn.textContent;
    btn.textContent = label;
    setTimeout(() => btn.textContent = orig, 1500);
  }

  // ── Chat log ────────────────────────────────────────────────────
  /** Append a system/connection event line */
  appendEvent(text) {
    this._appendLine('event', null, text);
  }

  /** Append a chat message. isMine=true colours the sender name in accent. */
  appendChat(senderName, text, isMine) {
    this._appendLine(isMine ? 'mine' : 'theirs', senderName, text);
  }

  _appendLine(type, sender, text) {
    const log = document.getElementById('chat-log');
    if (!log) return;
    const row = document.createElement('div');
    row.className = 'chat-msg ' + type;
    if (sender) {
      row.innerHTML =
        '<span class="chat-sender">' + _esc(sender) + ':</span>' +
        '<span class="chat-text">'   + _esc(text)   + '</span>';
    } else {
      row.textContent = text;
    }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
}

function _esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}