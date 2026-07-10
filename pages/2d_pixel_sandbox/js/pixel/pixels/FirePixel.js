import { CombustionHelper } from '../helpers/CombustionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

export class FirePixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.FIRE,
      name: 'fire',
      color: [255, 112, 22],
      weight: 10,
      buoyancy: 2,
      displaceable: true,
      burns: true,
      scorchTo: MATERIAL.ASH,
      temperature: 900,
      heatOutput: 160,
    });
  }

  getInitialData(value = 0) {
    return value || 30 + Math.floor(Math.random() * 26);
  }

  renderColor(tone, life) {
    const hot = Math.min(1, life / 36);
    return [
      225 + Math.floor(30 * hot),
      62 + Math.floor(132 * hot) + (tone % 24),
      14 + Math.floor(28 * hot),
    ];
  }

  update(world, i, x, y, isStatic = false) {
    if (world.hasNeighborWhere(x, y, (pixel) => pixel.extinguishPower > 0)) {
      if (isStatic) {
        world.emitIntoNeighbor(x, y, MATERIAL.STEAM, 18, 0.78);
        world.keepActive(i);
      } else {
        world.setCell(i, MATERIAL.STEAM, 18);
      }
      world.touched[i] = world.tick;
      world.consumeExtinguishingNeighbors(x, y, 0.34);
      return;
    }

    if (!CombustionHelper.consumeOxygenNear(world, x, y, 0.22)) {
      world.data[i] = Math.max(0, world.data[i] - 2);
      if (world.data[i] > 0) {
        world.emitIntoNeighbor(x, y, MATERIAL.SMOKE, 12, 0.1);
        world.keepActive(i);
        return;
      }
      const residue = world.getBurnResidue(i);
      world.setCell(i, residue, residue === MATERIAL.SMOKE ? 12 : 0, { force: true, flags: 0 });
      world.touched[i] = world.tick;
      return;
    }

    if (isStatic) {
      world.emitIntoNeighbor(x, y, MATERIAL.SMOKE, 18, 0.06);
      world.heatNeighbors(x, y, this.heatOutput);
      world.tryIgniteHeatedNeighbors(x, y);
      world.scorchLowFlammabilityNeighbors(x, y, 0.005);
      world.touched[i] = world.tick;
      world.keepActive(i);
      return;
    }

    world.data[i] = Math.max(0, world.data[i] - 1);
    world.heatNeighbors(x, y, this.heatOutput);
    world.tryIgniteHeatedNeighbors(x, y);
    world.scorchLowFlammabilityNeighbors(x, y, 0.005);

    if (world.data[i] <= 0 || Math.random() < world.getBurnoutChance(i)) {
      const residue = world.getBurnResidue(i);
      world.setCell(i, residue, residue === MATERIAL.SMOKE ? 16 : 0);
      world.touched[i] = world.tick;
      return;
    }

    if (world.canBurningCellDrift(i)) {
      if (Math.random() < 0.46 && world.tryDisplaceInto(i, x, y - 1, -1)) return;
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.18) world.tryDisplaceInto(i, x + dir, y - 1, -1);
    }
    world.keepActive(i);
  }
}
