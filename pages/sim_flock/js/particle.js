'use strict';

export class Particle {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;

        this.vx = options.vx ?? 0;
        this.vy = options.vy ?? 0;

        this.radius = options.radius ?? 2;
        this.color = options.color ?? '#ffffff';
    }
}