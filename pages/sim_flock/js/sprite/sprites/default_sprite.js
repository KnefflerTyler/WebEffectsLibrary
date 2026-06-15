"use strict";

import Sprite from '../sprite.js';
import { loadSpriteFromJSON } from '../spriteLoader.js';

// DefaultSprite — convenience subclass that applies a template (if provided),
// ensures the `default` animation is activated, and attaches a collider.
export default class DefaultSprite extends Sprite {
    // options: same as Sprite plus:
    //  - template: Sprite-like template (map of animations) or null
    //  - image: optional image to set
    //  - collider: collider options passed to Sprite.setCollider()
    constructor(options = {}) {
        // Pass through base sprite options (position, velocity, size, sheet cols/rows)
        super(options);

        // Always load the default template JSON (or the path provided by options.templatePath).
        // This removes the old `template` constructor option — DefaultSprite now manages
        // its own template and collider data from JSON. Callers may await `this.ready`.
        const tplPath = options.templatePath ?? 'assets/data/sprites/sprite_default.json';
        this.ready = loadSpriteFromJSON(tplPath)
            .then(({ sprite: template, image }) => {
                if (template) this.applyTemplate(template, options.image ?? image);
                // prefer template collider if present, otherwise options.collider or sensible default
                const templateCollider = template?.templateCollider ?? template?.collider;
                let colOpt = null;

                if (templateCollider) {
                    // Clone to avoid mutating template data
                    colOpt = Object.assign({}, templateCollider);
                    // If the template collider was defined in terms of the image cell size,
                    // scale it to match this sprite's visual `width`/`height`.
                    const cellW = this.cellWidth || 0;
                    const cellH = this.cellHeight || 0;
                    const useW = this.width || cellW || 0;
                    const useH = this.height || cellH || 0;
                    if (cellW > 0 && cellH > 0 && (useW > 0 || useH > 0)) {
                        const sx = useW / cellW;
                        const sy = useH / cellH;
                        if (colOpt.type === 'circle' && typeof colOpt.radius === 'number') {
                            // scale radius by the larger axis to preserve coverage
                            colOpt.radius = colOpt.radius * Math.max(sx || 1, sy || 1);
                        } else if (colOpt.type === 'aabb') {
                            if (typeof colOpt.width === 'number') colOpt.width = colOpt.width * (sx || 1);
                            if (typeof colOpt.height === 'number') colOpt.height = colOpt.height * (sy || 1);
                            if (typeof colOpt.offsetX === 'number') colOpt.offsetX = colOpt.offsetX * (sx || 1);
                            if (typeof colOpt.offsetY === 'number') colOpt.offsetY = colOpt.offsetY * (sy || 1);
                        }
                    }
                }

                if (!colOpt) colOpt = options.collider ?? { type: 'circle', radius: Math.max(this.width, this.height) / 2 };
                try { this.setCollider(colOpt); } catch (e) { console.warn('DefaultSprite: failed to set collider after load', e); }
                try { if (this.animations.has('default')) this.setAnimation('default'); } catch (e) {}
                return { template, image };
            })
            .catch(e => { console.warn('DefaultSprite: failed to load default template', e); return null; });
    }
}
