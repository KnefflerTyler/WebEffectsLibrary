import Sprite from '../objects/sprites/sprite.js';
import BaseLevel from './baseLevel.js';
import LevelCollider from './levelCollider.js';

const DEFAULT_BACKGROUND = {
  type: 'checker',
  colors: ['#202720', '#2a322a']
};

export class GridLevel extends BaseLevel {
  constructor(data = {}, overlayObjects = []) {
    const grid = normalizeGrid(data.grid);
    const canvas = document.createElement('canvas');
    const image = new Image();
    const sprite = new Sprite({ id: `${data.id}:grid`, x: 0.5, y: 0.5, image, wrapWithScreen: false });
    sprite.levelSized = true;
    const regions = buildCellRegions(grid.foreground, grid.cols, grid.rows);
    const colliders = regions.flatMap(region => {
      const definition = grid.foregroundSprites[region.sprite];
      if (!definition?.collider || definition.collider.enabled === false) return [];
      const collider = new LevelCollider({
        id: definition.id
          ? `${definition.id}:${region.row}:${region.col}`
          : `${data.id}:grid:${region.row}:${region.col}`,
        name: definition.name ?? region.sprite,
        shape: 'rectangle',
        start: { x: region.col / grid.cols, y: region.row / grid.rows },
        end: { x: (region.col + region.width) / grid.cols, y: (region.row + region.height) / grid.rows },
        borderAlpha: 0,
        fillAlpha: 0,
        destructible: definition.destructible,
        collider: definition.collider
      });
      collider.gridRegion = region;
      return [collider];
    });
    super({ data: { ...data, grid }, objects: [sprite, ...colliders, ...overlayObjects] });
    this.grid = grid;
    this.canvas = canvas;
    this.image = image;
    this.sprite = sprite;
    this.overlayObjects = overlayObjects;
    this.renderRevision = 0;
    this.renderDirty = false;
    this.animationElapsed = 0;
    this.animationFrameKey = '';
    this.tileImages = new Map();
    this.loadTileImages(data.source);
    this.renderGrid();
  }

  loadTileImages(source) {
    for (const [id, definition] of Object.entries(this.grid.foregroundSprites)) {
      if (!definition.image) continue;
      const image = new Image();
      image.onload = () => this.renderGrid();
      image.src = source ? new URL(definition.image, source).href : definition.image;
      this.tileImages.set(id, image);
    }
  }

  renderGrid() {
    this.renderDirty = false;
    const tileSize = Math.max(4, Math.floor(768 / this.grid.cols));
    this.canvas.width = this.grid.cols * tileSize;
    this.canvas.height = this.grid.rows * tileSize;
    const context = this.canvas.getContext('2d');
    for (let row = 0; row < this.grid.rows; row += 1) {
      for (let col = 0; col < this.grid.cols; col += 1) {
        const x = col * tileSize;
        const y = row * tileSize;
        drawTile(context, this.grid.backgroundSprites[this.grid.background[row][col]], x, y, tileSize, DEFAULT_BACKGROUND);
      }
    }
    for (let row = 0; row < this.grid.rows; row += 1) {
      for (let col = 0; col < this.grid.cols; col += 1) {
        const foregroundId = this.grid.foreground[row][col];
        const foreground = this.grid.foregroundSprites[foregroundId];
        if (!foreground) continue;
        const renderCols = Math.max(1, Number(foreground.renderSize?.cols) || 1);
        const renderRows = Math.max(1, Number(foreground.renderSize?.rows) || 1);
        const x = (col - (renderCols - 1) / 2) * tileSize;
        const y = (row - (renderRows - 1) / 2) * tileSize;
        drawTile(
          context, foreground, x, y, tileSize, null, this.tileImages.get(foregroundId),
          renderCols * tileSize, renderRows * tileSize, this.animationElapsed
        );
      }
    }
    for (const object of this.objects) {
      if (!(object instanceof LevelCollider) || !object.maxHealth || object.health >= object.maxHealth || object.isDestroyed) continue;
      drawDamage(context, object.gridRegion, tileSize, object.health / object.maxHealth);
    }
    // Keep the current GPU texture visible while its replacement loads. A
    // fresh Image is still required because renderer textures are cached by
    // image identity.
    const revision = ++this.renderRevision;
    const nextImage = new Image();
    nextImage.onload = () => {
      if (revision !== this.renderRevision) return;
      this.image = nextImage;
      this.sprite.image = nextImage;
    };
    nextImage.src = this.canvas.toDataURL('image/png');
  }

