import { MATERIAL, Pixel } from '../Pixel.js';

export class PlasmaPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.PLASMA,
      name: 'plasma',
      color: [120, 180, 255],
      usesCustomColor: true,
      weight: 8,
      buoyancy: 10,
      displaceable: true,
      burns: true,
      gas: true,
      gasSpread: 1,
      plantGrowThrough: true,
    });
  }

  getInitialData(value = 0) {
    return value || 90;
  }

  renderColor(tone, intensity = 0, tint = this.color) {
    const glow = Math.min(22, Math.floor(intensity / 6)) + tone % 7;
    return [
      Math.min(255, tint[0] + glow),
      Math.min(255, tint[1] + glow),
      Math.min(255, tint[2] + glow),
    ];
  }

  update(world, i, x, y) {
    if (world.hasNeighborWhere(x, y, (pixel) => pixel.extinguishPower > 0)) {
      world.setCell(i, MATERIAL.STEAM, 18);
      world.touched[i] = world.tick;
      return;
    }

    world.data[i] = Math.max(0, world.data[i] - 1);
    world.igniteFlammableNeighbors(x, y, 3.4);
    if (world.data[i] === 0) {
      world.setCell(i, Math.random() < 0.55 ? MATERIAL.SMOKE : MATERIAL.SPACE, 14);
      return;
    }

    const direction = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.35 && world.tryDisplaceInto(i, x, y - 1, -1)) return;
    if (Math.random() < 0.18) world.tryDisplaceInto(i, x + direction, y - 1, -1);
    world.keepActive(i);
  }
}
