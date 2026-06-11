'use strict';

// Represents a single animation defined within a spritesheet row.
export class SpriteAnimation {
    constructor({ name = '', row = 0, startCol = 0, endCol = 0, fps = 8, loop = true } = {}) {
        this.name = name;
        this.row = row;
        this.startCol = startCol;
        this.endCol = endCol;
        this.fps = fps;
        this.loop = !!loop;
    }

    frameCount() {
        return Math.max(1, this.endCol - this.startCol + 1);
    }
}

export default SpriteAnimation;
