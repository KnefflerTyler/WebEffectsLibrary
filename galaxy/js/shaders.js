import { loadGLSL } from '../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const BODY_VERT      = await loadGLSL(new URL('body.vert.glsl',      base));
export const BODY_FRAG      = await loadGLSL(new URL('body.frag.glsl',      base));
export const PLANET_FRAG    = await loadGLSL(new URL('planet.frag.glsl',    base));
export const MOON_FRAG      = await loadGLSL(new URL('moon.frag.glsl',      base));
export const STAR_FRAG      = await loadGLSL(new URL('star.frag.glsl',      base));
export const BLACKHOLE_FRAG = await loadGLSL(new URL('blackhole.frag.glsl', base));
