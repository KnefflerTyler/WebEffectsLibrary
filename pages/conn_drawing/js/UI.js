/**
 * Owns all UI outside the canvas: lobby steps, app open/close,
 * toast notifications, peer-count badge, and clipboard copy.
 */
export class UI {
  constructor() {
    this._lobby    = document.getElementById('lobby');
    this._app      = document.getElementById('app');
    this._peerCount = document.getElementById('peer-count');
    this._toast    = document.getElementById('toast');
    this._toastTimer = null;
  }

  // ── Lobby ─────────────────────────────────────────────────────────────

  /** Activate a lobby step by element id, deactivating all others. */
  showStep(id) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }

  /** Hide the lobby and reveal the drawing app. */
  openApp(role) {
    this._lobby.style.display = 'none';
    this._app.classList.add('active');
    document.getElementById('role-badge').textContent =
      role === 'host' ? '👑 Host' : '🖌 Guest';
  }

  /** Restore the lobby (on fatal error). */
  closeLobby() {
    this._lobby.style.display = '';
    this._app.classList.remove('active');
  }

  // ── Peer count badge ──────────────────────────────────────────────────

  /**
   * @param {boolean} isHost
   * @param {number}  count   – number of open connections
   */
  updatePeerCount(isHost, count) {
    if (isHost) {
      this._peerCount.textContent =
        count === 0
          ? 'No guests connected'
          : `${count} guest${count > 1 ? 's' : ''} connected`;
    } else {
      this._peerCount.textContent =
        count > 0 ? '🟢 Connected to host' : '🔴 Disconnected';
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────

  showToast(msg) {
    this._toast.textContent = msg;
    this._toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(
      () => this._toast.classList.remove('show'),
      2800
    );
  }

  // ── Room code copy ────────────────────────────────────────────────────

  copyRoomCode(btnEl) {
    const code = document.getElementById('room-code-display').textContent;
    navigator.clipboard.writeText(code).then(() => {
      btnEl.textContent = 'Copied!';
      setTimeout(() => (btnEl.textContent = 'Copy'), 1500);
    });
  }
}
