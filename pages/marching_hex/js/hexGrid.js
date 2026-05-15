/**
 * Builds a flat (Y=0) hexagonal grid geometry for one terrain chunk.
 *
 * Layout: pointy-top hexagons tiling the XZ plane.
 *   Each hex contributes:
 *     • 1 unique center vertex
 *     • up to 6 corner vertices (shared with neighbouring hexes)
 *     • 6 triangles fan-triangulated from the center:
 *         (center, corner[(i+1)%6], corner[i])  — CCW from above
 *
 * Vertex sharing is achieved by keying world XZ positions rounded to 4
 * decimal places so that the same physical corner is never duplicated.
 *
 * Pointy-top spacing formulas:
 *   horizontal pitch  dx = sqrt(3) * size
 *   vertical pitch    dz = 1.5     * size
 *   odd rows are shifted +dx/2 in X
 *
 * @param {number} ox    World X origin of this chunk.
 * @param {number} oz    World Z origin of this chunk.
 * @param {number} cols  Number of hexagons along X per chunk.
 * @param {number} rows  Number of hexagons along Z per chunk.
 * @param {number} size  Hexagon circumradius (center → corner), world units.
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function buildHexChunk(ox, oz, cols, rows, size) {
    const SQRT3 = Math.sqrt(3);
    const dx    = SQRT3 * size;   // column pitch
    const dz    = 1.5   * size;   // row pitch

    const posArr = [];            // flat [x, 0, z, ...]
    const idxArr = [];
    const vertexMap = new Map();  // "kx,kz" → buffer index

    /**
     * Return (or create) the index of the vertex at world (x, z).
     * Coordinates are rounded to 4 d.p. to merge floating-point near-copies.
     */
    function getVertex(x, z) {
        const kx  = Math.round(x * 10000);
        const kz  = Math.round(z * 10000);
        const key = `${kx},${kz}`;
        if (vertexMap.has(key)) return vertexMap.get(key);
        const idx = posArr.length / 3;
        posArr.push(x, 0, z);
        vertexMap.set(key, idx);
        return idx;
    }

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // World-space center of this hex
            const cx = ox + col * dx + (row & 1) * (dx * 0.5);
            const cz = oz + row * dz;

            const centerIdx = getVertex(cx, cz);

            // 6 corner vertices.  Angle 0 = top (−Z), going clockwise in XZ.
            //   corner i: angle = (π/3) * i
            //   x-offset =  size * sin(angle)
            //   z-offset = -size * cos(angle)
            const corners = new Array(6);
            for (let i = 0; i < 6; i++) {
                const a  = (Math.PI / 3) * i;
                corners[i] = getVertex(
                    cx + size * Math.sin(a),
                    cz - size * Math.cos(a),
                );
            }

            // 6 triangles — CCW winding viewed from +Y
            for (let i = 0; i < 6; i++) {
                idxArr.push(centerIdx, corners[(i + 1) % 6], corners[i]);
            }
        }
    }

    return {
        positions: new Float32Array(posArr),
        indices:   new Uint32Array(idxArr),
    };
}
