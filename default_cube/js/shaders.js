async function loadGLSL(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load shader: ${path}`);
    return res.text();
}

const base = new URL('../glsl/', import.meta.url);

export const CUBE_VERTEX   = await loadGLSL(new URL('cube.vert.glsl', base));
export const CUBE_FRAGMENT = await loadGLSL(new URL('cube.frag.glsl', base));
