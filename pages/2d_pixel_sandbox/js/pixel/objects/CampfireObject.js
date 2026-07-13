import { CELL_FLAGS } from '../../PixelWorld.js';
import { MATERIAL } from '../Pixel.js';
import { PixelObject } from './PixelObject.js';

const DEFAULT_WOOD_COLOR = '#81522a';

function parseHexColor(value) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return [129, 82, 42];
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function scaleColor(color, scale) {
  return color.map((channel) => Math.min(255, Math.max(0, Math.round(channel * scale))));
}

export class CampfireObject extends PixelObject {
  constructor({
    x,
    y,
    layer = 'foreground',
    woodColor = DEFAULT_WOOD_COLOR,
  }) {
    super({ x, y, layer });
    this.woodColor = parseHexColor(woodColor);
    this.woodHighlightColor = scaleColor(this.woodColor, 1.38);
    this.woodShadowColor = scaleColor(this.woodColor, 0.58);
    this.flameIndices = [];
    this.buildStructure();
  }

  buildStructure() {
    const structure = new Map();
    const add = (dx, dy, material, role, color = null) => {
      const key = `${dx},${dy}`;
      structure.set(key, { dx, dy, material, role, color });
    };

    for (const centerX of [-9, -6, -3, 0, 3, 6, 9]) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx * dx + dy * dy <= 1) add(centerX + dx, -4 + dy, MATERIAL.ROCK, 'stone');
        }
      }
    }

    for (let dx = -10; dx <= -1; dx++) {
      const dy = -6 - Math.floor((dx + 10) / 5);
      const topColor = dx % 3 === 0 ? this.woodHighlightColor : this.woodColor;
      add(dx, dy, MATERIAL.WOOD, 'log-top', topColor);
      add(dx, dy + 1, MATERIAL.WOOD, 'log-shadow', this.woodShadowColor);
    }
    for (let dx = 1; dx <= 10; dx++) {
      const dy = -7 + Math.floor((dx - 1) / 5);
      const topColor = dx % 3 === 1 ? this.woodHighlightColor : this.woodColor;
      add(dx, dy, MATERIAL.WOOD, 'log-top', topColor);
      add(dx, dy + 1, MATERIAL.WOOD, 'log-shadow', this.woodShadowColor);
    }
    for (let dx = -6; dx <= 6; dx++) {
      add(dx, -5, MATERIAL.CHARCOAL, 'charcoal');
      if (Math.abs(dx) <= 4) add(dx, -4, MATERIAL.CHARCOAL, 'charcoal');
    }

    let id = 0;
    for (const cell of structure.values()) {
      this.addCell({
        id: `campfire-${cell.role}-${id++}`,
        dx: cell.dx,
        dy: cell.dy,
        material: cell.material,
        color: cell.color,
        flags: CELL_FLAGS.STATIC | CELL_FLAGS.FIREPROOF,
        role: cell.role,
      });
    }
  }

  place(world) {
    this.paintStructure(world);
    this.paintFlames(world);
    this.placed = true;
  }

  update(world) {
    this.clearPreviousFlames(world);
    this.paintStructure(world);
    this.paintFlames(world);
  }

  paintStructure(world) {
    for (const cell of this.cells) {
      const index = this.cellIndex(world, cell.dx, cell.dy);
      if (index < 0) continue;
      if (world.cells[index] === cell.material && world.isStatic(index)) continue;
      this.paintCell(world, cell);
    }
  }

  clearPreviousFlames(world) {
    for (const index of this.flameIndices) {
      if (world.cells[index] !== MATERIAL.FIRE || !world.isDecorative(index)) continue;
      world.setCell(index, MATERIAL.SPACE, 0, { force: true, flags: 0 });
    }
    this.flameIndices.length = 0;
  }

  paintFlames(world) {
    const tick = world.tick;
    const mainHeight = 8 + Math.round((Math.sin(tick * 0.19) + 1) * 1.5);
    const leftHeight = 4 + Math.round((Math.sin(tick * 0.27 + 1.4) + 1) * 1.25);
    const rightHeight = 5 + Math.round((Math.sin(tick * 0.23 + 3.1) + 1) * 1.25);

    this.paintFlameLobe(world, 0, -8, mainHeight, 4, 0);
    this.paintFlameLobe(world, -4, -7, leftHeight, 2, 1.7);
    this.paintFlameLobe(world, 4, -7, rightHeight, 2, 3.4);
  }

  paintFlameLobe(world, centerX, baseY, height, maxHalfWidth, phase) {
    for (let row = 0; row < height; row++) {
      const taper = 1 - row / height;
      const halfWidth = Math.max(0, Math.round(maxHalfWidth * taper));
      const sway = Math.round(Math.sin(world.tick * 0.21 + row * 0.82 + phase));
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        if (row > 1 && Math.abs(dx) === halfWidth && (row + dx + world.tick) % 3 === 0) continue;
        this.paintFlameCell(world, centerX + sway + dx, baseY - row, 34 + ((row * 7 + world.tick) % 22));
      }
    }
  }

  paintFlameCell(world, dx, dy, value) {
    const index = this.cellIndex(world, dx, dy);
    if (index < 0) return;
    world.setCell(index, MATERIAL.FIRE, value, {
      force: true,
      flags: CELL_FLAGS.DECORATIVE | CELL_FLAGS.NO_GRAVITY,
      temperature: 20,
    });
    this.flameIndices.push(index);
  }
}
