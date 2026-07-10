import { PlantGrowthHelper } from '../pixel/helpers/PlantGrowthHelper.js';

export class GrownTreesTerrainGenerator {
  static generate(world, options = {}) {
    const layer = options.layer ?? 'background';
    const trees = options.trees ?? [
      { x: Math.round(world.width * 0.18), y: world.height - 29, energy: 255 },
      { x: Math.round(world.width * 0.78), y: world.height - 29, energy: 255 },
    ];
    const attempts = options.attempts ?? 220;

    world.withLayer(layer, () => {
      for (const tree of trees) {
        for (let attempt = 0; attempt < attempts; attempt++) {
          PlantGrowthHelper.tryGrowTree(world, tree.x, tree.y, tree.energy ?? 255);
        }
      }
    });
  }
}
