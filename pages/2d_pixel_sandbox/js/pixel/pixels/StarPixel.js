import { MATERIAL, Pixel } from '../Pixel.js';

export class StarPixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.STAR,
      name: 'star',
      color: [255, 250, 220],
      usesCustomColor: true,
      gas: true,
      opacity: 1,
      emissive: 1,
    });
  }

  renderColor(tone, intensity = 0, tint = this.color) {
    const shimmer = Math.min(8, Math.floor(intensity / 32)) + tone % 3;
    return tint.map((channel) => Math.min(255, channel + shimmer));
  }
}
