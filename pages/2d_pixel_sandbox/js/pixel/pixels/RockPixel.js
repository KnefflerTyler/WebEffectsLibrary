import { MATERIAL, Pixel } from '../Pixel.js';

export class RockPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.ROCK,
      name: 'rock',
      color: [104, 103, 96],
      weight: 120,
      swapBuffer: 18,
      displaceable: true,
      acceptsDisplacementFrom: new Set([MATERIAL.WATER, MATERIAL.FIRE, MATERIAL.SMOKE, MATERIAL.STEAM, MATERIAL.ASH]),
      rootGrowThrough: true,
    });
  }

  renderColor(tone) {
    const chip = tone % 5 === 0 ? 18 : 0;
    const wobble = (tone % 17) - 8;
    return [
      this.color[0] + Math.floor(wobble * 0.7) + chip,
      this.color[1] + Math.floor(wobble * 0.65) + chip,
      this.color[2] + Math.floor(wobble * 0.55) + chip,
    ];
  }

  update(world, i, x, y) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (Math.random() < 0.12) world.tryDisplaceInto(i, x + dir, y + 1, 1);
  }
}
