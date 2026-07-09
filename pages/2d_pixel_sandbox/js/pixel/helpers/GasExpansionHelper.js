import { MATERIAL } from '../Pixel.js';

export class GasExpansionHelper {
  static tryMoveIntoSpace(world, i, x, y, options = {}) {
    if (world.isStatic(i) || world.hasNoGravity(i)) return false;

    const candidates = this.spaceCandidates(world, x, y, options);
    if (candidates.length === 0) return false;

    const target = candidates[Math.floor(Math.random() * candidates.length)];
    world.moveInto(i, target);
    return true;
  }

  static spaceCandidates(world, x, y, { upwardBias = 0 } = {}) {
    const candidates = [];

    for (let yy = -1; yy <= 1; yy++) {
      for (let xx = -1; xx <= 1; xx++) {
        if (xx === 0 && yy === 0) continue;
        const nx = x + xx;
        const ny = y + yy;
        if (!world.inBounds(nx, ny)) continue;

        const index = world.index(nx, ny);
        if (world.isStatic(index) || world.cells[index] !== MATERIAL.SPACE) continue;

        candidates.push(index);
        if (yy < 0) {
          for (let extra = 0; extra < upwardBias; extra++) candidates.push(index);
        }
      }
    }

    return candidates;
  }
}
