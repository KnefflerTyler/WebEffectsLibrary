/**
 * Shared Three.js module — import this instead of importing THREE_CDN directly
 * so the heavy CDN load is cached as a single ES-module instance.
 */
import { THREE_CDN } from './config.js';
const THREE = await import(THREE_CDN);
export default THREE;
