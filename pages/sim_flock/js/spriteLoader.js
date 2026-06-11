'use strict';

import Sprite from './sprite.js';
import { SpriteAnimation } from './spriteAnimation.js';

async function loadJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load JSON: ${url}`);
    try {
        return await res.json();
    } catch (e) {
        // empty or invalid JSON -> return null
        return null;
    }
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
    });
}

// Load a sprite definition JSON and the referenced image. JSON schema (optional):
// {
//   "image": "path/to/sheet.png",
//   "cols": 8,
//   "rows": 4,
//   "animations": {
//      "idle": { "row":0, "startCol":0, "endCol":3, "fps":4, "loop":true },
//      ...
//   }
// }
// Returns: { sprite: Sprite, image: HTMLImageElement }
export async function loadSpriteFromJSON(jsonUrl) {
    const data = await loadJSON(jsonUrl) || {};

    // Resolve jsonUrl relative to page if needed, then use its directory as base
    const resolvedJsonUrl = new URL(jsonUrl, window.location.href).href;
    const base = resolvedJsonUrl.substring(0, resolvedJsonUrl.lastIndexOf('/') + 1);
    const imagePath = data.image ? new URL(data.image, base).href : null;

    console.log('[spriteLoader] loading JSON:', resolvedJsonUrl, 'imagePath:', imagePath);

    // Defaults
    const cols = Number(data.cols) || 1;
    const rows = Number(data.rows) || 1;

    const sprite = new Sprite({ sheetCols: cols, sheetRows: rows });

    // Load image if provided
    let image = null;
    if (imagePath) {
        try {
            image = await loadImage(imagePath);
            console.log('[spriteLoader] loaded image', imagePath, image.width, 'x', image.height);
        } catch (e) {
            console.warn('[spriteLoader] failed to load image', imagePath, e);
        }
    }

    // Add animations from JSON
    if (data.animations && typeof data.animations === 'object') {
        for (const [name, def] of Object.entries(data.animations)) {
            const anim = new SpriteAnimation({
                name,
                row: Number(def.row) || 0,
                startCol: Number(def.startCol) || 0,
                endCol: Number(def.endCol) || 0,
                fps: Number(def.fps) || 8,
                loop: def.loop !== undefined ? !!def.loop : true,
            });
            sprite.addAnimation(anim);
        }
    }

    // If no animations, create a default single-animation per-row or single-cell animation
    if (sprite.animations.size === 0) {
        // If multiple cols, default animation covers entire first row
        const defaultAnim = new SpriteAnimation({
            name: 'default',
            row: 0,
            startCol: 0,
            endCol: Math.max(0, cols - 1),
            fps: 4,
            loop: true,
        });
        sprite.addAnimation(defaultAnim);
    }

    return { sprite, image };
}

// Create a simple 1x1 sprite from a single image URL. Returns { sprite, image }
export async function createSimpleSprite(imageUrl) {
    const image = await loadImage(imageUrl);
    const sprite = new Sprite({ sheetCols: 1, sheetRows: 1 });
    const anim = new SpriteAnimation({ name: 'default', row: 0, startCol: 0, endCol: 0, fps: 1, loop: true });
    sprite.addAnimation(anim);
    sprite.setAnimation('default');
    return { sprite, image };
}

export default { loadSpriteFromJSON, createSimpleSprite };
