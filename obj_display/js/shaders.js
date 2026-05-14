import { loadGLSL } from '../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const OBJ_VERTEX   = await loadGLSL(new URL('obj.vert.glsl', base));
export const OBJ_FRAGMENT = await loadGLSL(new URL('obj.frag.glsl', base));
