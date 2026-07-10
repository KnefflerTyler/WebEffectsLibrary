import { CELL_FLAGS } from '../../PixelWorld.js';
import { MATERIAL } from '../Pixel.js';
import { PixelObject } from './PixelObject.js';

export class TentObject extends PixelObject {
  constructor({ x, y, clothColor = [188, 54, 56], width = 38, height = 28 }) {
    super({ x, y });
    this.clothColor = clothColor;
    this.shadowColor = clothColor.map((channel) => Math.max(0, Math.floor(channel * 0.72)));
    this.interiorColor = clothColor.map((channel) => Math.max(0, Math.floor(channel * 0.48)));
    this.width = width;
    this.height = height;
    this.doorCells = [];
    this.build();
  }

  build() {
    this.addCanopy();
    this.addOpeningStick();
    this.addDoorFlap();
  }

  addCanopy() {
    const half = Math.floor(this.width / 2);
    for (let level = 0; level <= this.height; level++) {
      const y = -this.height + level;
      const edge = Math.max(0, Math.round((half * level) / this.height));
      const left = -edge;
      const right = edge;
      this.addCloth(left, y, 0, this.clothColor);
      this.addCloth(right, y, 1, this.shadowColor);
      for (let x = left + 1; x < right; x++) {
        this.addCloth(x, y, 5 + level * this.width + x, this.interiorColor, 'canopy-fill');
      }
      if (level > 4 && level < this.height - 1) {
        if (level % 3 === 0) this.addCloth(left + 1, y, 2, this.clothColor);
        if (level % 4 === 0) this.addCloth(right - 1, y, 3, this.shadowColor);
      }
    }
  }

  addOpeningStick() {
    const stickTop = -Math.floor(this.height * 0.78);
    for (let y = 0; y >= stickTop; y--) {
      this.addCell({ id: `stick-${y}`, dx: 0, dy: y, material: MATERIAL.WOOD, flags: CELL_FLAGS.NO_GRAVITY, role: 'stick' });
    }
  }

  addDoorFlap() {
    const doorHeight = Math.floor(this.height * 0.58);
    const doorWidth = Math.max(5, Math.floor(this.width * 0.18));
    for (let row = 0; row <= doorHeight; row++) {
      const y = -doorHeight + row;
      const rowWidth = Math.max(1, Math.round((doorWidth * row) / doorHeight));
      for (let x = -rowWidth; x <= rowWidth; x++) {
        if (x === 0) continue;
        const cell = this.addCloth(x, y, 12 + row + x, this.clothColor, 'door');
        cell.windScale = row / doorHeight;
        this.doorCells.push(cell);
      }
    }
  }

  addCloth(dx, dy, value, color, role = 'canopy') {
    return this.addCell({ id: `${role}-${dx}-${dy}-${value}`, dx, dy, material: MATERIAL.CLOTH, value, color, flags: CELL_FLAGS.NO_GRAVITY, role });
  }

  update(world) {
    if (!this.placed) this.place(world);
    if (this.refreshCells(world) === 0) return;

    const wind = Math.sin(world.tick * 0.08) * 3;
    for (const cell of this.doorCells) {
      if (!cell.alive) continue;
      const flap = Math.round(wind * cell.windScale + Math.sin(world.tick * 0.15 + cell.baseDy) * cell.windScale);
      this.moveCell(world, cell, cell.baseDx + flap, cell.baseDy);
    }
  }
}
