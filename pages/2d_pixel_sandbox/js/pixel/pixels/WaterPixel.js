import { MATERIAL, Pixel } from '../Pixel.js';

export class WaterPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.WATER,
      name: 'water',
      color: [48, 132, 210],
      weight: 35,
      displaceable: true,
      extinguishPower: 1,
      plantMoisture: 22,
      plantConsumesTo: MATERIAL.SPACE,
      temperature: 20,
    });
  }

  renderColor(tone) {
    const wobble = (tone % 23) - 11;
    return [
      this.color[0] + wobble,
      this.color[1] + Math.floor(wobble * 0.6),
      this.color[2] + (tone % 18),
    ];
  }

  update(world, i, x, y) {
    if (world.temperature[i] >= 100) {
      world.setCell(i, MATERIAL.STEAM, 18, { force: world.isStatic(i), temperature: 100 });
      world.touched[i] = world.tick;
      return;
    }

    if (world.tryWaterReactWithNeighbor(i, x, y + 1)) return;

    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (world.tryDisplaceInto(i, x + dir, y + 1, 1)) return;
    if (world.tryDisplaceInto(i, x - dir, y + 1, 1)) return;
    if (world.tryWaterReactWithNeighbor(i, x + dir, y)) return;
    if (world.tryWaterReactWithNeighbor(i, x - dir, y)) return;

    const spread = 1 + Math.floor(Math.random() * 4);
    let rightBlocked = false;
    let leftBlocked = false;
    for (let d = 1; d <= spread; d++) {
      const rightX = x + dir * d;
      const leftX = x - dir * d;
      if (!rightBlocked) {
        rightBlocked = !world.inBounds(rightX, y) || world.getPixelAtIndex(world.index(rightX, y)).waterproof;
        if (!rightBlocked && world.tryDisplaceInto(i, rightX, y, 0)) return;
      }
      if (!leftBlocked) {
        leftBlocked = !world.inBounds(leftX, y) || world.getPixelAtIndex(world.index(leftX, y)).waterproof;
        if (!leftBlocked && world.tryDisplaceInto(i, leftX, y, 0)) return;
      }
    }
  }
}
