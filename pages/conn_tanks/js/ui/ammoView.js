export class AmmoView {
  constructor(element) {
    this.element = element;
    this.indicators = new Map();
  }

  update(players = []) {
    const activeIds = new Set(players.map(player => player.id));
    for (const [id, indicator] of this.indicators) {
      if (activeIds.has(id)) continue;
      indicator.remove();
      this.indicators.delete(id);
    }

    for (const player of players) {
      let indicator = this.indicators.get(player.id);
      if (!indicator) {
        indicator = createIndicator();
        this.indicators.set(player.id, indicator);
        this.element.append(indicator);
      }
      updateIndicator(indicator, player);
    }
  }
}

function createIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'tank-ammo';
  const ammoRow = document.createElement('span');
  ammoRow.className = 'tank-ammo-row';
  const dots = document.createElement('span');
  dots.className = 'tank-ammo-dots';
  const reload = document.createElement('span');
  reload.className = 'tank-reload';
  reload.append(document.createElement('span'));
  ammoRow.append(dots, reload);
  const health = document.createElement('span');
  health.className = 'tank-health';
  health.append(document.createElement('span'));
  indicator.append(ammoRow, health);
  return indicator;
}

function updateIndicator(indicator, player) {
  indicator.style.left = `${player.x * 100}%`;
  indicator.style.top = `${player.y * 100}%`;
  indicator.style.setProperty('--player-color', player.color || '#ffffff');
  indicator.classList.toggle('depleted', player.lives <= 0);

  const health = indicator.querySelector('.tank-health');
  const maxHealth = Math.max(1, Number(player.maxHealth) || 100);
  const healthRatio = Math.max(0, Math.min(1, (Number(player.lives) || 0) / maxHealth));
  health.style.setProperty('--health-progress', `${healthRatio * 100}%`);
  health.style.setProperty(
    '--health-color',
    healthRatio > 0.5 ? '#71d99b' : healthRatio > 0.25 ? '#f4c86b' : '#ef7d9a'
  );

  const dots = indicator.querySelector('.tank-ammo-dots');
  const maxAmmo = Math.max(1, Math.floor(Number(player.maxAmmo) || 1));
  const ammo = Math.max(0, Math.floor(Number(player.ammo) || 0));
  if (dots.children.length !== maxAmmo) {
    dots.replaceChildren(...Array.from({ length: maxAmmo }, () => document.createElement('i')));
  }
  dots.style.setProperty('--ammo-columns', Math.min(4, maxAmmo));
  [...dots.children].forEach((dot, index) => dot.classList.toggle('filled', index < ammo));

  const reload = indicator.querySelector('.tank-reload');
  const progress = Math.max(0, Math.min(1, Number(player.reloadProgress) || 0));
  reload.style.setProperty('--reload-progress', `${progress * 360}deg`);
  reload.classList.toggle('active', Boolean(player.reloading));
}

export default AmmoView;
