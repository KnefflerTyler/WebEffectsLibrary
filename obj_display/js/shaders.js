async function loadGLSL(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load shader: ${path}`);
    return res.text();
}

const base = new URL('../glsl/', import.meta.url);

export const OBJ_VERTEX   = await loadGLSL(new URL('obj.vert.glsl', base));
export const OBJ_FRAGMENT = await loadGLSL(new URL('obj.frag.glsl', base));
