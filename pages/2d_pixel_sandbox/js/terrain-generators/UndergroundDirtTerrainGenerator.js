import { MATERIAL } from '../pixel/Pixel.js';

const DEFAULT_COLORS = ['#a77b48', '#936438', '#7f522f', '#684027'];

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(value, fallback) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

export class UndergroundDirtTerrainGenerator {
  static generate(world, options = {}) {
    const layer = options.layer ?? 'foreground';
    const startY = Math.max(0, Math.min(world.height - 1, options.startY ?? Math.round(world.height * 0.78)));
    const seed = Number.isInteger(options.seed) ? options.seed : 4831;
    const scale = Math.max(2, options.noiseScale ?? 13);
    const noiseStrength = Math.max(0, Math.min(1, options.noiseStrength ?? 0.2));
    const speckleChance = Math.max(0, Math.min(0.35, options.speckleChance ?? 0.055));
    const requestedColors = Array.isArray(options.colors) && options.colors.length >= 2 ? options.colors : DEFAULT_COLORS;
    const colors = requestedColors.map((color, index) => parseHexColor(color, parseHexColor(DEFAULT_COLORS[index % DEFAULT_COLORS.length], [137, 103, 58])));
    const depthRange = Math.max(1, world.height - 1 - startY);

    world.withLayer(layer, () => {
      for (let y = startY; y < world.height; y++) {
        const depth = (y - startY) / depthRange;
        for (let x = 0; x < world.width; x++) {
          const index = world.index(x, y);
          if (world.cells[index] !== MATERIAL.DIRT) continue;

          const coarse = this.valueNoise(x / scale, y / scale, seed);
          const fine = this.hash(x, y, seed + 991) * 2 - 1;
          const strata = Math.sin(y * 0.48 + coarse * 2.7 + x * 0.018);
          const warpedDepth = Math.max(0, Math.min(1, depth + coarse * 0.09 + strata * 0.025));
          let color = this.sampleGradient(colors, warpedDepth);

          if (this.hash(x, y, seed + 2027) < speckleChance) {
            const stop = Math.min(colors.length - 1, Math.floor(this.hash(x, y, seed + 4051) * colors.length));
            color = colors[stop];
          }

          const variation = (coarse * 0.72 + fine * 0.18 + strata * 0.1) * noiseStrength * 42;
          world.tintR[index] = clampByte(color[0] + variation);
          world.tintG[index] = clampByte(color[1] + variation * 0.72);
          world.tintB[index] = clampByte(color[2] + variation * 0.45);
          world.markRenderDirty(index);
        }
      }
    });
  }

  static sampleGradient(colors, amount) {
    const position = amount * (colors.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(colors.length - 1, lower + 1);
    const mix = position - lower;
    return colors[lower].map((channel, index) => channel + (colors[upper][index] - channel) * mix);
  }

  static valueNoise(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const top = this.lerp(this.hash(x0, y0, seed), this.hash(x0 + 1, y0, seed), sx);
    const bottom = this.lerp(this.hash(x0, y0 + 1, seed), this.hash(x0 + 1, y0 + 1, seed), sx);
    return this.lerp(top, bottom, sy) * 2 - 1;
  }

  static hash(x, y, seed) {
    let value = Math.imul(x ^ seed, 374761393) + Math.imul(y + seed, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
  }

  static lerp(a, b, amount) {
    return a + (b - a) * amount;
  }
}
