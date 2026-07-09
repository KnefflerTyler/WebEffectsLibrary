import { CELL_FLAGS } from './PixelWorld.js';
import { MATERIAL, PIXEL_BY_ID } from './pixel/pixelRegistry.js';

export class PixelRenderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.canvas.width = world.width;
    this.canvas.height = world.height;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.backCanvas = document.createElement('canvas');
    this.backCanvas.width = world.width;
    this.backCanvas.height = world.height;
    this.backCtx = this.backCanvas.getContext('2d', { alpha: false });
    this.staticCanvas = document.createElement('canvas');
    this.staticCanvas.width = world.width;
    this.staticCanvas.height = world.height;
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.staticVersion = -1;
    this.image = this.backCtx.createImageData(world.width, world.height);
  }

  render() {
    const { cells, data, shade, total } = this.world;
    const out = this.image.data;
    let p = 0;
    let pixels = 0;
    let fires = 0;
    let waters = 0;

    for (let i = 0; i < total; i++) {
      const type = cells[i];
      const [r, g, b] = PIXEL_BY_ID[type].renderColor(shade[i], data[i]);
      out[p++] = r;
      out[p++] = g;
      out[p++] = b;
      out[p++] = 255;
      if (type !== MATERIAL.SPACE && !PIXEL_BY_ID[type].gas) pixels++;
      if (type === MATERIAL.FIRE) fires++;
      if (type === MATERIAL.WATER) waters++;
    }

    this.backCtx.putImageData(this.image, 0, 0);
    this.drawStaticHighlights();
    this.ctx.drawImage(this.backCanvas, 0, 0);
    return { pixels, fires, waters };
  }

  drawStaticHighlights() {
    const { cells, flags, width, total } = this.world;
    if (this.staticVersion === this.world.flagsVersion) {
      this.backCtx.drawImage(this.staticCanvas, 0, 0);
      return;
    }

    this.staticCtx.clearRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);
    this.staticCtx.save();
    this.staticCtx.lineWidth = 1;

    for (let i = 0; i < total; i++) {
      if ((flags[i] & CELL_FLAGS.STATIC) === 0) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      this.staticCtx.strokeStyle = this.staticStrokeFor(cells[i]);
      this.staticCtx.strokeRect(x + 0.15, y + 0.15, 0.7, 0.7);
    }

    this.staticCtx.restore();
    this.staticVersion = this.world.flagsVersion;
    this.backCtx.drawImage(this.staticCanvas, 0, 0);
  }

  staticStrokeFor(type) {
    const [r, g, b] = PIXEL_BY_ID[type].color;
    return `rgba(${Math.min(255, r + 96)}, ${Math.min(255, g + 96)}, ${Math.min(255, b + 96)}, 0.92)`;
  }
}
