async function loadGLSL(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load shader: ${path}`);
    return res.text();
}

const base = new URL('../glsl/', import.meta.url);

export const TERRAIN_VERTEX   = await loadGLSL(new URL('terrain.vert.glsl', base));
export const TERRAIN_FRAGMENT = await loadGLSL(new URL('terrain.frag.glsl', base));
