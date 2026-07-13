import { MATERIAL, Pixel } from '../Pixel.js';

export class PlasticPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.PLASTIC,
      name: 'plastic',
      color: [220, 65, 48],
      usesCustomColor: true,
      weight: 42,
      swapBuffer: 7,
      displaceable: true,
      waterproof: true,
      scorchable: true,
      scorchTo: MATERIAL.SMOKE,
      acceptsDisplacementFrom: new Set([MATERIAL.WATER, MATERIAL.FIRE, MATERIAL.SMOKE, MATERIAL.STEAM, MATERIAL.ASH]),
    });
  }

  renderColor(tone, value, tint = this.color) {
    const shine = tone % 7 === 0 ? 18 : 0;
    const wobble = (tone % 11) - 5;
    return [tint[0] + shine + wobble, tint[1] + shine + wobble, tint[2] + shine + wobble];
  }

  update(world, i, x, y) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (Math.random() < 0.08) world.tryDisplaceInto(i, x + dir, y + 1, 1);
  }
}
