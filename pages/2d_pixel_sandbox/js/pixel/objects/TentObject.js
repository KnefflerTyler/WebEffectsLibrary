import { CELL_FLAGS } from '../../PixelWorld.js';
import { MATERIAL } from '../Pixel.js';
import { PixelObject } from './PixelObject.js';

export class TentObject extends PixelObject {
  constructor({ x, y, layer = 'foreground', clothColor = [188, 54, 56], width = 38, height = 28 }) {
    super({ x, y, layer });
    this.clothColor = clothColor;
    this.shadowColor = clothColor.map((channel) => Math.max(0, Math.floor(channel * 0.72)));
    this.interiorColor = clothColor.map((channel) => Math.max(0, Math.floor(channel * 0.48)));
    this.width = width;
    this.height = height;
    const tentHalfWidth = Math.floor(this.width / 2);
    this.doorHeight = this.height;
    this.doorWidth = tentHalfWidth;
    this.doorTravel = Math.max(2, Math.round(this.width * 0.1));
    this.doorCells = [];
    this.build();
  }

  build() {
    this.addCanopy();
    this.addOpeningStick();
    this.addDoorFlap();
  }

  place(world) {
    this.paintInterior(world);
    super.place(world);
  }

  paintInterior(world) {
    const half = Math.floor(this.width / 2);
    for (let level = 0; level <= this.height; level++) {
      const y = -this.height + level;
      const edge = Math.max(0, Math.round((half * level) / this.height));
      for (let x = -edge; x <= edge; x++) {
        const index = this.cellIndex(world, x, y);
        if (index < 0) continue;
        world.setCell(index, MATERIAL.CLOTH, 0, {
          force: true,
          flags: CELL_FLAGS.NO_GRAVITY,
          color: this.interiorColor,
        });
      }
    }
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
        if (this.isDoorOpening(x, y)) continue;
        this.addCloth(x, y, 5 + level * this.width + x, this.interiorColor, 'canopy-fill');
      }
      if (level > 4 && level < this.height - 1) {
        if (level % 3 === 0) this.addCloth(left + 1, y, 2, this.clothColor);
        if (level % 4 === 0) this.addCloth(right - 1, y, 3, this.shadowColor);
      }
    }
  }

  isDoorOpening(x, y) {
    const doorTop = -this.doorHeight;
    if (y < doorTop) return false;
    const progress = (y - doorTop) / Math.max(1, this.doorHeight);
    const flapWidth = Math.round(this.doorWidth * progress);
    const travelSpace = Math.round(this.doorTravel * progress);
    return Math.abs(x) <= flapWidth + travelSpace;
  }

  addOpeningStick() {
    const stickTop = -Math.floor(this.height * 0.78);
    for (let y = 0; y >= stickTop; y--) {
      this.addCell({ id: `stick-${y}`, dx: 0, dy: y, material: MATERIAL.WOOD, flags: CELL_FLAGS.NO_GRAVITY, role: 'stick' });
    }
  }

  addDoorFlap() {
    for (let row = 0; row <= this.doorHeight; row++) {
      const y = -this.doorHeight + row;
      const rowWidth = Math.round((this.doorWidth * row) / this.doorHeight);
      for (let x = -rowWidth; x <= rowWidth; x++) {
        if (x === 0) continue;
        const flapColor = x < 0 ? this.clothColor : this.shadowColor;
        const cell = this.addCloth(x, y, 12 + row + x, flapColor, 'door');
        cell.doorSide = Math.sign(x);
        cell.windScale = row / this.doorHeight;
        this.doorCells.push(cell);
      }
    }
  }

  addCloth(dx, dy, value, color, role = 'canopy') {
    return this.addCell({ id: `${role}-${dx}-${dy}-${value}`, dx, dy, material: MATERIAL.CLOTH, value, color, flags: CELL_FLAGS.NO_GRAVITY, role });
  }

  isInsideTent(dx, dy) {
    if (dy < -this.height || dy > 0) return false;
    const level = dy + this.height;
    const edge = Math.max(0, Math.round((Math.floor(this.width / 2) * level) / this.height));
    return Math.abs(dx) <= edge;
  }

  clearCell(world, dx, dy) {
    if (!this.isInsideTent(dx, dy)) return super.clearCell(world, dx, dy);
    const index = this.cellIndex(world, dx, dy);
    if (index < 0) return false;
    return world.setCell(index, MATERIAL.CLOTH, 0, {
      force: true,
      flags: CELL_FLAGS.NO_GRAVITY,
      color: this.interiorColor,
    });
  }

  update(world) {
    if (!this.placed) this.place(world);
    if (this.refreshCells(world) === 0) return;

    for (const cell of this.doorCells) {
      if (!cell.alive) continue;
      const opening = (Math.sin(world.tick * 0.075) + 1) * 0.5;
      const flutter = Math.sin(world.tick * 0.17 + cell.baseDy * 0.42 + cell.doorSide * 0.8) * 0.45;
      const spread = Math.max(0, Math.round((opening * this.doorTravel + flutter) * cell.windScale));
      this.moveCell(world, cell, cell.baseDx + cell.doorSide * spread, cell.baseDy);
    }
  }
}
