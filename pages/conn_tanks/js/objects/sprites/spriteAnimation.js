export class SpriteAnimation {
  constructor({ name = '', row = 0, startCol = 0, endCol = 0, fps = 8, loop = true } = {}) {
    this.name = name;
    this.row = row;
    this.startCol = startCol;
    this.endCol = endCol;
    this.fps = fps;
    this.loop = loop;
  }

  get frameCount() {
    return Math.max(1, this.endCol - this.startCol + 1);
  }

  frameAt(elapsed) {
    const index = Math.floor(elapsed * this.fps);
    const frame = this.loop
      ? index % this.frameCount
      : Math.min(index, this.frameCount - 1);
    return this.startCol + frame;
  }
}

export default SpriteAnimation;
