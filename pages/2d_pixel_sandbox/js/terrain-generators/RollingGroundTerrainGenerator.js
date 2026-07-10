import { MATERIAL } from '../pixel/Pixel.js';

export class RollingGroundTerrainGenerator {
  static generate(world, options = {}) {
    const layerName = options.layer ?? 'background';
    const baseY = options.baseY ?? world.height - 58;
    const amplitude = options.amplitude ?? 12;
    const frequency = options.frequency ?? 0.025;
    const surfaceDepth = options.surfaceDepth ?? 2;

    world.withLayer(layerName, () => {
      for (let x = 0; x < world.width; x++) {
        const surfaceY = Math.round(baseY + Math.sin(x * frequency) * amplitude + Math.sin(x * frequency * 0.37) * amplitude * 0.45);
        for (let y = Math.max(0, surfaceY); y < world.height; y++) {
          const material = y < surfaceY + surfaceDepth ? MATERIAL.GRASS : MATERIAL.DIRT;
          world.setCell(world.index(x, y), material, 0, { force: true, flags: 0, silent: true });
        }
      }
    });
  }
}
