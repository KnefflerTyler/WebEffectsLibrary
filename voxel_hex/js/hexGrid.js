/**
 * Builds a flat (Y=0) hexagonal grid geometry for one terrain chunk.
 * Identical to marching_hex — the GPU vertex shader handles all displacement.
 *
 * Pointy-top layout:  dx = sqrt(3)*size,  dz = 1.5*size
 * Vertex deduplication via rounded-coordinate string keys.
 */
export function buildHexChunk(ox, oz, cols, rows, size) {
    const SQRT3 = Math.sqrt(3);
    const dx    = SQRT3 * size;
    const dz    = 1.5   * size;

    const posArr    = [];
    const idxArr    = [];
    const vertexMap = new Map();

    function getVertex(x, z) {
        const key = `${Math.round(x * 10000)},${Math.round(z * 10000)}`;
        if (vertexMap.has(key)) return vertexMap.get(key);
        const idx = posArr.length / 3;
        posArr.push(x, 0, z);
        vertexMap.set(key, idx);
        return idx;
    }

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const cx = ox + col * dx + (row & 1) * (dx * 0.5);
            const cz = oz + row * dz;

            const centerIdx = getVertex(cx, cz);

            const corners = new Array(6);
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i;
                corners[i] = getVertex(
                    cx + size * Math.sin(a),
                    cz - size * Math.cos(a),
                );
            }

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
