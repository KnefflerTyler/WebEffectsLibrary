const cardDataUrl = new URL('../../assets/data/cards/cards.json', import.meta.url);
let cardDefinitions = [];

export async function loadCardData(source = cardDataUrl) {
  const url = source instanceof URL ? source : new URL(source, cardDataUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load card data: ${url.href}`);
  const data = await response.json();
  cardDefinitions = await Promise.all((Array.isArray(data) ? data : []).map(async card => ({
    id: String(card.id ?? ''),
    name: String(card.name ?? 'Card'),
    description: String(card.description ?? ''),
    image: card.image ? new URL(card.image, url).href : '',
    effects: card.effects && typeof card.effects === 'object' ? card.effects : {},
    behaviors: await Promise.all((Array.isArray(card.behaviors) ? card.behaviors : []).map(async behavior => {
      const moduleUrl = new URL(behavior.module, url);
      const loaded = await import(moduleUrl.href);
      return {
        id: String(behavior.id ?? loaded.default?.id ?? moduleUrl.href),
        module: loaded.default ?? loaded,
        options: behavior.options && typeof behavior.options === 'object' ? behavior.options : {}
      };
    }))
  }))).then(cards => cards.filter(card => card.id));
  return cardDefinitions;
}

export function getCardData() {
  return cardDefinitions;
}

export class CardManager {
  constructor() {
    this.hands = {};
    this.offers = {};
  }

  reset(playerIds = []) {
    this.hands = Object.fromEntries(playerIds.map(id => [id, []]));
    this.offers = {};
  }

  ensurePlayer(id) {
    if (!Array.isArray(this.hands[id])) this.hands[id] = [];
  }

  removePlayer(id) {
    delete this.hands[id];
    delete this.offers[id];
  }

  createOffers(playerIds, count = 3) {
    this.offers = {};
    for (const id of playerIds) this.createOffer(id, count);
    return this.offers;
  }

  createOffer(playerId, count = 3) {
    this.ensurePlayer(playerId);
    this.offers[playerId] = shuffle(getCardData()).slice(0, Math.min(count, getCardData().length));
    return this.offers[playerId];
  }

  select(playerId, cardId) {
    const offered = this.offers[playerId];
    if (!offered?.includes(cardId)) return false;
    this.ensurePlayer(playerId);
    this.hands[playerId].push(cardId);
    delete this.offers[playerId];
    return true;
  }

  get allSelected() {
    return Object.keys(this.offers).length === 0;
  }

  getModifiers(playerId) {
    const cards = new Map(getCardData().map(card => [card.id, card]));
    const modifiers = {
      tank: {
        moveSpeed: 1,
        rotationSpeed: 1,
        aimSpeed: 1,
        reloadSpeed: 1,
        maxHealthAdd: 0,
        maxAmmoAdd: 0
      },
      projectile: {
        speed: 1,
        size: 1,
        ttl: 1,
        damage: 1,
        additionalProjectiles: 0,
        spread: 0,
        automatic: false,
        fireInterval: 0.11,
        ownerImmune: false,
        collideProjectiles: true
      },
      behaviors: []
    };
    for (const id of this.hands[playerId] ?? []) {
      const effects = cards.get(id)?.effects ?? {};
      multiplyEffects(modifiers.tank, effects.tank, [
        'moveSpeed', 'rotationSpeed', 'aimSpeed', 'reloadSpeed'
      ]);
      multiplyEffects(modifiers.projectile, effects.projectile, [
        'speed', 'size', 'ttl', 'damage'
      ]);
      addEffects(modifiers.tank, effects.tank, ['maxHealthAdd', 'maxAmmoAdd']);
      for (const behavior of cards.get(id)?.behaviors ?? []) {
        behavior.module.apply?.(modifiers, behavior.options);
        modifiers.behaviors.push(behavior);
      }
    }
    return modifiers;
  }

  serialize() {
    return {
      hands: Object.fromEntries(Object.entries(this.hands).map(([id, hand]) => [id, [...hand]])),
      offers: Object.fromEntries(Object.entries(this.offers).map(([id, offers]) => [id, [...offers]]))
    };
  }

  applyState({ hands, offers } = {}) {
    this.hands = normalizeCardMap(hands);
    this.offers = normalizeCardMap(offers);
  }
}

function multiplyEffects(target, effects, keys) {
  if (!effects || typeof effects !== 'object') return;
  for (const key of keys) {
    const value = Number(effects[key]);
    if (Number.isFinite(value) && value > 0) target[key] *= value;
  }
}

function addEffects(target, effects, keys) {
  if (!effects || typeof effects !== 'object') return;
  for (const key of keys) {
    const value = Number(effects[key]);
    if (Number.isFinite(value)) target[key] += value;
  }
}

function normalizeCardMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([id, cards]) => [
    id,
    Array.isArray(cards) ? cards.map(String) : []
  ]));
}

function shuffle(values) {
  const result = [...values.map(value => value.id)];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export default CardManager;
