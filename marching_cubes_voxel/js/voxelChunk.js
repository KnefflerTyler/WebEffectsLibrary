/**
 * buildFlatGrid — builds a flat (y=0) XZ triangle mesh for one chunk.
 *
 * The GPU vertex shader handles all Y displacement (Perlin FBM + quantization).
 * Only positions and indices are needed; normals are computed in the shader.
 *
 * @param {number} ox       World X origin of the chunk.
 * @param {number} oz       World Z origin of the chunk.
 * @param {number} size     Number of cells per side (chunkSize).
 * @param {number} cellSize World units per cell.
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function buildFlatGrid(ox, oz, size, cellSize) {
    const vCount = (size + 1) * (size + 1);
    const positions = new Float32Array(vCount * 3);

    let vi = 0;
    for (let z = 0; z <= size; z++) {
        for (let x = 0; x <= size; x++) {
            positions[vi++] = ox + x * cellSize;
            positions[vi++] = 0;
            positions[vi++] = oz + z * cellSize;
        }
    }

    const indices = new Uint32Array(size * size * 6);
    let ii = 0;
    const w = size + 1;
    for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
            const tl = z * w + x;
            const tr = tl + 1;
            const bl = tl + w;
            const br = bl + 1;
            indices[ii++] = tl; indices[ii++] = bl; indices[ii++] = tr;
            indices[ii++] = tr; indices[ii++] = bl; indices[ii++] = br;
        }
    }

    return { positions, indices };
}
