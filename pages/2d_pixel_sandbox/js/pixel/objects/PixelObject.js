import { CELL_FLAGS } from '../../PixelWorld.js';
import { MATERIAL } from '../Pixel.js';

export class PixelObject {
  constructor({ x, y }) {
    this.x = x;
    this.y = y;
    this.cells = [];
    this.placed = false;
    this.destroyed = false;
  }

  addCell({ id, dx, dy, material, value = 0, color = null, flags = CELL_FLAGS.NO_GRAVITY, role = 'body' }) {
    const cell = {
      id,
      dx,
      dy,
      baseDx: dx,
      baseDy: dy,
      lastDx: dx,
      lastDy: dy,
      material,
      value,
      color,
      flags,
      role,
      alive: true,
    };
    this.cells.push(cell);
    return cell;
  }

  place(world) {
    for (const cell of this.cells) this.paintCell(world, cell);
    this.placed = true;
  }

  update(world) {
    if (!this.placed) this.place(world);
    this.refreshCells(world);
  }

  refreshCells(world) {
    let survivingCells = 0;
    for (const cell of this.cells) {
      cell.alive = this.isOriginalCell(world, cell);
      if (cell.alive) survivingCells++;
    }
    if (survivingCells === 0) this.destroy();
    return survivingCells;
  }

  isOriginalCell(world, cell) {
    const index = this.cellIndex(world, cell.lastDx, cell.lastDy);
    if (index < 0) return false;
    return world.cells[index] === cell.material
      || (world.cells[index] === MATERIAL.FIRE && world.burnSource[index] === cell.material);
  }

  destroy() {
    this.destroyed = true;
    this.placed = false;
  }

  moveCell(world, cell, dx, dy) {
    if (!cell.alive) return false;

    const source = this.cellIndex(world, cell.lastDx, cell.lastDy);
    if (source < 0 || !this.isOriginalCell(world, cell)) {
      cell.alive = false;
      return false;
    }

    if (cell.lastDx === dx && cell.lastDy === dy) return true;

    const state = {
      material: world.cells[source],
      data: world.data[source],
      burnSource: world.burnSource[source],
      tint: [world.tintR[source], world.tintG[source], world.tintB[source]],
      shade: world.shade[source],
      flags: world.flags[source],
    };

    if (!this.hasCellAt(cell.lastDx, cell.lastDy, cell)) this.clearCell(world, cell.lastDx, cell.lastDy);
    cell.dx = dx;
    cell.dy = dy;
    cell.lastDx = dx;
    cell.lastDy = dy;

    const target = this.cellIndex(world, dx, dy);
    if (target < 0) {
      cell.alive = false;
      return false;
    }

    world.setCell(target, state.material, state.data, {
      force: true,
      flags: state.flags,
      color: state.tint,
      burnSource: state.burnSource,
    });
    world.data[target] = state.data;
    world.shade[target] = state.shade;
    return true;
  }

  hasCellAt(dx, dy, excludeCell = null) {
    return this.cells.some((cell) => cell.alive && cell !== excludeCell && cell.dx === dx && cell.dy === dy);
  }

  paintCell(world, cell) {
    const index = this.cellIndex(world, cell.dx, cell.dy);
    if (index < 0) return false;
    return world.setCell(index, cell.material, cell.value, {
      force: true,
      flags: cell.flags,
      color: cell.color ?? undefined,
    });
  }

  clearCell(world, dx, dy) {
    const index = this.cellIndex(world, dx, dy);
    if (index < 0) return false;
    return world.setCell(index, MATERIAL.SPACE, 0, { force: true, flags: 0 });
  }

  cellIndex(world, dx, dy) {
    const x = this.x + dx;
    const y = this.y + dy;
    return world.inBounds(x, y) ? world.index(x, y) : -1;
  }
}
