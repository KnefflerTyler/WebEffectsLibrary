import Sprite from '../objects/sprites/sprite.js';
import LevelCollider from './levelCollider.js';

export class BaseLevel {
  constructor({ data, source = null, objects = [], spawns = data.spawns } = {}) {
    if (!data?.id || !data?.name || typeof data.screenWrap !== 'boolean') {
      throw new TypeError('Level data requires id, name, and screenWrap');
    }

    this.id = data.id;
    this.name = data.name;
    this.source = source instanceof URL ? source.href : source;
    this.data = data;
    this.screenWrap = data.screenWrap;
    this.objects = objects.filter(Boolean);
    this.spawns = normalizeSpawns(spawns);
  }

  get sprites() {
    return this.objects.flatMap(object => object instanceof Sprite
      ? [object]
      : (object.sprites ?? []));
  }

  get colliders() {
    return this.objects.flatMap(object => object instanceof LevelCollider
      ? (object.isDestroyed ? [] : [object])
      : (object.colliders ?? []));
  }

  damageObject(id, amount = 1) {
    const object = this.objects.find(candidate => candidate.id === id);
    return object instanceof LevelCollider ? object.damage(amount) : false;
  }

  serializeObjectState() {
    return this.objects.map(object => object.serializeState?.()).filter(Boolean);
  }

  applyObjectState(states = []) {
    const byId = new Map(states.map(state => [state?.id, state]));
    for (const object of this.objects) {
      const state = byId.get(object.id);
      if (state) object.applyState?.(state);
    }
  }

  getSpawnLocations() {
    return this.spawns.map(spawn => ({ ...spawn }));
  }

  getSpawnLocation(index = 0) {
    if (!this.spawns.length) return null;
    return { ...this.spawns[Math.abs(index) % this.spawns.length] };
  }

  update(dt) {
    for (const object of this.objects) object.update?.(dt);
  }

  destroy() {
    for (const object of this.objects) object.destroy?.();
    this.objects = [];
    this.spawns = [];
  }
}

function normalizeSpawns(spawns) {
  if (!Array.isArray(spawns)) throw new TypeError('Level data requires a spawns array');
  return spawns.map((spawn, index) => ({
    id: spawn.id ?? `spawn-${index + 1}`,
    x: clamp01(spawn.x),
    y: clamp01(spawn.y),
    rotation: Number(spawn.rotation) || 0
  }));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export default BaseLevel;
