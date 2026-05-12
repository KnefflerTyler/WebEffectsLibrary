async function loadGLSL(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load shader: ${path}`);
    return res.text();
}

const base = new URL('../glsl/', import.meta.url);

export const NOISE_VERTEX   = await loadGLSL(new URL('noise.vert.glsl', base));
export const NOISE_FRAGMENT = await loadGLSL(new URL('noise.frag.glsl', base));
