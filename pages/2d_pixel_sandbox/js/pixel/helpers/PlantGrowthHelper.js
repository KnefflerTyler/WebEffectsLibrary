import { MATERIAL } from '../Pixel.js';

export class PlantGrowthHelper {
  static consumeMoistureNear(world, x, y, radius = 6) {
    const radiusSq = radius * radius;
    let best = -1;
    let bestMoisture = 0;

    for (let yy = y - radius; yy <= y + radius; yy++) {
      if (yy < 0 || yy >= world.height) continue;
      for (let xx = x - radius; xx <= x + radius; xx++) {
        if (xx < 0 || xx >= world.width) continue;
        const dx = xx - x;
        const dy = yy - y;
        if (dx * dx + dy * dy > radiusSq) continue;

        const index = world.index(xx, yy);
        const pixel = world.getPixelAtIndex(index);
        if (pixel.plantMoisture <= bestMoisture) continue;
        best = index;
        bestMoisture = pixel.plantMoisture;
      }
    }

    if (best === -1) return 0;
    this.consumeMoistureCell(world, best);
    return bestMoisture;
  }

  static consumeMoistureNearPlant(world, x, y, rootRadius = 24) {
    const directMoisture = this.consumeMoistureNear(world, x, y, 5);
    if (directMoisture > 0) return directMoisture;
    return this.consumeMoistureNearRoots(world, x, y, rootRadius, 4);
  }

  static consumeMoistureNearRoots(world, x, y, rootRadius = 24, moistureRadius = 4) {
    const radiusSq = rootRadius * rootRadius;

    for (let yy = y - rootRadius; yy <= y + rootRadius; yy++) {
      if (yy < 0 || yy >= world.height) continue;
      for (let xx = x - rootRadius; xx <= x + rootRadius; xx++) {
        if (xx < 0 || xx >= world.width) continue;
        const dx = xx - x;
        const dy = yy - y;
        if (dx * dx + dy * dy > radiusSq) continue;

        const index = world.index(xx, yy);
        if (world.cells[index] !== MATERIAL.ROOT) continue;

        const moisture = this.consumeMoistureNear(world, xx, yy, moistureRadius);
        if (moisture > 0) return moisture;
      }
    }

    return 0;
  }

  static consumeMoistureCell(world, index) {
    if (world.isStatic(index)) return;

    const pixel = world.getPixelAtIndex(index);
    if (pixel.plantMoistureDrain > 0) {
      world.data[index] = Math.max(0, world.data[index] - pixel.plantMoistureDrain);
      if (world.data[index] === 0 && pixel.plantConsumesTo !== null) {
        world.setCell(index, pixel.plantConsumesTo);
      } else {
        world.touched[index] = world.tick;
        world.markActiveAroundIndex(index);
      }
      return;
    }

    if (pixel.plantConsumesTo !== null) {
      world.setCell(index, pixel.plantConsumesTo);
    }
  }

