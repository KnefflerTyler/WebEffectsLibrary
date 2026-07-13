import { MATERIAL, Pixel } from '../Pixel.js';
import { explodeDynamite } from '../helpers/DynamiteExplosionHelper.js';

export class DynamitePixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.DYNAMITE,
      name: 'dynamite',
      color: [196, 42, 34],
      weight: 72,
      swapBuffer: 10,
      displaceable: true,
      waterproof: true,
      reactsWhileStatic: true,
      igniteTemperature: 260,
      acceptsDisplacementFrom: new Set([
        MATERIAL.WATER,
        MATERIAL.FIRE,
        MATERIAL.SMOKE,
        MATERIAL.STEAM,
        MATERIAL.ASH,
      ]),
    });
  }

  renderColor(tone) {
    const stripe = tone % 9 < 2 ? 24 : 0;
    return [this.color[0] + stripe, this.color[1] + stripe, this.color[2] + stripe];
  }

  update(world, i, x, y, isStatic = false) {
    if (this.shouldDetonate(world, i, x, y)) {
      explodeDynamite(world, i, x, y);
      return;
    }

    if (isStatic || world.hasNoGravity(i)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (Math.random() < 0.16) world.tryDisplaceInto(i, x + dir, y + 1, 1);
  }

  shouldDetonate(world, i, x, y) {
    return world.temperature[i] >= this.igniteTemperature;
  }
}
