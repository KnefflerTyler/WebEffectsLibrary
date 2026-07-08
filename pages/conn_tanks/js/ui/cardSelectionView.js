import { getCardData } from '../managers/CardManager.js';

export class CardSelectionView {
  constructor(element, onSelect = () => {}) {
    this.element = element;
    this.onSelect = onSelect;
    this.renderKey = '';
  }

  update(game = {}, localPlayerId = null) {
    const visible = game.phase === 'cardSelection';
    this.element.classList.toggle('hidden', !visible);
    if (!visible) {
      this.renderKey = '';
      return;
    }

    const offer = game.cardState?.offers?.[localPlayerId] ?? [];
    const hand = game.cardState?.hands?.[localPlayerId] ?? [];
    const renderKey = JSON.stringify([localPlayerId, offer, hand]);
    if (renderKey === this.renderKey) return;
    this.renderKey = renderKey;

    const definitions = new Map(getCardData().map(card => [card.id, card]));
    const stackCounts = countCards(hand);
    const waiting = !offer.length;
    const cards = offer.map(id => definitions.get(id)).filter(Boolean).map(card => {
      const button = document.createElement('button');
      button.className = 'selection-card';
      button.type = 'button';

      const image = document.createElement('img');
      image.src = card.image;
      image.alt = '';
      const name = document.createElement('strong');
      name.textContent = card.name;
      const description = document.createElement('span');
      description.textContent = card.description;
      const owned = document.createElement('small');
      const count = stackCounts.get(card.id) ?? 0;
      owned.className = 'card-stack-count';
      owned.textContent = count ? `Owned ×${count}` : 'New';
      button.append(image, name, description, owned);
      button.addEventListener('click', () => {
        this.disable();
        this.onSelect(card.id);
      });
      return button;
    });

    this.element.querySelector('.card-selection-title').textContent = waiting
      ? 'Waiting for other players…'
      : 'Choose a card';
    this.element.querySelector('.card-options').replaceChildren(...cards);
    const handCards = [...stackCounts].map(([id, count]) => {
      const card = definitions.get(id);
      if (!card) return null;
      const item = document.createElement('span');
      item.className = 'hand-card';
      item.textContent = `${card.name} ×${count}`;
      item.title = card.description;
      return item;
    }).filter(Boolean);
    this.element.querySelector('.card-hand').replaceChildren(...handCards);
  }

  disable() {
    for (const button of this.element.querySelectorAll('button')) button.disabled = true;
  }
}

function countCards(hand) {
  const counts = new Map();
  for (const id of hand) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export default CardSelectionView;
