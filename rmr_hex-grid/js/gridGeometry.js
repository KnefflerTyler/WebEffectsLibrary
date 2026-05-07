// ── Edge-deduplication helpers ────────────────────────────────────────────────

const PREC  = 10;
const round = v => Math.round(v * PREC) / PREC;

function edgeKey(x1, y1, x2, y2) {
    const ax = round(x1), ay = round(y1);
    const bx = round(x2), by = round(y2);
    if (ax < bx || (ax === bx && ay <= by)) return `${ax},${ay}|${bx},${by}`;
    return `${bx},${by}|${ax},${ay}`;
}

function addEdge(seen, verts, x1, y1, x2, y2) {
    const key = edgeKey(x1, y1, x2, y2);
    if (!seen.has(key)) {
        seen.add(key);
        verts.push(x1, y1, 0, x2, y2, 0);
    }
}

// ── Shape builders ────────────────────────────────────────────────────────────

function buildHex(w, h, S, cfg = {}) {
    // Pointy-top hexagons — left and right sides are vertical.  S = circumradius.
    const hx      = Math.sqrt(3) * S;
    const hy      = 1.5 * S;
    const cols    = Math.ceil(w / hx) + 2;
    const rows    = Math.ceil(h / hy) + 2;
    const originX = -((cols - 1) * hx) / 2;
    const originY = -((rows - 1) * hy) / 2;

    const cubeOn          = cfg.cubeFaces === true;
    const cubeInterval    = Math.max(1, Math.round(cfg.cubeFaceInterval    ?? 1));
    const cubeRowInterval = Math.max(1, Math.round(cfg.cubeFaceRowInterval ?? cubeInterval));
    const cubeOffset      = Math.round(cfg.cubeFaceRowOffset ?? 0);

    const seen = new Set(), verts = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const cx = originX + col * hx + (row % 2 === 1 ? hx / 2 : 0);
            const cy = originY + row * hy;
            const vx = [], vy = [];
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3 + Math.PI / 6; // +30° → pointy-top
                vx[i] = cx + S * Math.cos(a);
                vy[i] = cy + S * Math.sin(a);
            }
            // Outer edges (shared, deduped)
            for (let i = 0; i < 6; i++) {
                const j = (i + 1) % 6;
                addEdge(seen, verts, vx[i], vy[i], vx[j], vy[j]);
            }
            // Cube-face interior lines: center → vertices 0 (top-right/30°), 2 (top-left/150°), 4 (bottom/270°)
            // These three spokes split the hex into a top diamond + two side rhombuses — classic cube-from-above.
            if (cubeOn && row % cubeRowInterval === 0) {
                const rowIndex = Math.floor(row / cubeRowInterval);
                const shifted  = ((col - rowIndex * cubeOffset) % cubeInterval + cubeInterval) % cubeInterval;
                if (shifted === 0) {
                    verts.push(cx, cy, 0, vx[0], vy[0], 0);
                    verts.push(cx, cy, 0, vx[2], vy[2], 0);
                    verts.push(cx, cy, 0, vx[4], vy[4], 0);
                }
            }
        }
    }
    return new Float32Array(verts);
}

function buildSquare(w, h, S) {
    // Axis-aligned squares.  S = side length.
    const cols    = Math.ceil(w / S) + 2;
    const rows    = Math.ceil(h / S) + 2;
    const originX = -((cols - 1) * S) / 2;
    const originY = -((rows - 1) * S) / 2;

    const seen = new Set(), verts = [];
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const x0 = originX + col * S;
            const y0 = originY + row * S;
            const x1 = x0 + S, y1 = y0 + S;
            addEdge(seen, verts, x0, y0, x1, y0);
            addEdge(seen, verts, x1, y0, x1, y1);
            addEdge(seen, verts, x1, y1, x0, y1);
            addEdge(seen, verts, x0, y1, x0, y0);
        }
    }
    return new Float32Array(verts);
}

function buildTriangle(w, h, S) {
    // Equilateral triangles, alternating up/down rows.  S = side length.
    const ht      = S * Math.sqrt(3) / 2;
    const slotW   = S / 2;
    const nCols   = Math.ceil(w / slotW) + 4;
    const nRows   = Math.ceil(h / ht)   + 2;
    const originX = -(nCols * slotW) / 2;
    const originY = -(nRows * ht)    / 2;

    const seen = new Set(), verts = [];
    for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < nCols; c++) {
            const x0 = originX + c * slotW;
            const y0 = originY + r * ht;
            const y1 = y0 + ht;
            const xR = x0 + S;

            if ((r + c) % 2 === 0) {
                // Up-pointing ▲
                addEdge(seen, verts, x0, y0, xR, y0);
                addEdge(seen, verts, x0, y0, x0 + slotW, y1);
                addEdge(seen, verts, xR, y0, x0 + slotW, y1);
            } else {
                // Down-pointing ▽
                addEdge(seen, verts, x0, y1, xR, y1);
                addEdge(seen, verts, x0, y1, x0 + slotW, y0);
                addEdge(seen, verts, xR, y1, x0 + slotW, y0);
            }
        }
    }
    return new Float32Array(verts);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a Float32Array of line-segment vertex positions for the given shape.
 * @param {'hex'|'square'|'triangle'} shape
 * @param {number} w  Canvas width in pixels
 * @param {number} h  Canvas height in pixels
 * @param {number} S  Cell size (circumradius for hex, side length for others)
 * @returns {Float32Array}
 */
export function buildGridGeometry(shape, w, h, S, cfg = {}) {
    switch (shape) {
        case 'square':   return buildSquare(w, h, S);
        case 'triangle': return buildTriangle(w, h, S);
        default:         return buildHex(w, h, S, cfg);
    }
}
