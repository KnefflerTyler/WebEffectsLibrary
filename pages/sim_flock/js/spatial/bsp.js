"use strict";

// Lightweight Axis-Aligned Binary Space Partitioning tree for 2D colliders.
// Not a full BSP used for rendering — used here as a binary KD-style tree
// that recursively splits along the longest axis to accelerate range queries.

function rectIntersects(r1, r2) {
    return !(r2.minX > r1.maxX || r2.maxX < r1.minX || r2.minY > r1.maxY || r2.maxY < r1.minY);
}

function bboxOf(item) {
    if (!item) return null;
    if (item.minX !== undefined && item.minY !== undefined && item.maxX !== undefined && item.maxY !== undefined) {
        return { minX: item.minX, minY: item.minY, maxX: item.maxX, maxY: item.maxY };
    }

    // SpriteCollider-like: has worldPos() and radius (circle-only now)
    if (typeof item.worldPos === 'function') {
        const p = item.worldPos() || {};
        if (p.x !== undefined && p.y !== undefined) {
            const r = item.radius || 4;
            return { minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r };
        }
    }

    // Plain circle-like object
    if (item.x !== undefined && item.y !== undefined && item.r !== undefined) {
        return { minX: item.x - item.r, minY: item.y - item.r, maxX: item.x + item.r, maxY: item.y + item.r };
    }

    return null;
}

class BSPNode {
    constructor(items = [], depth = 0, maxDepth = 16, leafSize = 8) {
        this.items = null;
        this.left = null;
        this.right = null;
        this.box = null;

        if (!items || items.length === 0) return;

        // compute bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const bboxes = [];
        for (const it of items) {
            const bb = bboxOf(it);
            if (!bb) continue;
            bboxes.push({ it, bb });
            if (bb.minX < minX) minX = bb.minX;
            if (bb.minY < minY) minY = bb.minY;
            if (bb.maxX > maxX) maxX = bb.maxX;
            if (bb.maxY > maxY) maxY = bb.maxY;
        }

        if (!isFinite(minX)) {
            this.items = items.slice();
            return;
        }

        this.box = { minX, minY, maxX, maxY };

        // leaf
        if (items.length <= leafSize || depth >= maxDepth) {
            this.items = items.slice();
            return;
        }

        // choose split axis by longest span
        const spanX = maxX - minX;
        const spanY = maxY - minY;
        const axis = spanX >= spanY ? 'x' : 'y';
        const split = axis === 'x' ? minX + spanX / 2 : minY + spanY / 2;

        const left = [];
        const right = [];

        for (const { it, bb } of bboxes) {
            const center = (axis === 'x') ? (bb.minX + bb.maxX) / 2 : (bb.minY + bb.maxY) / 2;
            if (center <= split) left.push(it); else right.push(it);
        }

        // if unbalanced, fall back to half-slicing original array to avoid degenerate recursion
        if (left.length === 0 || right.length === 0) {
            const half = Math.ceil(items.length / 2);
            this.left = new BSPNode(items.slice(0, half), depth + 1, maxDepth, leafSize);
            this.right = new BSPNode(items.slice(half), depth + 1, maxDepth, leafSize);
            return;
        }

        this.left = new BSPNode(left, depth + 1, maxDepth, leafSize);
        this.right = new BSPNode(right, depth + 1, maxDepth, leafSize);
    }

    queryBox(minX, minY, maxX, maxY, out = []) {
        const q = { minX, minY, maxX, maxY };
        if (!this.box || !rectIntersects(this.box, q)) return out;

        if (this.items) {
            for (const it of this.items) {
                const bb = bboxOf(it);
                if (!bb) continue;
                if (rectIntersects(bb, q)) out.push(it);
            }
            return out;
        }

        if (this.left) this.left.queryBox(minX, minY, maxX, maxY, out);
        if (this.right) this.right.queryBox(minX, minY, maxX, maxY, out);
        return out;
    }
}

export default class BSP {
    constructor(items = [], options = {}) {
        this.root = new BSPNode(items || [], 0, options.maxDepth ?? 16, options.leafSize ?? 8);
    }

    // Rebuild tree
    build(items = [], options = {}) {
        this.root = new BSPNode(items || [], 0, options.maxDepth ?? 16, options.leafSize ?? 8);
    }

    queryBox(minX, minY, maxX, maxY) {
        if (!this.root) return [];
        return this.root.queryBox(minX, minY, maxX, maxY, []);
    }
}
