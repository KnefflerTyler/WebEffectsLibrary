import { CELL_FLAGS } from '../../PixelWorld.js';
import { MATERIAL } from '../Pixel.js';
import { PixelObject } from './PixelObject.js';

const ROD_COLOR = [116, 75, 39];
const LINE_COLOR = [204, 211, 205];
const BOBBER_RED = [226, 55, 42];
const BOBBER_LIGHT = [232, 222, 184];
const HOOK_COLOR = [174, 188, 196];

export class FishingRodObject extends PixelObject {
  constructor({ x, y, layer = 'background', castDirection = -1, castLength = 31 } = {}) {
    super({ x, y, layer });
    this.castDirection = castDirection < 0 ? -1 : 1;
    this.castLength = Math.max(20, Math.round(castLength));
    this.rigSnapshots = new Map();
    this.buildRod();
  }

  buildRod() {
    const tipX = this.castDirection * 7;
    for (let step = 0; step <= 16; step++) {
      const dx = Math.round(tipX * step / 16);
      const color = step % 5 === 0 ? [139, 91, 47] : ROD_COLOR;
      this.addCell({
        id: `rod-${step}`,
        dx,
        dy: -step,
        material: MATERIAL.WOOD,
        color,
        flags: CELL_FLAGS.STATIC,
        role: 'rod',
      });
    }
    this.addCell({ id: 'rod-handle', dx: -this.castDirection, dy: 0, material: MATERIAL.WOOD, color: [82, 52, 31], flags: CELL_FLAGS.STATIC, role: 'handle' });
  }

  place(world) {
    super.place(world);
    this.paintRig(world);
  }

  update(world) {
    this.clearRig(world);
    if (!this.placed) this.place(world);
    if (this.refreshCells(world) === 0) return;
    this.paintRig(world);
  }

  getRigCells(tick = 0) {
    const cells = new Map();
    const add = (x, y, material, color, value = 0) => {
      cells.set(`${x},${y}`, { x, y, material, color, value });
    };
    const direction = this.castDirection;
    const tip = { x: direction * 7, y: -16 };
    const bobX = direction * this.castLength + Math.round(Math.sin(tick * 0.045) * 1.2);
    const bobY = 3 + Math.round(Math.sin(tick * 0.13) * 0.8);
    const wind = Math.sin(tick * 0.055) * 3;
    const control = {
      x: tip.x + direction * (10 + wind),
      y: -18 + Math.sin(tick * 0.08 + 1.1) * 2,
    };

    for (let step = 1; step <= 36; step++) {
      const t = step / 36;
      const inverse = 1 - t;
      const x = Math.round(inverse * inverse * tip.x + 2 * inverse * t * control.x + t * t * bobX);
      const y = Math.round(inverse * inverse * tip.y + 2 * inverse * t * control.y + t * t * (bobY - 1));
      add(x, y, MATERIAL.CLOTH, LINE_COLOR, step);
    }

    for (let y = bobY + 2; y <= bobY + 8; y++) add(bobX, y, MATERIAL.CLOTH, LINE_COLOR, y);

    add(bobX, bobY - 1, MATERIAL.PLASTIC, BOBBER_RED);
    for (let x = bobX - 1; x <= bobX + 1; x++) add(x, bobY, MATERIAL.PLASTIC, BOBBER_RED);
    for (let x = bobX - 1; x <= bobX + 1; x++) add(x, bobY + 1, MATERIAL.PLASTIC, BOBBER_LIGHT);

    const hookY = bobY + 8;
    add(bobX, hookY, MATERIAL.METAL, HOOK_COLOR);
    add(bobX, hookY + 1, MATERIAL.METAL, HOOK_COLOR);
    add(bobX - direction, hookY + 1, MATERIAL.METAL, HOOK_COLOR);
    add(bobX - direction, hookY, MATERIAL.METAL, HOOK_COLOR);
    return [...cells.values()];
  }

  paintRig(world) {
    for (const cell of this.getRigCells(world.tick)) this.paintRigCell(world, cell);
  }

  paintRigCell(world, cell) {
    const index = this.cellIndex(world, cell.x, cell.y);
    if (index < 0) return;
    if (!this.rigSnapshots.has(index)) {
      this.rigSnapshots.set(index, {
        material: world.cells[index],
        data: world.data[index],
        temperature: world.temperature[index],
        burnSource: world.burnSource[index],
        tint: [world.tintR[index], world.tintG[index], world.tintB[index]],
        shade: world.shade[index],
        flags: world.flags[index],
      });
    }
    world.setCell(index, cell.material, cell.value, {
      force: true,
      flags: CELL_FLAGS.DECORATIVE | CELL_FLAGS.NO_GRAVITY,
      color: cell.color,
      silent: true,
    });
  }

  clearRig(world) {
    for (const [index, state] of this.rigSnapshots) {
      if (!world.isDecorative(index)) continue;
      world.setCell(index, state.material, state.data, {
        force: true,
        flags: state.flags,
        color: state.tint,
        temperature: state.temperature,
        burnSource: state.burnSource,
        silent: true,
      });
      world.data[index] = state.data;
      world.temperature[index] = state.temperature;
      world.burnSource[index] = state.burnSource;
      world.shade[index] = state.shade;
    }
    this.rigSnapshots.clear();
  }
}
