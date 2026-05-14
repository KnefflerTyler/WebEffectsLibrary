import { loadGLSL } from '../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const TERRAIN_VERTEX   = await loadGLSL(new URL('terrain.vert.glsl', base));
export const TERRAIN_FRAGMENT = await loadGLSL(new URL('terrain.frag.glsl', base));
