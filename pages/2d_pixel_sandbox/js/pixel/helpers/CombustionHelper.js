import { MATERIAL } from '../Pixel.js';

export class CombustionHelper {
  static hasOxygenNear(world, x, y) {
    return world.hasNeighborWhere(x, y, (pixel) => pixel.oxygen > 0);
  }

  static consumeOxygenNear(world, x, y, chance = 0.55) {
    let foundOxygen = false;

    world.forNeighbors(x, y, (n) => {
      const pixel = world.getPixelAtIndex(n);
      if (pixel.oxygen <= 0) return true;

      foundOxygen = true;
      if (!world.isStatic(n) && Math.random() < chance * pixel.oxygen) {
        world.setCell(n, MATERIAL.SPACE);
        world.touched[n] = world.tick;
      }
      return false;
    });

    return foundOxygen;
  }
}
