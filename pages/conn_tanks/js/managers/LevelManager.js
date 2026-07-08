// #region Imports
import Sprite from '../objects/sprites/sprite.js';
import LevelCollider from '../levels/levelCollider.js';
import CaveLevel from '../levels/caveLevel.js';
import BaseLevel from '../levels/baseLevel.js';
import { generateCave } from '../editor/caveGenerator.js';
// #endregion

// #region Constants
const levelBaseUrl = new URL('../../assets/data/level/', import.meta.url);
// #endregion

export class LevelManager {
  // #region Lifecycle
  constructor() {
    this.currentLevel = null;
  }

  get objects() { return this.currentLevel?.objects ?? []; }
  get sprites() { return this.currentLevel?.sprites ?? []; }
  get colliders() { return this.currentLevel?.colliders ?? []; }
  get spawns() { return this.currentLevel?.spawns ?? []; }
  get screenWrap() { return this.currentLevel?.screenWrap ?? false; }
  damageObject(id, amount) { return this.currentLevel?.damageObject(id, amount) ?? false; }
  serializeObjectState() { return this.currentLevel?.serializeObjectState() ?? []; }
  applyObjectState(states) { this.currentLevel?.applyObjectState(states); }
  // #endregion

  // #region Loading
  async loadLevel(level) {
    this.unloadLevel();
    const url = this.resolveLevelUrl(level);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load level: ${url.href}`);
    const definition = await response.json();
    const data = definition.generator === 'cave'
      ? this.generateCaveLevel(definition)
      : definition;
    return this.loadLevelData(data, url);
  }

  generateCaveLevel(definition) {
    const generated = generateCave(definition.options);
    const { spawnPoints, ...caveData } = generated;
    return {
      id: definition.id,
      name: definition.name,
      screenWrap: definition.screenWrap,
      spawns: spawnPoints.map((point, index) => ({
        id: index ? `guest-${index}` : 'host',
        ...point,
        rotation: index * Math.PI / 2
      })),
      objects: [{
        type: 'cave',
        id: 'cave-base',
        ...caveData,
        texture: definition.texture
      }]
    };
  }

  async loadLevelData(data, source = levelBaseUrl) {
    this.unloadLevel();

    const url = source instanceof URL ? source : new URL(String(source || ''), levelBaseUrl);
    const objects = await Promise.all(
      (Array.isArray(data.objects) ? data.objects : []).map(object => this.createObject(object, url))
    );
    this.currentLevel = new BaseLevel({ data, source: url, objects });
    return this.currentLevel;
  }

  unloadLevel() {
    this.currentLevel?.destroy();
    this.currentLevel = null;
  }
  // #endregion

  // #region Spawns
  getSpawnLocations() {
    return this.currentLevel?.getSpawnLocations() ?? [];
  }

  getSpawnLocation(index = 0) {
    return this.currentLevel?.getSpawnLocation(index) ?? null;
  }

  getLevelData() {
    return this.currentLevel?.data ?? null;
  }

  // #endregion

  // #region Object Creation
  async createObject(data, levelUrl) {
    if (data?.type === 'sprite') return this.createSprite(data, levelUrl);
    if (data?.type === 'collider') return new LevelCollider(data);
    if (data?.type === 'cave') return new CaveLevel(data);
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
      wrapWithScreen: data.wrapWithScreen ?? true,
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
    this.currentLevel?.update(dt);
  }
  // #endregion

  // #region Helpers
  resolveLevelUrl(level) {
    if (level instanceof URL) return level;
    if (typeof level !== 'string' || !level.endsWith('.level.json')) {
      throw new TypeError('Level must be a .level.json filename');
    }
    return new URL(level, levelBaseUrl);
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

export default LevelManager;
