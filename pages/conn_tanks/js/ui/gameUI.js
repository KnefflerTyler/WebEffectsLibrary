export class GameUI {
  constructor({ onHost, onJoin } = {}) {
    this.elements = {
      menu: document.getElementById('menu'),
      hud: document.getElementById('hud'),
      menuStatus: document.getElementById('menu-status'),
      roomCode: document.getElementById('room-code'),
      connectionStatus: document.getElementById('connection-status'),
      playerName: document.getElementById('player-name')
    };

    document.getElementById('host-button').addEventListener('click', () => {
      this.setMenuStatus('Creating room…');
      onHost?.(this.playerName);
    });
    this.elements.roomCode.addEventListener('click', () => this.copyRoomLink());

    const inviteCode = new URLSearchParams(location.search).get('join')?.trim();
    if (inviteCode) {
      document.getElementById('host-button').disabled = true;
      this.elements.playerName.disabled = true;
      this.setMenuStatus('Connecting to host…');
      onJoin?.(inviteCode, this.playerName);
    }
  }

  get playerName() {
    return this.elements.playerName.value.trim() || 'Player';
  }

  showGame(code, role) {
    this.elements.menu.classList.add('hidden');
    this.elements.hud.classList.remove('hidden');
    this.elements.roomCode.dataset.code = code;
    this.elements.roomCode.classList.toggle('hidden', role !== 'host');
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

  async copyRoomLink() {
    const code = this.elements.roomCode.dataset.code;
    if (!code) return;
    const link = new URL(location.href);
    link.search = '';
    link.hash = '';
    link.searchParams.set('join', code);
    try {
      await navigator.clipboard.writeText(link.href);
      const oldText = this.elements.roomCode.textContent;
      this.elements.roomCode.textContent = 'Link copied!';
      setTimeout(() => { this.elements.roomCode.textContent = oldText; }, 1200);
    } catch {
      this.elements.roomCode.textContent = 'Copy failed';
    }
  }
}

export default GameUI;
