import { loadGLSL } from '../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const POINT_VERTEX   = await loadGLSL(new URL('point.vert.glsl', base));
export const POINT_FRAGMENT = await loadGLSL(new URL('point.frag.glsl', base));
