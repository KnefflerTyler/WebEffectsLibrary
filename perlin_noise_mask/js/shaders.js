import { loadGLSL } from '../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const NOISE_VERTEX   = await loadGLSL(new URL('noise.vert.glsl', base));
export const NOISE_FRAGMENT = await loadGLSL(new URL('noise.frag.glsl', base));
