import { MATERIAL, MATERIAL_BY_NAME, PIXEL_BY_ID } from './pixel/pixelRegistry.js';
import { loadPixelObjects } from './pixel/objects/objectRegistry.js';
import { runTerrainGenerators } from './terrain-generators/terrainGeneratorRegistry.js';

export { MATERIAL, MATERIAL_BY_NAME } from './pixel/pixelRegistry.js';

export const CELL_FLAGS = Object.freeze({
  STATIC: 1,
  NO_GRAVITY: 2,
});

export class PixelWorld {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.total = width * height;
    this.layers = {
      foreground: this.createLayerState(),
      background: this.createLayerState(),
      backdrop: this.createLayerState(),
    };
    this.activeLayerName = 'foreground';
    this.bindLayer('foreground');
    this.objects = [];
    this.backdropObjects = [];
    this.flagsVersion = 0;
    this.suspendActivation = false;
    this.tick = 1;
    this.clear();
  }

  createLayerState() {
    const dirtyTileSize = 32;
    const dirtyTileColumns = Math.ceil(this.width / dirtyTileSize);
    const dirtyTileRows = Math.ceil(this.height / dirtyTileSize);
    return {
      cells: new Uint8Array(this.total),
      data: new Uint8Array(this.total),
      burnSource: new Uint8Array(this.total),
      tintR: new Uint8Array(this.total),
      tintG: new Uint8Array(this.total),
      tintB: new Uint8Array(this.total),
      shade: new Uint8Array(this.total),
      flags: new Uint8Array(this.total),
      touched: new Uint32Array(this.total),
      activeFlags: new Uint8Array(this.total),
      nextActiveFlags: new Uint8Array(this.total),
      activeList: [],
      nextActiveList: [],
      dirtyTileSize,
      dirtyTileColumns,
      dirtyTileRows,
      dirtyTileFlags: new Uint8Array(dirtyTileColumns * dirtyTileRows),
      dirtyTileList: [],
      fullRenderDirty: true,
    };
  }

  bindLayer(name) {
    const layer = this.layers[name];
    if (!layer) throw new Error(`Unknown pixel layer "${name}".`);
    this.activeLayerName = name;
    for (const key of ['cells', 'data', 'burnSource', 'tintR', 'tintG', 'tintB', 'shade', 'flags', 'touched', 'activeFlags', 'nextActiveFlags', 'activeList', 'nextActiveList']) {
      this[key] = layer[key];
    }
    return layer;
  }

  withLayer(name, fn) {
    const previous = this.activeLayerName;
    this.bindLayer(name);
    try {
      return fn();
    } finally {
      this.bindLayer(previous);
    }
  }

  otherLayerName(name = this.activeLayerName) {
    return name === 'foreground' ? 'background' : 'foreground';
  }

  index(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  randomByte() {
    return Math.floor(Math.random() * 256);
  }

  markRenderDirty(i) {
    if (i < 0 || i >= this.total) return;
    const layer = this.layers[this.activeLayerName];
    if (layer.fullRenderDirty) return;
    const x = i % this.width;
    const y = Math.floor(i / this.width);
    const tileX = Math.floor(x / layer.dirtyTileSize);
    const tileY = Math.floor(y / layer.dirtyTileSize);
    const tile = tileY * layer.dirtyTileColumns + tileX;
    if (layer.dirtyTileFlags[tile]) return;
    layer.dirtyTileFlags[tile] = 1;
    layer.dirtyTileList.push(tile);
  }

  markLayerFullyDirty(layer) {
    layer.fullRenderDirty = true;
    layer.dirtyTileList.length = 0;
    layer.dirtyTileFlags.fill(0);
  }

  consumeRenderDirty(name) {
    const layer = this.layers[name];
    if (layer.fullRenderDirty) {
      layer.fullRenderDirty = false;
      return [{ x: 0, y: 0, width: this.width, height: this.height }];
    }
    if (layer.dirtyTileList.length === 0) return [];
    const regions = layer.dirtyTileList.map((tile) => {
      const tileX = tile % layer.dirtyTileColumns;
      const tileY = Math.floor(tile / layer.dirtyTileColumns);
      const x = tileX * layer.dirtyTileSize;
      const y = tileY * layer.dirtyTileSize;
      layer.dirtyTileFlags[tile] = 0;
      return {
        x,
        y,
        width: Math.min(layer.dirtyTileSize, this.width - x),
        height: Math.min(layer.dirtyTileSize, this.height - y),
      };
    });
    layer.dirtyTileList.length = 0;
    return regions;
  }

  isEmpty(type) {
    return PIXEL_BY_ID[type]?.displaceable ?? false;
  }

  getPixelAtIndex(i) {
    return PIXEL_BY_ID[this.cells[i]];
  }

  isStatic(i) {
    return (this.flags[i] & CELL_FLAGS.STATIC) !== 0;
  }

  addObject(object) {
    object.place(this);
    this.objects.push(object);
    return object;
  }

  addBackdropObject(object) {
    object.placeBackdrop(this);
    this.backdropObjects.push(object);
    return object;
  }

  hasNoGravity(i) {
    return (this.flags[i] & CELL_FLAGS.NO_GRAVITY) !== 0;
  }

  setCell(i, type, value = 0, options = {}) {
    if (this.isStatic(i) && !options.force) return false;

    const pixel = PIXEL_BY_ID[type];
    if (!pixel) throw new Error(`Unknown material id "${type}".`);

    const previousFlags = this.flags[i];
    this.cells[i] = type;
    this.data[i] = pixel.getInitialData(value);
    this.burnSource[i] = type === MATERIAL.FIRE ? (options.burnSource ?? this.burnSource[i]) : 0;
    const tint = pixel.usesCustomColor ? (options.color ?? pixel.color) : pixel.color;
    this.tintR[i] = tint[0];
    this.tintG[i] = tint[1];
    this.tintB[i] = tint[2];
    this.shade[i] = this.randomByte();
    this.flags[i] = options.flags ?? this.flags[i];
    this.markRenderDirty(i);
    if (this.flags[i] !== previousFlags) this.flagsVersion++;
    if (!options.silent) {
      this.touched[i] = this.tick;
      this.markActiveAroundIndex(i);
    }
    return true;
  }

  swapCells(a, b) {
    const cellA = this.cells[a];
    const dataA = this.data[a];
    const shadeA = this.shade[a];
    const burnSourceA = this.burnSource[a];
    const tintRA = this.tintR[a];
    const tintGA = this.tintG[a];
    const tintBA = this.tintB[a];
    const flagsA = this.flags[a];
    this.cells[a] = this.cells[b];
    this.data[a] = this.data[b];
    this.shade[a] = this.shade[b];
    this.burnSource[a] = this.burnSource[b];
    this.tintR[a] = this.tintR[b];
    this.tintG[a] = this.tintG[b];
    this.tintB[a] = this.tintB[b];
    this.flags[a] = this.flags[b];
    this.cells[b] = cellA;
    this.data[b] = dataA;
    this.shade[b] = shadeA;
    this.burnSource[b] = burnSourceA;
    this.tintR[b] = tintRA;
    this.tintG[b] = tintGA;
    this.tintB[b] = tintBA;
    this.flags[b] = flagsA;
    this.touched[a] = this.tick;
    this.touched[b] = this.tick;
    this.markActiveAroundIndex(a);
    this.markActiveAroundIndex(b);
    this.markRenderDirty(a);
    this.markRenderDirty(b);
  }

  moveInto(a, b) {
    this.cells[b] = this.cells[a];
    this.data[b] = this.data[a];
    this.shade[b] = this.shade[a];
    this.burnSource[b] = this.burnSource[a];
    this.tintR[b] = this.tintR[a];
    this.tintG[b] = this.tintG[a];
    this.tintB[b] = this.tintB[a];
    this.flags[b] = this.flags[a];
    this.setCell(a, MATERIAL.SPACE, 0, { force: true, flags: 0 });
    this.touched[a] = this.tick;
    this.touched[b] = this.tick;
    this.markActiveAroundIndex(a);
    this.markActiveAroundIndex(b);
    this.markRenderDirty(a);
    this.markRenderDirty(b);
  }

  tryDisplaceInto(i, x, y, verticalDirection = 0) {
    if (!this.inBounds(x, y)) return false;
    const target = this.index(x, y);
    if (!this.canDisplace(i, target, verticalDirection)) return false;
    this.swapCells(i, target);
    return true;
  }

  canDisplace(source, target, verticalDirection = 0) {
    if (this.isStatic(source) || this.isStatic(target) || this.hasNoGravity(source) || this.hasNoGravity(target)) return false;

    const sourcePixel = this.getPixelAtIndex(source);
    const targetPixel = this.getPixelAtIndex(target);
    if (!targetPixel?.canBeDisplacedBy(sourcePixel)) return false;
    if (sourcePixel.id === targetPixel.id) return false;

    const densityDifference = verticalDirection < 0
      ? targetPixel.density - sourcePixel.density
      : sourcePixel.density - targetPixel.density;
    const requiredDifference = Math.max(sourcePixel.swapBuffer, targetPixel.swapBuffer);
    return densityDifference >= requiredDifference;
  }

  hasNeighborWhere(x, y, predicate) {
    for (let yy = -1; yy <= 1; yy++) {
      for (let xx = -1; xx <= 1; xx++) {
        if (xx === 0 && yy === 0) continue;
        const nx = x + xx;
        const ny = y + yy;
        if (!this.inBounds(nx, ny)) continue;
        const index = this.index(nx, ny);
        if (predicate(this.getPixelAtIndex(index), index, nx, ny)) return true;
      }
    }
    return false;
  }

  hasNeighborWhereAcrossLayers(x, y, predicate) {
    if (this.hasNeighborWhere(x, y, predicate)) return true;
    return this.withLayer(this.otherLayerName(), () => {
      if (this.inBounds(x, y)) {
        const index = this.index(x, y);
        if (predicate(this.getPixelAtIndex(index), index, x, y)) return true;
      }
      return this.hasNeighborWhere(x, y, predicate);
    });
  }

  tryExtinguishNeighbor(source, x, y) {
    if (!this.inBounds(x, y)) return false;
    const target = this.index(x, y);
    const sourcePixel = this.getPixelAtIndex(source);
    const targetPixel = this.getPixelAtIndex(target);
    if (this.isStatic(source)) return false;
    if (!targetPixel.burns || sourcePixel.extinguishPower <= 0) return false;

    if (!this.isStatic(target)) {
      this.setCell(target, MATERIAL.STEAM, 18);
    }
    this.setCell(source, MATERIAL.STEAM, 12);
    this.touched[source] = this.tick;
    this.touched[target] = this.tick;
    return true;
  }

  tryWaterReactWithNeighbor(source, x, y) {
    if (!this.inBounds(x, y) || this.isStatic(source)) return false;

    const target = this.index(x, y);
    const sourcePixel = this.getPixelAtIndex(source);
    const targetPixel = this.getPixelAtIndex(target);
    if (sourcePixel.extinguishPower <= 0) return false;

    if (targetPixel.burns) {
      if (!this.isStatic(target)) {
        this.setCell(target, MATERIAL.STEAM, 18);
      }
      this.setCell(source, MATERIAL.STEAM, 14);
      this.touched[source] = this.tick;
      this.touched[target] = this.tick;
      return true;
    }

    const hydratedMaterial = targetPixel.wetTo ?? targetPixel.mixesWithWaterTo;
    if (hydratedMaterial === null || this.isStatic(target)) return false;

    this.setCell(target, hydratedMaterial);
    this.setCell(source, MATERIAL.SPACE);
    this.touched[source] = this.tick;
    this.touched[target] = this.tick;
    return true;
  }

  tryHydrateFromNeighbors(target, x, y) {
    if (this.isStatic(target)) return false;

    const targetPixel = this.getPixelAtIndex(target);
    const hydratedMaterial = targetPixel.wetTo ?? targetPixel.mixesWithWaterTo;
    if (hydratedMaterial === null) return false;

    let hydrated = false;
    this.forNeighbors(x, y, (n) => {
      if (this.isStatic(n)) return true;
      const neighbor = this.getPixelAtIndex(n);
      if (neighbor.extinguishPower <= 0) return true;

      this.setCell(target, hydratedMaterial);
      this.setCell(n, MATERIAL.SPACE);
      this.touched[target] = this.tick;
      this.touched[n] = this.tick;
      hydrated = true;
      return false;
    });

    return hydrated;
  }

  tryIgniteFromNeighbors(i, x, y) {
    if (this.isStatic(i)) return false;

    const pixel = this.getPixelAtIndex(i);
    if (pixel.flammability <= 0) return false;
    if (!this.hasNeighborWhereAcrossLayers(x, y, (neighbor) => neighbor.burns)) return false;
    if (pixel.oxygen <= 0 && !this.hasNeighborWhereAcrossLayers(x, y, (neighbor) => neighbor.oxygen > 0)) return false;
    if (Math.random() >= pixel.flammability) return false;

    this.setCell(i, MATERIAL.FIRE, pixel.getBurnLife(), { burnSource: pixel.id });
    this.touched[i] = this.tick;
    return true;
  }

  igniteFlammableNeighbors(x, y, heat = 1) {
    const sourceLayer = this.activeLayerName;
    const tryIgnite = (n, nx, ny) => {
      if (this.isStatic(n)) return true;
      const pixel = this.getPixelAtIndex(n);
      if (pixel.oxygen <= 0 && !this.hasNeighborWhereAcrossLayers(nx, ny, (neighbor) => neighbor.oxygen > 0)) return true;
      if (pixel.flammability > 0 && Math.random() < pixel.flammability * heat) {
        this.setCell(n, MATERIAL.FIRE, pixel.getBurnLife(), { burnSource: pixel.id });
        this.touched[n] = this.tick;
      }
      return true;
    };
    this.forNeighbors(x, y, tryIgnite);
    this.withLayer(this.otherLayerName(sourceLayer), () => {
      if (this.inBounds(x, y)) tryIgnite(this.index(x, y), x, y);
      this.forNeighbors(x, y, tryIgnite);
    });
  }

  getBurnResidue(i) {
    const sourcePixel = PIXEL_BY_ID[this.burnSource[i]];
    if (sourcePixel && sourcePixel.burnsTo !== null && Math.random() < sourcePixel.burnsToChance) {
      return sourcePixel.burnsTo;
    }
    return Math.random() < 0.45 ? MATERIAL.SMOKE : MATERIAL.ASH;
  }

  getBurnoutChance(i) {
    return PIXEL_BY_ID[this.burnSource[i]]?.burnoutChance ?? 0.018;
  }

  canBurningCellDrift(i) {
    const sourcePixel = PIXEL_BY_ID[this.burnSource[i]];
    return !sourcePixel || sourcePixel.gas;
  }

  scorchLowFlammabilityNeighbors(x, y, chance) {
    this.forNeighbors(x, y, (n) => {
      if (this.isStatic(n)) return true;
      const pixel = this.getPixelAtIndex(n);
      if (pixel.scorchable && pixel.flammability === 0 && Math.random() < chance) {
        this.setCell(n, pixel.scorchTo);
        this.touched[n] = this.tick;
      }
      return true;
    });
  }

  consumeExtinguishingNeighbors(x, y, chance) {
    let consumed = false;
    this.forNeighbors(x, y, (n) => {
      if (this.isStatic(n)) return true;
      const pixel = this.getPixelAtIndex(n);
      if (pixel.extinguishPower > 0 && (!consumed || Math.random() < chance * pixel.extinguishPower)) {
        this.setCell(n, MATERIAL.STEAM, 12);
        this.touched[n] = this.tick;
        consumed = true;
        return false;
      }
      return true;
    });
  }

  emitIntoNeighbor(x, y, material, value, chance) {
    let emitted = false;
    this.forNeighbors(x, y, (n) => {
      if (this.isStatic(n)) return true;
      const pixel = this.getPixelAtIndex(n);
      if (!pixel.displaceable || Math.random() >= chance) return true;
      this.setCell(n, material, value);
      this.touched[n] = this.tick;
      emitted = true;
      return false;
    });
    return emitted;
  }

  keepActive(i) {
    this.markActiveIndex(i);
  }

  markActiveIndex(i) {
    if (this.suspendActivation || i < 0 || i >= this.total || this.nextActiveFlags[i]) return;
    this.nextActiveFlags[i] = 1;
    this.nextActiveList.push(i);
  }

  markCurrentActiveIndex(i) {
    if (i < 0 || i >= this.total || this.activeFlags[i]) return;
    this.activeFlags[i] = 1;
    this.activeList.push(i);
  }

  markActiveAroundIndex(i) {
    if (this.suspendActivation) return;
    const x = i % this.width;
    const y = Math.floor(i / this.width);

    for (let yy = y - 1; yy <= y + 1; yy++) {
      if (yy < 0 || yy >= this.height) continue;
      for (let xx = x - 1; xx <= x + 1; xx++) {
        if (xx < 0 || xx >= this.width) continue;
        this.markActiveIndex(this.index(xx, yy));
      }
    }
  }

  activateAllDynamic() {
    this.activeList.length = 0;
    this.nextActiveList.length = 0;
    this.activeFlags.fill(0);
    this.nextActiveFlags.fill(0);

    for (let i = 0; i < this.total; i++) {
      const pixel = PIXEL_BY_ID[this.cells[i]];
      if (this.cells[i] !== MATERIAL.SPACE && !pixel.gas) this.markCurrentActiveIndex(i);
    }
  }

  promoteNextActive() {
    const emptyList = this.activeList;
    const emptyFlags = this.activeFlags;
    this.activeList = this.nextActiveList;
    this.activeFlags = this.nextActiveFlags;
    this.nextActiveList = emptyList;
    this.nextActiveFlags = emptyFlags;
  }

  forNeighbors(x, y, fn) {
    const order = Math.random() < 0.5
      ? [[0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1]]
      : [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]];

    for (const [dx, dy] of order) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && fn(this.index(nx, ny), nx, ny) === false) return;
    }
  }

  paintCircle(cx, cy, radius, material, flags = 0, options = {}, layerName = this.activeLayerName) {
    if (layerName !== this.activeLayerName) {
      return this.withLayer(layerName, () => this.paintCircle(cx, cy, radius, material, flags, options, layerName));
    }
    const radiusSq = radius * radius;

    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > radiusSq) continue;
        if (Math.random() < 0.08 && material !== MATERIAL.SPACE && radius > 2) continue;
        this.setCell(this.index(x, y), material, 0, { flags, ...options });
      }
    }
  }

  clear() {
    for (const name of Object.keys(this.layers)) this.clearLayer(name);
    this.objects.length = 0;
    this.backdropObjects.length = 0;
    this.flagsVersion++;
    this.bindLayer('foreground');
  }

  clearLayer(name) {
    this.withLayer(name, () => {
      this.cells.fill(MATERIAL.SPACE);
      this.data.fill(0);
      this.burnSource.fill(0);
      this.tintR.fill(0);
      this.tintG.fill(0);
      this.tintB.fill(0);
      this.flags.fill(0);
      this.touched.fill(0);
      this.activeFlags.fill(0);
      this.nextActiveFlags.fill(0);
      this.activeList.length = 0;
      this.nextActiveList.length = 0;
      for (let i = 0; i < this.total; i++) this.shade[i] = this.randomByte();
      this.markLayerFullyDirty(this.layers[name]);
    });
  }

  loadSave(save) {
    if (save.width !== this.width || save.height !== this.height) {
      throw new Error(`Save dimensions ${save.width}x${save.height} do not match world ${this.width}x${this.height}.`);
    }
    if (save.encoding !== 'layers-rows-rle' || !save.layers) {
      throw new Error('Unsupported save format.');
    }

    this.clear();
    runTerrainGenerators(this, save.generators ?? []);
    for (const name of ['backdrop', 'background', 'foreground']) {
      if (save.layers[name] === undefined) continue;
      if (!Array.isArray(save.layers[name])) throw new Error(`Save ${name} layer must be an array of rows.`);
      this.loadSaveLayer(name, save.layers[name]);
    }
    for (const name of ['backdrop', 'background', 'foreground']) {
      this.withLayer(name, () => this.activateAllDynamic());
    }
    this.bindLayer('foreground');
    loadPixelObjects(this, save.objects ?? []);
  }

  loadSaveLayer(name, rows) {
    this.withLayer(name, () => {
      this.suspendActivation = true;
      let y = 0;
      try {
        for (const rowEntry of rows) {
          const repeat = rowEntry.repeat ?? 1;
          if (!Number.isInteger(repeat) || repeat < 1) throw new Error('Save row repeat must be a positive integer.');
          for (let i = 0; i < repeat; i++) {
            if (y >= this.height) throw new Error(`Save ${name} layer defines more rows than the world height.`);
            this.loadSaveRow(y, rowEntry.runs);
            y++;
          }
        }
      } finally {
        this.suspendActivation = false;
      }
      if (y !== this.height) throw new Error(`Save ${name} layer defines ${y} rows, expected ${this.height}.`);
    });
  }

  loadSaveRow(y, runs) {
    if (!Array.isArray(runs)) {
      throw new Error(`Save row ${y} is missing runs.`);
    }

    let x = 0;
    for (const run of runs) {
      const [materialName, count, value = 0] = run;
      const material = MATERIAL_BY_NAME[materialName];
      if (material === undefined) {
        throw new Error(`Unknown material "${materialName}" in save row ${y}.`);
      }
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(`Invalid run length in save row ${y}.`);
      }

      for (let i = 0; i < count; i++) {
        if (x >= this.width) throw new Error(`Save row ${y} is wider than ${this.width} pixels.`);
        this.setCell(this.index(x, y), material, value, { force: true, flags: 0, silent: true });
        x++;
      }
    }

    if (x !== this.width) {
      throw new Error(`Save row ${y} defines ${x} pixels, expected ${this.width}.`);
    }
  }

  seed() {
    this.clear();
    this.bindLayer('foreground');
    this.suspendActivation = true;

    for (let x = 0; x < this.width; x++) {
      const ground = this.height - 24 + Math.floor(Math.sin(x * 0.11) * 5 + Math.sin(x * 0.031) * 9);
      for (let y = ground; y < this.height; y++) {
        this.setCell(this.index(x, y), MATERIAL.DIRT);
      }
    }

    for (let y = this.height - 43; y < this.height - 25; y++) {
      for (let x = 18; x < 65; x++) {
        if (this.inBounds(x, y) && Math.random() > 0.035) this.setCell(this.index(x, y), MATERIAL.WATER);
      }
    }

    for (let y = this.height - 58; y < this.height - 26; y++) {
      for (let x = 132; x < 183; x++) {
        if ((x + y) % 9 !== 0) this.setCell(this.index(x, y), MATERIAL.WOOD);
      }
    }

    for (let y = this.height - 68; y < this.height - 58; y++) {
      for (let x = 148; x < 164; x++) {
        if (Math.random() > 0.22) this.setCell(this.index(x, y), MATERIAL.FIRE);
      }
    }

    for (let n = 0; n < 1400; n++) {
      const x = Math.floor(Math.random() * this.width);
      const y = Math.floor(8 + Math.random() * 54);
      if (Math.random() < 0.72) this.setCell(this.index(x, y), MATERIAL.DIRT);
    }

    this.suspendActivation = false;
    this.activateAllDynamic();
  }

  step() {
    this.tick++;
    if (this.tick > 4000000000) {
      this.tick = 1;
      for (const layer of Object.values(this.layers)) layer.touched.fill(0);
    }

    this.bindLayer('foreground');
    for (const object of this.objects) object.update(this);
    this.objects = this.objects.filter((object) => !object.destroyed);

    this.bindLayer('backdrop');
    for (const object of this.backdropObjects) object.updateBackdrop(this);

    this.stepLayer('foreground');
    this.stepLayer('background');
    this.bindLayer('foreground');
  }

  stepLayer(name) {
    this.bindLayer(name);
    if (this.activeList.length === 0 && this.nextActiveList.length > 0) this.promoteNextActive();

    const processingList = this.activeList;
    const processingFlags = this.activeFlags;
    const upcomingList = this.nextActiveList;
    const upcomingFlags = this.nextActiveFlags;

    for (let scan = processingList.length - 1; scan >= 0; scan--) {
      const i = processingList[scan];
      processingFlags[i] = 0;
      if (this.touched[i] === this.tick || this.cells[i] === MATERIAL.SPACE) continue;

      const pixel = PIXEL_BY_ID[this.cells[i]];
      if (!pixel) continue;
      pixel.update(this, i, i % this.width, Math.floor(i / this.width));
      this.markRenderDirty(i);
    }

    processingList.length = 0;
    this.activeList = upcomingList;
    this.activeFlags = upcomingFlags;
    this.nextActiveList = processingList;
    this.nextActiveFlags = processingFlags;
    const layer = this.layers[name];
    layer.activeList = this.activeList;
    layer.activeFlags = this.activeFlags;
    layer.nextActiveList = this.nextActiveList;
    layer.nextActiveFlags = this.nextActiveFlags;
  }
}
