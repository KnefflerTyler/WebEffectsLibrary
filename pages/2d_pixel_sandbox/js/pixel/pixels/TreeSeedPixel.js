import { MATERIAL, Pixel } from '../Pixel.js';
import { TreeObject } from '../objects/TreeObject.js';

export class TreeSeedPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.SEED,
      name: 'seed',
      color: [191, 145, 68],
      weight: 62,
      displaceable: true,
      flammability: 0.045,
      igniteTemperature: 260,
      scorchable: true,
      scorchTo: MATERIAL.ASH,
    });
  }

  getInitialData(value = 0) {
    return value || 16;
  }

  renderColor(tone, growth) {
    const sprout = Math.min(1, growth / 96);
    const wobble = (tone % 13) - 6;
    return [
      165 + Math.floor(34 * (1 - sprout)) + wobble,
      108 + Math.floor(58 * sprout) + wobble,
      48 + Math.floor(18 * sprout),
    ];
  }

  update(world, i, x, y) {
    if (world.isStatic(i)) return;
    if (world.tryIgniteFromNeighbors(i, x, y)) return;

    const existingTree = world.objects.some((object) => object.ownsSeed?.(world.activeLayerName, x, y));
    if (existingTree) {
      world.keepActive(i);
      return;
    }

    if (!world.hasNoGravity(i)) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
      if (world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
      if (world.tryDisplaceInto(i, x - dir, y + 1, 1)) return;
    }

    world.addObject(new TreeObject({ x, y, layer: world.activeLayerName, energy: world.data[i] }));
    world.keepActive(i);
  }
}
