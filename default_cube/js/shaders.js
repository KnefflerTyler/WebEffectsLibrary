import { loadGLSL } from '../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const CUBE_VERTEX   = await loadGLSL(new URL('cube.vert.glsl', base));
export const CUBE_FRAGMENT = await loadGLSL(new URL('cube.frag.glsl', base));
