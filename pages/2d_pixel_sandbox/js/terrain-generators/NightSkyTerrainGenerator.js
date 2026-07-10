import { MATERIAL } from '../pixel/Pixel.js';
import { MoonObject } from '../pixel/objects/sky/MoonObject.js';
import { StarObject } from '../pixel/objects/sky/StarObject.js';

export class NightSkyTerrainGenerator {
  static generate(world, options = {}) {
    const layerName = options.layer ?? 'backdrop';
    const starChance = options.starChance ?? 0.000045;
    const seed = options.seed ?? 7319;

    world.withLayer(layerName, () => {
      for (let index = 0; index < world.total; index++) {
        world.setCell(index, MATERIAL.PLASMA, 90, { force: true, flags: 0, color: [8, 15, 35], silent: true });
      }

      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          const hash = this.hash(x, y, seed);
          if (hash / 0xffffffff < starChance) {
            world.addBackdropObject(new StarObject({
              x,
              y,
              radius: hash % 7 === 0 ? 2 : 1,
              layer: layerName,
            }));
          }
        }
      }

      world.addBackdropObject(new MoonObject({
        x: options.moonX ?? Math.round(world.width * 0.82),
        y: options.moonY ?? Math.round(world.height * 0.16),
        radius: options.moonRadius ?? Math.max(9, Math.round(world.height * 0.04)),
        crescent: options.moonCrescent ?? 0,
        layer: layerName,
      }));
    });
  }

  static hash(x, y, seed) {
    let value = Math.imul(x + seed, 374761393) + Math.imul(y + seed, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return (value ^ (value >>> 16)) >>> 0;
  }
}
