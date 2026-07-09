import { MATERIAL, Pixel } from '../Pixel.js';

export class SpacePixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.SPACE,
      name: 'space',
      color: [5, 7, 11],
      displaceable: true,
      plantGrowThrough: true,
    });
  }
}
