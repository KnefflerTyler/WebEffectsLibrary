import CardSelectionView from './cardSelectionView.js';
import AmmoView from './ammoView.js';

export class GameUI {
  constructor({ onHost, onJoin, onStartGame, onSelectCard, onEndRound, onExit } = {}) {
    this.elements = {
      menu: document.getElementById('menu'),
      hud: document.getElementById('hud'),
      hudToggle: document.getElementById('hud-toggle'),
      screenBorder: document.getElementById('screen-border'),
      menuStatus: document.getElementById('menu-status'),
      roomCode: document.getElementById('room-code'),
      connectionStatus: document.getElementById('connection-status'),
      playerName: document.getElementById('player-name'),
      winsStatus: document.getElementById('wins-status'),
      endRound: document.getElementById('end-round'),
      hostControls: document.getElementById('host-controls'),
      levelList: document.getElementById('level-list'),
      winsRequired: document.getElementById('wins-required'),
      startGame: document.getElementById('start-game'),
      hostStatus: document.getElementById('host-status'),
      matchBanner: document.getElementById('match-banner'),
      loadingScreen: document.getElementById('loading-screen'),
      loadingPlayers: document.getElementById('loading-players')
    };
    this.cardSelection = new CardSelectionView(
      document.getElementById('card-selection'),
      cardId => onSelectCard?.(cardId)
    );
    this.ammoView = new AmmoView(document.getElementById('tank-ammo-layer'));

    document.getElementById('host-button').addEventListener('click', () => {
      this.setMenuStatus('Creating room…');
      document.getElementById('host-button').disabled = true;
      onHost?.(this.playerName, null);
    });
    this.elements.roomCode.addEventListener('click', () => this.copyRoomLink());
    this.elements.hudToggle.addEventListener('click', () => this.toggleHud());
    this.elements.endRound.addEventListener('click', () => onEndRound?.());
    document.getElementById('exit-game').addEventListener('click', () => onExit?.());
    this.elements.startGame.addEventListener('click', async () => {
      const levels = this.selectedLevels;
      if (!levels.length) {
        this.elements.hostStatus.textContent = 'Select at least one level.';
        return;
      }
      this.elements.startGame.disabled = true;
      try {
        await onStartGame?.(levels, this.requiredWins);
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
    } else {
      const savedHost = readSavedHost();
      if (savedHost) {
        this.elements.playerName.value = savedHost.name;
        document.getElementById('host-button').disabled = true;
        this.setMenuStatus('Restoring lobby…');
        onHost?.(savedHost.name, savedHost.roomCode);
      }
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

  get requiredWins() {
    return Math.max(1, Math.min(20, Math.floor(Number(this.elements.winsRequired.value) || 3)));
  }

  updateMatchState(game, players = [], localId = null) {
    const phase = game?.phase ?? 'lobby';
    this.cardSelection.update(game, localId);
    this.updateLoadingPlayers(game, players);
    this.setLoading(phase === 'loading' || phase === 'gameOver');
    this.elements.endRound.classList.toggle('hidden', this.role !== 'host' || phase !== 'playing');
    this.elements.hostControls.classList.toggle('hidden', this.role !== 'host' || phase !== 'lobby');
    if (phase === 'lobby') {
      this.elements.hostStatus.textContent = 'Select one or more levels. Rounds will cycle through them.';
    }
    const wins = game?.roundWins?.[localId] ?? 0;
    this.elements.winsStatus.textContent = `Wins: ${wins}/${game?.winsRequired ?? 3}`;
    if (phase === 'gameOver') {
      const winner = players.find(player => player.id === game.winnerId);
      const winnerName = winner?.name || 'Player';
      this.elements.matchBanner.textContent = game.matchWinnerId
        ? `${winnerName} wins the match!`
        : winner
          ? `${winnerName} wins round ${game.roundNumber ?? 1}!`
          : `Round ${game.roundNumber ?? 1} draw`;
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

  setLoading(loading) {
    this.elements.loadingScreen.classList.toggle('hidden', !loading);
  }

  setScreenWrap(screenWrap) {
    this.elements.screenBorder.classList.toggle('hidden', Boolean(screenWrap));
  }

  updateAmmo(players) {
    this.ammoView.update(players);
  }

  toggleHud() {
    const collapsed = this.elements.hud.classList.toggle('collapsed');
    this.elements.hudToggle.textContent = collapsed ? '▼' : '▲';
    this.elements.hudToggle.setAttribute('aria-expanded', String(!collapsed));
    this.elements.hudToggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand header controls' : 'Collapse header controls'
    );
  }

  updateLoadingPlayers(game = {}, players = []) {
    const winsRequired = Math.max(1, Math.floor(Number(game.winsRequired) || 3));
    const scores = game.roundWins ?? {};
    const rows = players.map(player => {
      const wins = Math.max(0, Math.floor(Number(scores[player.id]) || 0));
      const row = document.createElement('div');
      row.className = 'loading-player';
      if (player.id === game.matchWinnerId) row.classList.add('winner');

      const icon = document.createElement('span');
      icon.className = 'loading-player-icon';
      icon.style.setProperty('--player-color', player.color || '#ffffff');

      const dots = document.createElement('span');
      dots.className = 'round-dots';
      for (let index = 0; index < winsRequired; index += 1) {
        const dot = document.createElement('span');
        dot.className = `round-dot${index < wins ? ' filled' : ''}`;
        dots.append(dot);
      }

      const name = document.createElement('span');
      name.className = 'loading-player-name';
      name.textContent = player.name || 'Player';
      row.append(icon, dots, name);
      return row;
    });
    this.elements.loadingPlayers.replaceChildren(...rows);
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

function readSavedHost() {
  try {
    const value = JSON.parse(sessionStorage.getItem('connTanksHostLobby'));
    return value?.roomCode && value?.name ? value : null;
  } catch {
    return null;
  }
}

export default GameUI;
