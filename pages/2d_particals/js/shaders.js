import { loadGLSL } from '../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const PARTICLE_VERTEX   = await loadGLSL(new URL('particle.vert.glsl', base));
export const PARTICLE_FRAGMENT = await loadGLSL(new URL('particle.frag.glsl', base));