  static tryGrowTree(world, x, y, energy) {
    const height = Math.min(18, 1 + Math.floor(energy / 14));

    for (let h = 1; h <= height; h++) {
      if (this.isMaterialAt(world, x, y - h, MATERIAL.WOOD)) continue;
      if (this.tryGrowCell(world, x, y - h, MATERIAL.WOOD)) return true;
      break;
    }

    const branchStart = Math.max(4, Math.floor(height * 0.48));
    const branchLength = Math.min(5, Math.floor(energy / 55));
    for (const side of [-1, 1]) {
      for (let length = 1; length <= branchLength; length++) {
        const bx = x + side * length;
        const by = y - branchStart - Math.floor(length * 0.55);
        if (this.isMaterialAt(world, bx, by, MATERIAL.WOOD)) continue;
        if (this.tryGrowCell(world, bx, by, MATERIAL.WOOD)) return true;
        break;
      }
    }

    if (energy < 112) return false;

    const crownY = y - height;
    const radius = Math.min(7, 2 + Math.floor((energy - 112) / 32));
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const oval = dx * dx + dy * dy * 1.35;
        if (oval > radius * radius) continue;
        if (Math.abs(dx) < 2 && dy > 1) continue;
        if (Math.random() > 0.34) continue;

        const lx = x + dx;
        const ly = crownY + dy;
        if (this.isMaterialAt(world, lx, ly, MATERIAL.LEAF)) continue;
        if (this.tryGrowCell(world, lx, ly, MATERIAL.LEAF)) return true;
      }
    }

    return false;
  }

  static tryGrowRootNetwork(world, x, y, energy) {
    const maxDistance = Math.min(28, 8 + Math.floor(energy / 18));
    const target = this.findMoistureTarget(world, x, y, maxDistance + 5);
    const starts = this.collectRootStarts(world, x, y, maxDistance, target);

    for (const start of starts) {
      if (this.tryGrowRootFrom(world, start.x, start.y, target)) return true;
    }

    return false;
  }

  static collectRootStarts(world, x, y, radius, target) {
    const starts = [{ x, y, score: this.rootStartScore(x, y, target) + 4 }];
    const radiusSq = radius * radius;

    for (let yy = y - radius; yy <= y + radius; yy++) {
      if (yy < 0 || yy >= world.height) continue;
      for (let xx = x - radius; xx <= x + radius; xx++) {
        if (xx < 0 || xx >= world.width) continue;
        const dx = xx - x;
        const dy = yy - y;
        if (dx * dx + dy * dy > radiusSq) continue;

        const index = world.index(xx, yy);
        if (world.cells[index] !== MATERIAL.ROOT) continue;
        starts.push({ x: xx, y: yy, score: this.rootStartScore(xx, yy, target) });
      }
    }

    return starts.sort((a, b) => a.score - b.score);
  }

  static rootStartScore(x, y, target) {
    if (!target) return -y;
    const dx = target.x - x;
    const dy = target.y - y;
    return dx * dx + dy * dy;
  }

  static tryGrowRootFrom(world, x, y, target) {
    const directions = this.rootDirections(x, y, target);

    for (const [dx, dy] of directions) {
      if (this.tryGrowRootCell(world, x + dx, y + dy)) return true;
    }

    return false;
  }

  static rootDirections(x, y, target) {
    if (!target) return [[0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0]];

    const sx = Math.sign(target.x - x);
    const sy = Math.sign(target.y - y);
    const directions = [
      [sx, sy],
      [0, sy],
      [sx, 0],
      [-sx, sy],
      [sx, 1],
      [0, 1],
      [-sx, 1],
      [-sx, 0],
    ];

    return directions.filter(([dx, dy], index) => (
      (dx !== 0 || dy !== 0)
      && directions.findIndex(([x2, y2]) => x2 === dx && y2 === dy) === index
    ));
  }

  static tryGrowRootCell(world, x, y) {
    if (!world.inBounds(x, y)) return false;

    const index = world.index(x, y);
    if (world.isStatic(index) || world.cells[index] === MATERIAL.ROOT) return false;

    const pixel = world.getPixelAtIndex(index);
    if (!pixel.rootGrowThrough && pixel.plantMoisture <= 0) return false;

    return world.setCell(index, MATERIAL.ROOT);
  }

  static findMoistureTarget(world, x, y, radius) {
    const radiusSq = radius * radius;
    let best = null;
    let bestScore = Infinity;

    for (let yy = y - radius; yy <= y + radius; yy++) {
      if (yy < 0 || yy >= world.height) continue;
      for (let xx = x - radius; xx <= x + radius; xx++) {
        if (xx < 0 || xx >= world.width) continue;
        const dx = xx - x;
        const dy = yy - y;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) continue;

        const pixel = world.getPixelAtIndex(world.index(xx, yy));
        if (pixel.plantMoisture <= 0) continue;

        const score = distSq - pixel.plantMoisture * 3;
        if (score >= bestScore) continue;
        best = { x: xx, y: yy };
        bestScore = score;
      }
    }

    return best;
  }

  static tryGrowCell(world, x, y, material, value = 0) {
    if (!world.inBounds(x, y)) return false;

    const index = world.index(x, y);
    if (world.isStatic(index)) return false;
    if (!world.getPixelAtIndex(index).plantGrowThrough) return false;

    return world.setCell(index, material, value);
  }

  static isMaterialAt(world, x, y, material) {
    return world.inBounds(x, y) && world.cells[world.index(x, y)] === material;
  }
}
