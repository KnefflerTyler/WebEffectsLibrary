async function loadGLSL(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load shader: ${path}`);
    return res.text();
}

const base = new URL('../glsl/', import.meta.url);

export const POINT_VERTEX   = await loadGLSL(new URL('point.vert.glsl', base));
export const POINT_FRAGMENT = await loadGLSL(new URL('point.frag.glsl', base));
export const LINE_VERTEX    = await loadGLSL(new URL('line.vert.glsl',  base));
export const LINE_FRAGMENT  = await loadGLSL(new URL('line.frag.glsl',  base));
