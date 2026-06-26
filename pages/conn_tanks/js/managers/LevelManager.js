// #region Imports
import Sprite from '../objects/sprites/sprite.js';
// #endregion

// #region Constants
const levelBaseUrl = new URL('../../assets/data/level/', import.meta.url);
// #endregion

export class LevelManager {
  // #region Lifecycle
  constructor() {
    this.currentLevel = null;
    this.objects = [];
    this.sprites = [];
    this.spawns = [];
  }
  // #endregion

  // #region Loading
  async loadLevel(level) {
    this.unloadLevel();

    const url = this.resolveLevelUrl(level);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load level: ${url.href}`);

    return this.loadLevelData(await response.json(), url);
  }

  async loadLevelData(data, source = levelBaseUrl) {
    this.unloadLevel();

    const url = source instanceof URL ? source : new URL(String(source || ''), levelBaseUrl);
    this.currentLevel = {
      id: data.id ?? '',
      name: data.name ?? '',
      source: url.href,
      data
    };
    this.spawns = this.normalizeSpawns(data.spawns);
    this.objects = await Promise.all(
      (Array.isArray(data.objects) ? data.objects : []).map(object => this.createObject(object, url))
    );
    this.objects = this.objects.filter(Boolean);
    this.sprites = this.objects.filter(object => object instanceof Sprite);
    return this.currentLevel;
  }

  unloadLevel() {
    this.currentLevel = null;
    this.objects = [];
    this.sprites = [];
    this.spawns = [];
  }
  // #endregion

  // #region Spawns
  getSpawnLocations() {
    return this.spawns.map(spawn => ({ ...spawn }));
  }

  getSpawnLocation(index = 0) {
    if (!this.spawns.length) return null;
    return { ...this.spawns[Math.abs(index) % this.spawns.length] };
  }

  getLevelData() {
    return this.currentLevel?.data ?? null;
  }

  normalizeSpawns(spawns) {
    return (Array.isArray(spawns) ? spawns : [])
      .map((spawn, index) => ({
        id: spawn.id ?? `spawn-${index + 1}`,
        x: clamp01(spawn.x),
        y: clamp01(spawn.y),
        rotation: Number(spawn.rotation) || 0
      }));
  }
  // #endregion

  // #region Object Creation
  async createObject(data, levelUrl) {
    if (data?.type === 'sprite') return this.createSprite(data, levelUrl);
    return null;
  }

  async createSprite(data, levelUrl) {
    const sprite = new Sprite({
      id: data.id ?? '',
      name: data.name ?? '',
      x: data.x ?? 0.5,
      y: data.y ?? 0.5,
      rotation: data.rotation ?? 0,
      width: data.width ?? 48,
      height: data.height ?? 48,
      originOffsetX: data.originOffsetX ?? 0,
      originOffsetY: data.originOffsetY ?? 0,
      color: data.color ?? '#ffffff',
      image: data.image ? await this.loadImage(data.image, levelUrl) : null,
      sheetCols: data.sheetCols ?? 1,
      sheetRows: data.sheetRows ?? 1,
      collider: data.collider ?? null
    });

    for (const animation of Array.isArray(data.animations) ? data.animations : []) {
      sprite.addAnimation(animation);
    }
    if (data.animation) sprite.setAnimation(data.animation);

    return sprite;
  }
  // #endregion

  // #region Update
  update(dt) {
    for (const object of this.objects) object.update?.(dt);
  }
  // #endregion

  // #region Helpers
  resolveLevelUrl(level) {
    if (level instanceof URL) return level;
    const value = String(level || 'default');
    const fileName = /\.[a-z0-9]+$/i.test(value) ? value : `${value}.level.json`;
    return new URL(fileName, levelBaseUrl);
  }

  async loadImage(path, levelUrl) {
    const image = new Image();
    image.src = new URL(path, levelUrl).href;
    if (image.decode) {
      await image.decode();
      return image;
    }
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    return image;
  }
  // #endregion
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export default LevelManager;
