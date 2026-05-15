/**
 * Minimal .obj parser.
 *
 * Returns an array of groups:
 * [{ name: string, materialName: string, geometry: THREE.BufferGeometry }]
 *
 * Handles:
 *  - v / vt / vn
 *  - f  with v, v/vt, v//vn, v/vt/vn  (triangles and quads; arbitrary fans)
 *  - usemtl / o / g  directives
 *  - 1-based and negative OBJ indices
 */
export function parseOBJ(text, THREE) {
    const positions = [];   // [x, y, z, ...]
    const uvs       = [];   // [u, v, ...]
    const normals   = [];   // [x, y, z, ...]

    // Each group accumulates flat arrays ready for BufferGeometry
    const groups = [];
    let currentGroup = null;

    function newGroup(name, materialName) {
        currentGroup = {
            name,
            materialName,
            pos:      [],
            uv:       [],
            norm:     [],
            hasNorms: false,
        };
        groups.push(currentGroup);
    }
    newGroup('default', null);

    function parseIndex(str, arrayLen) {
        const i = parseInt(str, 10);
        return i < 0 ? arrayLen + i : i - 1;   // convert 1-based → 0-based
    }

    function parseFaceVertex(token) {
        const parts = token.split('/');
        const posIdx  = parts[0] ? parseIndex(parts[0], positions.length / 3) : null;
        const uvIdx   = parts[1] ? parseIndex(parts[1], uvs.length / 2)       : null;
        const normIdx = parts[2] ? parseIndex(parts[2], normals.length / 3)   : null;
        return { posIdx, uvIdx, normIdx };
    }

    function pushVertex({ posIdx, uvIdx, normIdx }) {
        if (posIdx !== null) {
            currentGroup.pos.push(
                positions[posIdx * 3],
                positions[posIdx * 3 + 1],
                positions[posIdx * 3 + 2],
            );
        } else {
            currentGroup.pos.push(0, 0, 0);
        }
        if (uvIdx !== null) {
            currentGroup.uv.push(uvs[uvIdx * 2], uvs[uvIdx * 2 + 1]);
        } else {
            currentGroup.uv.push(0, 0);
        }
        if (normIdx !== null) {
            currentGroup.hasNorms = true;
            currentGroup.norm.push(
                normals[normIdx * 3],
                normals[normIdx * 3 + 1],
                normals[normIdx * 3 + 2],
            );
        } else {
            currentGroup.norm.push(0, 1, 0);
        }
    }

    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;

        const [keyword, ...rest] = line.split(/\s+/);

        switch (keyword) {
            case 'v':
                positions.push(Number(rest[0]), Number(rest[1]), Number(rest[2]));
                break;
            case 'vt':
                uvs.push(Number(rest[0]), 1.0 - Number(rest[1])); // flip V for WebGL
                break;
            case 'vn':
                normals.push(Number(rest[0]), Number(rest[1]), Number(rest[2]));
                break;

            case 'o':
            case 'g':
                newGroup(rest.join(' ') || keyword, currentGroup.materialName);
                break;

            case 'usemtl':
                // Start a new group for this material so each group maps 1:1 to a material
                newGroup(currentGroup.name, rest.join(' '));
                break;

            case 'f': {
                // Fan-triangulate polygon: v0, v1, v2 / v0, v2, v3 / …
                const verts = rest.map(parseFaceVertex);
                for (let i = 1; i < verts.length - 1; i++) {
                    pushVertex(verts[0]);
                    pushVertex(verts[i]);
                    pushVertex(verts[i + 1]);
                }
                break;
            }
        }
    }

    // Convert to BufferGeometry, skipping empty groups
    const result = [];
    for (const g of groups) {
        if (g.pos.length === 0) continue;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.pos),  3));
        geometry.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(g.uv),   2));

        const hasNormals = g.hasNorms;
        if (hasNormals) {
            geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.norm), 3));
        } else {
            geometry.computeVertexNormals();
        }

        result.push({ name: g.name, materialName: g.materialName, geometry });
    }

    return result;
}
