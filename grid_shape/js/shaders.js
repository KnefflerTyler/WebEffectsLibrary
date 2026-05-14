import { loadGLSL } from '../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const LINE_VERTEX   = await loadGLSL(new URL('line.vert.glsl', base));
export const LINE_FRAGMENT = await loadGLSL(new URL('line.frag.glsl', base));
