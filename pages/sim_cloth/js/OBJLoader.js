/**
 * OBJLoader.js — Fetch and parse Wavefront .obj files
 *
 * Returns a plain object:
 *   { vertices: [number,number,number][], faces: number[] }
 *
 * faces is a flat array of 0-based vertex indices (triangulated).
 * Ignores normals, UVs, material refs — position-only for cloth/collision use.
 */

/**
 * Fetch an OBJ file by URL and parse it.
 * Falls back to null (caller decides what to do) on network error.
 * @param {string} url
 * @returns {Promise<{vertices:[number,number,number][], faces:number[]}|null>}
 */
export async function loadOBJ(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const text = await res.text();
        return parseOBJ(text);
    } catch {
        return null;
    }
}

/**
 * Parse raw OBJ text.
 * @param {string} text
 * @returns {{vertices:[number,number,number][], faces:number[]}}
 */
export function parseOBJ(text) {
    const vertices = [];
    const faces    = [];

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line[0] === '#') continue;

        if (line.startsWith('v ')) {
            const parts = line.split(/\s+/);
            vertices.push([
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3]),
            ]);
        } else if (line.startsWith('f ')) {
            // Faces may use "v", "v/vt", "v//vn", "v/vt/vn" notation.
            // We only care about the vertex index (first component).
            const parts = line.split(/\s+/).slice(1).map(p => {
                const vi = parseInt(p.split('/')[0], 10);
                // OBJ uses 1-based indices; negative means relative
                return vi > 0 ? vi - 1 : vertices.length + vi;
            });
            // Fan-triangulate polygons (works for convex faces)
            for (let i = 1; i < parts.length - 1; i++) {
                faces.push(parts[0], parts[i], parts[i + 1]);
            }
        }
    }

    return { vertices, faces };
}

/**
 * Clamp an OBJ mesh to a vertex budget (to keep GPU work manageable).
 * Keeps a contiguous subset of vertices + faces that reference only those vertices.
 * @param {{vertices:[number,number,number][], faces:number[]}} obj
 * @param {number} [maxVerts=3000]
 * @returns {{vertices:[number,number,number][], faces:number[]}}
 */
export function clampOBJ({ vertices, faces }, maxVerts = 3000) {
    if (vertices.length <= maxVerts) return { vertices, faces };

    const remap  = new Int32Array(vertices.length).fill(-1);
    const newV   = [];
    const newF   = [];

    for (let i = 0; i < faces.length; i += 3) {
        const tri = [faces[i], faces[i + 1], faces[i + 2]];
        // Only keep triangles whose vertices fit within budget
        let ok = true;
        for (const vi of tri) {
            if (remap[vi] === -1) {
                if (newV.length >= maxVerts) { ok = false; break; }
                remap[vi] = newV.length;
                newV.push(vertices[vi]);
            }
        }
        if (ok) newF.push(remap[tri[0]], remap[tri[1]], remap[tri[2]]);
    }

    return { vertices: newV, faces: newF };
}