  damageObject(id, amount = 1) {
    const object = this.objects.find(candidate => candidate.id === id);
    if (!(object instanceof LevelCollider)) return false;
    const previousHealth = object.health;
    const destroyed = object.damage(amount);
    if (destroyed && object.gridRegion) {
      const region = object.gridRegion;
      for (let row = region.row; row < region.row + region.height; row += 1) {
        for (let col = region.col; col < region.col + region.width; col += 1) this.grid.foreground[row][col] = null;
      }
    }
    if (object.health !== previousHealth) this.renderDirty = true;
    return destroyed;
  }

  applyObjectState(states = []) {
    super.applyObjectState(states);
    for (const object of this.objects) {
      if (!(object instanceof LevelCollider) || !object.isDestroyed || !object.gridRegion) continue;
      const region = object.gridRegion;
      for (let row = region.row; row < region.row + region.height; row += 1) {
        for (let col = region.col; col < region.col + region.width; col += 1) this.grid.foreground[row][col] = null;
      }
    }
    this.renderDirty = true;
  }

  update(dt) {
    for (const object of this.overlayObjects) object.update?.(dt);
    const animated = Object.values(this.grid.foregroundSprites).filter(sprite => sprite.animation);
    if (animated.length) {
      this.animationElapsed += Math.max(0, Number(dt) || 0);
      const frameKey = animated.map(sprite => getAnimationFrame(sprite, this.animationElapsed).column).join(':');
      if (frameKey !== this.animationFrameKey) {
        this.animationFrameKey = frameKey;
        this.renderDirty = true;
      }
    }
    if (this.renderDirty) this.renderGrid();
  }
}

export function normalizeGrid(source = {}) {
  const cols = clampInteger(source.cols, 4, 256, 96);
  const rows = clampInteger(source.rows, 4, 144, 54);
  const backgroundSprites = { transparency: DEFAULT_BACKGROUND, ...(source.backgroundSprites ?? {}) };
  const foregroundSprites = source.foregroundSprites ?? {};
  const defaultBackground = source.defaultBackground ?? 'transparency';
  return {
    cols,
    rows,
    defaultBackground,
    backgroundSprites,
    foregroundSprites,
    background: expandLayer(source.background, source.backgroundLegend, cols, rows, defaultBackground),
    foreground: expandLayer(source.foreground, source.foregroundLegend, cols, rows, null)
  };
}

function expandLayer(lines, legend = {}, cols, rows, fallback) {
  return Array.from({ length: rows }, (_, row) => {
    const line = lines?.[row];
    return Array.from({ length: cols }, (_, col) => {
      const value = typeof line === 'string' ? line[col] : line?.[col];
      return value == null ? fallback : (Object.hasOwn(legend, value) ? legend[value] : value);
    });
  });
}

function buildCellRegions(cells, cols, rows) {
  const regions = [];
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
    const sprite = cells[row][col];
    if (sprite) regions.push({ sprite, row, col, width: 1, height: 1 });
  }
  return regions;
}

