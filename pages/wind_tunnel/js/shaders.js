/**
 * Loads all GLSL shader sources for the wind-tunnel page.
 * Uses the shared loadGLSL utility (fetch + text()).
 * Top-level await suspends dependent modules until all shaders are ready.
 */
import { loadGLSL } from '../../../shared/loadGLSL.js';

const base = new URL('../glsl/', import.meta.url);

export const STREAMER_VERT = await loadGLSL(new URL('streamer.vert.glsl', base));
export const STREAMER_FRAG = await loadGLSL(new URL('streamer.frag.glsl', base));

export const OBJECT_VERT   = await loadGLSL(new URL('object.vert.glsl',   base));
export const OBJECT_FRAG   = await loadGLSL(new URL('object.frag.glsl',   base));

export const FLOOR_VERT    = await loadGLSL(new URL('floor.vert.glsl',    base));
export const FLOOR_FRAG    = await loadGLSL(new URL('floor.frag.glsl',    base));

export const PRESSURE_VERT = await loadGLSL(new URL('pressure.vert.glsl', base));
export const PRESSURE_FRAG = await loadGLSL(new URL('pressure.frag.glsl', base));

export const SMOKE_VERT    = await loadGLSL(new URL('smoke.vert.glsl',    base));
export const SMOKE_FRAG    = await loadGLSL(new URL('smoke.frag.glsl',    base));
