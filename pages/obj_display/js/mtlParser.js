/**
 * Minimal .mtl parser.
 * Returns a Map<materialName, MaterialDef> where MaterialDef is:
 * {
 *   Ka: [r,g,b],          ambient
 *   Kd: [r,g,b],          diffuse
 *   Ks: [r,g,b],          specular
 *   Ns: number,           shininess
 *   d:  number,           opacity  (1 = opaque)
 *   map_Kd: string | null diffuse texture filename
 *
 *   // Non-standard edge-line extensions (ignored by other tools):
 *   edge_color: [r,g,b] | null   if set, draws EdgesGeometry lines in this colour
 *   edge_width: number           line width hint (cosmetic only in WebGL)
 * }
 */
export function parseMTL(text) {
    const materials = new Map();
    let current = null;

    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;

        const [keyword, ...rest] = line.split(/\s+/);

        switch (keyword) {
            case 'newmtl':
                current = {
                    Ka: [0.1, 0.1, 0.1],
                    Kd: [0.8, 0.8, 0.8],
                    Ks: [0.2, 0.2, 0.2],
                    Ns: 32,
                    d:  1.0,
                    map_Kd: null,
                    edge_color: null,
                    edge_width: 1,
                    edge_threshold: 0,
                };
                materials.set(rest.join(' '), current);
                break;
            case 'Ka':
                if (current) current.Ka = rest.slice(0, 3).map(Number);
                break;
            case 'Kd':
                if (current) current.Kd = rest.slice(0, 3).map(Number);
                break;
            case 'Ks':
                if (current) current.Ks = rest.slice(0, 3).map(Number);
                break;
            case 'Ns':
                if (current) current.Ns = Number(rest[0]);
                break;
            case 'd':
                if (current) current.d = Number(rest[0]);
                break;
            case 'Tr':
                // Tr = 1 - d
                if (current) current.d = 1.0 - Number(rest[0]);
                break;
            case 'map_Kd':
                if (current) current.map_Kd = rest[rest.length - 1];
                break;
            case 'edge_color':
                if (current) current.edge_color = rest.slice(0, 3).map(Number);
                break;
            case 'edge_width':
                if (current) current.edge_width = Number(rest[0]);
                break;
            case 'edge_threshold':
                if (current) current.edge_threshold = Number(rest[0]);
                break;
        }
    }

    return materials;
}
