import { MATERIAL } from '../pixel/Pixel.js';
import { CloudObject } from '../pixel/objects/sky/CloudObject.js';
import { SunObject } from '../pixel/objects/sky/SunObject.js';

export class DaySkyTerrainGenerator {
  static generate(world, options = {}) {
    const layerName = options.layer ?? 'backdrop';
    const sunX = options.sunX ?? Math.round(world.width * 0.82);
    const sunY = options.sunY ?? Math.round(world.height * 0.17);
    const sunRadius = options.sunRadius ?? Math.max(8, Math.round(world.height * 0.035));

    world.withLayer(layerName, () => {
      for (let i = 0; i < world.total; i++) {
        world.setCell(i, MATERIAL.PLASMA, 90, { force: true, flags: 0, color: [53, 132, 205], silent: true });
      }

      const clouds = options.clouds ?? [
        [0.18, 0.2, 0.12, 0.035],
        [0.48, 0.12, 0.15, 0.04],
        [0.7, 0.29, 0.11, 0.032],
      ];
      world.addBackdropObject(new SunObject({ x: sunX, y: sunY, radius: sunRadius, layer: layerName }));
      for (const [cx, cy, rx, ry] of clouds) {
        world.addBackdropObject(new CloudObject({
          x: Math.round(cx * world.width),
          y: Math.round(cy * world.height),
          width: Math.max(8, Math.round(rx * world.width * 2)),
          height: Math.max(6, Math.round(ry * world.height * 2)),
          layer: layerName,
        }));
      }
    });
  }
}
