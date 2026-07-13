import { MATERIAL } from '../Pixel.js';

export class CombustionHelper {
  static hasOxygenNear(world, x, y) {
    return world.hasNeighborWhereAcrossLayers(x, y, (pixel) => pixel.oxygen > 0);
  }

  static consumeOxygenNear(world, x, y, chance = 0.55) {
    return world.hasNeighborWhereAcrossLayers(x, y, (pixel, n) => {
      if (pixel.oxygen <= 0) return false;
      if (!world.isStatic(n) && Math.random() < chance * pixel.oxygen) {
        world.setCell(n, MATERIAL.SPACE, 0, { flags: 0 });
        world.touched[n] = world.tick;
      }
      return true;
    });
  }
}
