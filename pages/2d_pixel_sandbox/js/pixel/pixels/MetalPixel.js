import { MATERIAL, Pixel } from '../Pixel.js';

export class MetalPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.METAL,
      name: 'metal',
      color: [153, 166, 174],
      usesCustomColor: true,
      weight: 150,
      swapBuffer: 22,
      displaceable: true,
      waterproof: true,
      acceptsDisplacementFrom: new Set([MATERIAL.WATER, MATERIAL.FIRE, MATERIAL.SMOKE, MATERIAL.STEAM, MATERIAL.ASH]),
    });
  }

  renderColor(tone, value, tint = this.color) {
    const shine = tone % 6 === 0 ? 28 : 0;
    const wobble = (tone % 9) - 4;
    return [tint[0] + shine + wobble, tint[1] + shine + wobble, tint[2] + shine + wobble];
  }

  update(world, i, x, y) {
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.04) world.tryDisplaceInto(i, x + dir, y + 1, 1);
  }
}
