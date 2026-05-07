async function loadGLSL(filename) {
    const url = new URL(`../glsl/${filename}`, import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load shader: ${filename}`);
    return res.text();
}

export const BODY_VERT      = await loadGLSL('body.vert.glsl');
export const BODY_FRAG      = await loadGLSL('body.frag.glsl');
export const STAR_FRAG      = await loadGLSL('star.frag.glsl');
export const BLACKHOLE_FRAG = await loadGLSL('blackhole.frag.glsl');
