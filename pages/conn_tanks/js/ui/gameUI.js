export class GameUI {
  constructor({ onHost, onJoin } = {}) {
    this.elements = {
      menu: document.getElementById('menu'),
      hud: document.getElementById('hud'),
      menuStatus: document.getElementById('menu-status'),
      roomCode: document.getElementById('room-code'),
      connectionStatus: document.getElementById('connection-status'),
      playerName: document.getElementById('player-name'),
      joinControls: document.getElementById('join-controls'),
      roomCodeInput: document.getElementById('room-code-input')
    };

    document.getElementById('host-button').addEventListener('click', () => {
      this.setMenuStatus('Creating room…');
      onHost?.(this.playerName);
    });
    document.getElementById('show-join-button').addEventListener('click', () => this.showJoin());
    document.getElementById('join-button').addEventListener('click', () => {
      const roomCode = this.parseRoomCode(this.elements.roomCodeInput.value.trim());
      if (!roomCode) return;
      this.setMenuStatus('Connecting…');
      onJoin?.(roomCode, this.playerName);
    });
    this.elements.roomCode.addEventListener('click', () => this.copyRoomLink());

    const joinCode = new URLSearchParams(location.search).get('join');
    if (joinCode) this.showJoin(joinCode);
  }

  get playerName() {
    return this.elements.playerName.value.trim() || 'Player';
  }

  showJoin(roomCode = '') {
    this.elements.joinControls.classList.remove('hidden');
    this.elements.roomCodeInput.value = roomCode;
    this.elements.roomCodeInput.focus();
  }

  showGame(code) {
    this.elements.menu.classList.add('hidden');
    this.elements.hud.classList.remove('hidden');
    this.elements.roomCode.textContent = `Room: ${code.slice(0, 10)}…`;
    this.elements.roomCode.dataset.code = code;
  }

  updatePlayerCount(count) {
    this.elements.connectionStatus.textContent =
      `${count} player${count === 1 ? '' : 's'} connected`;
  }

  showDisconnected() {
    this.elements.connectionStatus.textContent = 'Host disconnected';
  }

  setMenuStatus(message) {
    this.elements.menuStatus.textContent = message;
  }

  parseRoomCode(raw) {
    try {
      return new URL(raw).searchParams.get('join') || raw;
    } catch {
      return raw;
    }
  }

  async copyRoomLink() {
    const code = this.elements.roomCode.dataset.code;
    if (!code) return;
    const link = `${location.origin}${location.pathname}?join=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      const oldText = this.elements.roomCode.textContent;
      this.elements.roomCode.textContent = 'Link copied!';
      setTimeout(() => { this.elements.roomCode.textContent = oldText; }, 1200);
    } catch {
      this.elements.roomCode.textContent = 'Copy failed';
    }
  }
}

export default GameUI;