function drawTile(
  context, definition, x, y, size, fallback, image = null,
  drawWidth = size, drawHeight = size, animationElapsed = 0
) {
  const tile = definition ?? fallback;
  if (!tile) return;
  if (tile.type === 'checker') {
    const colors = tile.colors ?? DEFAULT_BACKGROUND.colors;
    const half = size / 2;
    context.fillStyle = colors[0]; context.fillRect(x, y, size, size);
    context.fillStyle = colors[1]; context.fillRect(x + half, y, half, half); context.fillRect(x, y + half, half, half);
    return;
  }
  if (image?.complete && image.naturalWidth) {
    const cols = Math.max(1, Number(tile.sheetCols) || 1);
    const rows = Math.max(1, Number(tile.sheetRows) || 1);
    const frame = tile.animation ? getAnimationFrame(tile, animationElapsed) : tile.frame;
    const column = Math.max(0, Math.min(cols - 1, Number(frame?.column) || 0));
    const row = Math.max(0, Math.min(rows - 1, Number(frame?.row) || 0));
    const frameWidth = image.naturalWidth / cols;
    const frameHeight = image.naturalHeight / rows;
    context.drawImage(image, column * frameWidth, row * frameHeight, frameWidth, frameHeight, x, y, drawWidth, drawHeight);
    return;
  }
  context.fillStyle = tile.color ?? tile.fillColor ?? '#ffffff';
  context.fillRect(x, y, size, size);
  if (tile.borderColor) {
    context.strokeStyle = tile.borderColor;
    context.globalAlpha = tile.borderAlpha ?? 1;
    context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    context.globalAlpha = 1;
  }
}

function getAnimationFrame(tile, elapsed) {
  const animation = tile.animation ?? {};
  const startCol = Math.max(0, Number(animation.startCol) || 0);
  const endCol = Math.max(startCol, Number(animation.endCol) || startCol);
  const frameCount = endCol - startCol + 1;
  const index = Math.floor(elapsed * Math.max(0.1, Number(animation.fps) || 8));
  return {
    column: startCol + (animation.loop === false ? Math.min(index, frameCount - 1) : index % frameCount),
    row: Math.max(0, Number(animation.row) || 0)
  };
}

function drawDamage(context, region, tileSize, healthRatio) {
  if (!region) return;
  const x = region.col * tileSize;
  const y = region.row * tileSize;
  const width = region.width * tileSize;
  const height = region.height * tileSize;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillStyle = `rgba(10, 8, 7, ${(1 - healthRatio) * 0.38})`;
  context.fillRect(x, y, width, height);
  context.strokeStyle = `rgba(20, 14, 12, ${0.3 + (1 - healthRatio) * 0.65})`;
  context.lineWidth = Math.max(1, tileSize / 7);
  const cracks = Math.max(1, Math.ceil((1 - healthRatio) * 5));
  const random = createSeededRandom((region.row + 1) * 73856093 ^ (region.col + 1) * 19349663);
  for (let index = 0; index < cracks; index += 1) {
    const startX = x + width * (0.15 + random() * 0.7);
    const startY = y + height * (0.12 + random() * 0.76);
    const rotation = random() * Math.PI * 2;
    const length = tileSize * (0.65 + random() * 0.75);
    const segments = 2 + Math.floor(random() * 5);
    const zigzag = tileSize * (0.05 + random() * 0.24);
    const directionX = Math.cos(rotation);
    const directionY = Math.sin(rotation);
    const perpendicularX = -directionY;
    const perpendicularY = directionX;
    context.beginPath();
    context.moveTo(startX, startY);
    for (let segment = 1; segment <= segments; segment += 1) {
      const distance = length * segment / segments;
      const offset = segment === segments ? 0 : (random() * 2 - 1) * zigzag;
      context.lineTo(
        startX + directionX * distance + perpendicularX * offset,
        startY + directionY * distance + perpendicularY * offset
      );
    }
    context.stroke();
  }
  context.restore();
}

function createSeededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = Math.imul(state ^ state >>> 15, 1 | state);
    state ^= state + Math.imul(state ^ state >>> 7, 61 | state);
    return ((state ^ state >>> 14) >>> 0) / 4294967296;
  };
}

function clampInteger(value, min, max, fallback) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || fallback)));
}

export default GridLevel;
