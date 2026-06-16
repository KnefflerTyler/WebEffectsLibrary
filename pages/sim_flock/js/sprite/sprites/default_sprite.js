"use strict";

import Sprite from '../sprite.js';
import { loadSpriteFromJSON } from '../spriteLoader.js';

export default class DefaultSprite extends Sprite {
    constructor(options = {}) {
        super(options);
        if (options.template) {
            this.applyTemplate(options.template, options.image);
        }
        if (options.collider) {
            this.setCollider(options.collider);
        }
        if (this.animations.has('default')) {
            this.setAnimation('default');
        }
    }
}
