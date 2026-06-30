export class GameUI {
  constructor({ onHost, onJoin, onStartGame } = {}) {
    this.elements = {
      menu: document.getElementById('menu'),
      hud: document.getElementById('hud'),
      menuStatus: document.getElementById('menu-status'),
      roomCode: document.getElementById('room-code'),
      connectionStatus: document.getElementById('connection-status'),
      playerName: document.getElementById('player-name'),
      livesStatus: document.getElementById('lives-status'),
      hostControls: document.getElementById('host-controls'),
      levelList: document.getElementById('level-list'),
      startGame: document.getElementById('start-game'),
      hostStatus: document.getElementById('host-status'),
      matchBanner: document.getElementById('match-banner')
    };

    document.getElementById('host-button').addEventListener('click', () => {
      this.setMenuStatus('Creating room…');
      onHost?.(this.playerName);
    });
    this.elements.roomCode.addEventListener('click', () => this.copyRoomLink());
    this.elements.startGame.addEventListener('click', async () => {
      const levels = this.selectedLevels;
      if (!levels.length) {
        this.elements.hostStatus.textContent = 'Select at least one level.';
        return;
      }
      this.elements.startGame.disabled = true;
      try {
        await onStartGame?.(levels);
      } finally {
        this.elements.startGame.disabled = false;
      }
    });

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
    this.role = role;
    this.elements.hostControls.classList.toggle('hidden', role !== 'host');
  }

  setLevels(levels) {
    this.levels = Array.isArray(levels) ? levels : [];
    this.elements.levelList.replaceChildren(...this.levels.map(level => {
      const label = document.createElement('label');
      label.className = 'level-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.value = level.id;
      label.append(input, document.createTextNode(level.name ?? level.id));
      return label;
    }));
  }

  get selectedLevels() {
    const selected = new Set([...this.elements.levelList.querySelectorAll('input:checked')]
      .map(input => input.value));
    return (this.levels ?? []).filter(level => selected.has(level.id));
  }

  updateMatchState(game, players = [], localId = null) {
    const phase = game?.phase ?? 'lobby';
    this.elements.hostControls.classList.toggle('hidden', this.role !== 'host' || phase !== 'lobby');
    if (phase === 'lobby') {
      this.elements.hostStatus.textContent = 'Select one or more levels. One will be chosen randomly.';
    }
    const localPlayer = players.find(player => player.id === localId);
    this.elements.livesStatus.textContent = `Lives: ${localPlayer?.lives ?? 3}`;
    if (phase === 'gameOver') {
      const winner = players.find(player => player.id === game.winnerId);
      this.elements.matchBanner.textContent = winner
        ? `${winner.name || 'Player'} wins!`
        : 'Game over';
      this.elements.matchBanner.classList.remove('hidden');
    } else {
      this.elements.matchBanner.classList.add('hidden');
    }
  }

  updatePlayerCount(count) {
    this.elements.connectionStatus.textContent =
      `${count} player${count === 1 ? '' : 's'} connected`;
  }

  setHostStatus(message) {
    this.elements.hostStatus.textContent = message;
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
