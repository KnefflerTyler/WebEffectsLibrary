import { MATERIAL } from './pixel/Pixel.js';
import { MATERIAL_BY_NAME, PIXEL_BY_ID } from './pixel/pixelRegistry.js';
import { CampfireObject } from './pixel/objects/CampfireObject.js';
import { FishingRodObject } from './pixel/objects/FishingRodObject.js';
import { TentObject } from './pixel/objects/TentObject.js';

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export class StampTool {
  constructor({ world, previewCanvas, select, getLayers, getClothColor }) {
    this.world = world;
    this.canvas = previewCanvas;
    this.context = previewCanvas.getContext('2d');
    this.select = select;
    this.getLayers = getLayers;
    this.getClothColor = getClothColor;
    this.enabled = false;
    this.asset = null;
    this.point = null;
    this.loadToken = 0;

    this.context.imageSmoothingEnabled = false;
    this.select.addEventListener('change', () => this.selectAsset());
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.hidePreview();
      return;
    }
    this.selectAsset();
  }

  updatePreview(point) {
    this.point = point;
    if (!this.enabled) return;
    if (!this.asset) {
      this.loadSelectedAsset();
      return;
    }
    this.drawPreview();
  }

  hidePreview() {
    this.point = null;
    this.canvas.hidden = true;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  async stampAt(point) {
    this.point = point;
    const asset = this.asset ?? await this.loadSelectedAsset();
    if (!asset) return false;

    if (asset.kind === 'template') this.stampTemplate(asset, point);
    else this.stampObject(asset, point);
    this.drawPreview();
    return true;
  }

  selectAsset() {
    this.asset = null;
    this.loadToken++;
    if (this.enabled) this.loadSelectedAsset();
  }

  async loadSelectedAsset() {
    const option = this.select.selectedOptions[0];
    if (!option) return null;
    const token = ++this.loadToken;

    try {
      let asset;
      if (option.dataset.kind === 'template') {
        const response = await fetch(option.dataset.file);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const template = await response.json();
        asset = {
          kind: 'template',
          template,
          cells: this.templateCells(template),
          width: template.width,
          height: template.height,
        };
      } else {
        asset = this.objectAsset(option.dataset.object);
      }

      if (token !== this.loadToken) return this.asset;
      this.asset = asset;
      if (this.enabled && this.point) this.drawPreview();
      return asset;
    } catch (error) {
      console.warn(`Stamp asset "${option.value}" failed to load.`, error);
      return null;
    }
  }

  objectAsset(type) {
    const object = this.createObject(type, 'foreground');
    const cells = object.cells.map((cell) => ({
      x: cell.dx,
      y: cell.dy,
      material: cell.material,
      value: cell.value,
      color: cell.color,
    }));

    if (type === 'campfire') {
      for (let row = 0; row < 8; row++) {
        const halfWidth = Math.max(0, Math.round(3 * (1 - row / 8)));
        for (let x = -halfWidth; x <= halfWidth; x++) {
          cells.push({ x, y: -8 - row, material: MATERIAL.FIRE, value: 42, color: null });
        }
      }
    }
    if (type === 'fishingRod') {
      for (const cell of object.getRigCells(0)) cells.push(cell);
    }

    const xs = cells.map((cell) => cell.x);
    const ys = cells.map((cell) => cell.y);
    return {
      kind: 'object',
      type,
      cells,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  createObject(type, layer) {
    if (type === 'campfire') return new CampfireObject({ x: 0, y: 0, layer });
    if (type === 'fishingRod') return new FishingRodObject({ x: 0, y: 0, layer });
    return new TentObject({
      x: 0,
      y: 0,
      layer,
      width: 21,
      height: 15,
      clothColor: this.getClothColor(),
    });
  }

  stampTemplate(asset, point) {
    const x = point.x - Math.floor(asset.width / 2);
    const y = point.y - Math.floor(asset.height / 2);
    for (const layer of this.getLayers()) {
      this.world.drawSaveTemplates([{ template: asset.template, x, y, layer }]);
      this.world.withLayer(layer, () => this.world.activateAllDynamic());
    }
  }

  stampObject(asset, point) {
    const centerX = (asset.minX + asset.maxX) / 2;
    const centerY = (asset.minY + asset.maxY) / 2;
    for (const layer of this.getLayers()) {
      const object = this.createObject(asset.type, layer);
      object.x = Math.round(point.x - centerX);
      object.y = Math.round(point.y - centerY);
      this.world.addObject(object);
    }
  }

  drawPreview() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.enabled || !this.asset || !this.point) {
      this.canvas.hidden = true;
      return;
    }

    const asset = this.asset;
    let originX;
    let originY;
    if (asset.kind === 'template') {
      originX = this.point.x - Math.floor(asset.width / 2);
      originY = this.point.y - Math.floor(asset.height / 2);
    } else {
      originX = Math.round(this.point.x - (asset.minX + asset.maxX) / 2);
      originY = Math.round(this.point.y - (asset.minY + asset.maxY) / 2);
    }

    for (const cell of asset.cells) {
      const x = originX + cell.x;
      const y = originY + cell.y;
      if (!this.world.inBounds(x, y)) continue;
      const color = this.cellColor(cell);
      this.context.fillStyle = `rgb(${color[0]} ${color[1]} ${color[2]})`;
      this.context.fillRect(x, y, 1, 1);
    }
    this.canvas.hidden = false;
  }

  cellColor(cell) {
    const pixel = PIXEL_BY_ID[cell.material];
    const tint = cell.color ?? pixel.color;
    return pixel.renderColor(128, cell.value ?? 0, tint).map(clampByte);
  }

  templateCells(template) {
    const rows = template.layers?.foreground ?? Object.values(template.layers ?? {})[0] ?? [];
    const cells = new Map();
    let rowY = 0;
    const paint = (x, y, materialName, value = 0) => {
      const material = MATERIAL_BY_NAME[materialName];
      if (material === undefined || material === MATERIAL.SPACE || material === MATERIAL.AIR) return;
      cells.set(`${x},${y}`, { x, y, material, value, color: null });
    };

    for (const entry of rows) {
      if (entry.shape) {
        this.rasterizeShape(entry, paint);
        continue;
      }
      const repeat = entry.repeat ?? 1;
      for (let repeated = 0; repeated < repeat; repeated++) {
        let x = 0;
        for (const [material, count, value = 0] of entry.runs ?? []) {
          for (let offset = 0; offset < count; offset++) paint(x + offset, rowY, material, value);
          x += count;
        }
        rowY++;
      }
    }
    return [...cells.values()];
  }

  rasterizeShape(shape, paint) {
    const x = shape.x ?? 0;
    const y = shape.y ?? 0;
    const value = shape.value ?? 0;
    if (shape.shape === 'rect' || shape.shape === 'rectangle' || shape.shape === 'square') {
      const width = shape.width ?? shape.size ?? 1;
      const height = shape.height ?? shape.size ?? width;
      for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) paint(xx, yy, shape.material, value);
      return;
    }

    const outerX = shape.outerRadiusX ?? shape.radiusX ?? shape.rx ?? shape.outerRadius ?? shape.radius ?? Math.floor((shape.width ?? 1) / 2);
    const derivedRadiusY = Math.floor((shape.height ?? 1) / 2);
    const outerY = shape.outerRadiusY ?? shape.radiusY ?? shape.ry ?? shape.outerRadius ?? shape.radius ?? (derivedRadiusY || outerX);
    const innerX = shape.innerRadiusX ?? shape.innerRadius ?? Math.max(0, outerX - 1);
    const innerY = shape.innerRadiusY ?? shape.innerRadius ?? Math.max(0, outerY - 1);
    const rx = Math.max(0.5, outerX);
    const ry = Math.max(0.5, outerY);
    for (let yy = Math.floor(y - ry); yy <= Math.ceil(y + ry); yy++) {
      for (let xx = Math.floor(x - rx); xx <= Math.ceil(x + rx); xx++) {
        const outer = ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2 <= 1;
        const inner = ((xx - x) / Math.max(0.5, innerX)) ** 2 + ((yy - y) / Math.max(0.5, innerY)) ** 2 <= 1;
        if (outer && (shape.shape !== 'donut' || !inner)) paint(xx, yy, shape.material, value);
      }
    }
  }
}
