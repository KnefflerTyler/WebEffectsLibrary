/**
 * simStreamers.js — inject batch-simulated streamlines into the 3-D scene.
 *
 * Samples MAX_DISPLAY evenly-spaced paths from the full simulation set and
 * builds a single THREE.LineSegments for one GPU draw call.  Using a fraction
 * of the raw paths keeps the geometry light while still conveying the full
 * flow pattern.
 */
import * as THREE from 'three';
import { STREAMER_VERT, STREAMER_FRAG } from './shaders.js';
import { scene }                        from './scene.js';

// Maximum number of paths rendered — keeps vertex count manageable.
const MAX_DISPLAY = 500;
// Step stride along each path — skip every other point to halve segment count.
const STRIDE = 2;

let _group = null;

/**
 * Build a LineSegments group from a sampled subset of 3-D paths and add it to the scene.
 * Paths that never come close to the object are already filtered by simulate.js;
 * here we sample evenly and set up proximity fade so distant segments are transparent.
 *
 * @param {Array<{xs,ys,zs,ss}>} paths3d
 * @param {{ cx,cy,cz,r }|null}  objSphere
 */
export function buildSimGroup(paths3d, objSphere) {
    clearSimGroup();

    const total = paths3d.length;
    const step  = total <= MAX_DISPLAY ? 1 : Math.floor(total / MAX_DISPLAY);

    const posArr = [];
    const spdArr = [];

    for (let p = 0; p < total; p += step) {
        const { xs, ys, zs, ss } = paths3d[p];
        const n = xs.length;
        for (let i = 0; i < n - STRIDE; i += STRIDE) {
            posArr.push(xs[i],        ys[i],        zs[i]);
            posArr.push(xs[i+STRIDE], ys[i+STRIDE], zs[i+STRIDE]);
            const s = (ss[i] + ss[i+STRIDE]) * 0.5;
            spdArr.push(s, s);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    geo.setAttribute('aSpeed',   new THREE.BufferAttribute(new Float32Array(spdArr), 1));

    // uObjRadius = 0  →  vertex shader uses the "no object" branch → vAlpha = 0.55
    // (uniform full-length visibility, no proximity fade)
    const mat = new THREE.ShaderMaterial({
        vertexShader  : STREAMER_VERT,
        fragmentShader: STREAMER_FRAG,
        uniforms: {
            uObjCenter: { value: new THREE.Vector3(objSphere?.cx ?? 0, objSphere?.cy ?? 0, objSphere?.cz ?? 0) },
            uObjRadius: { value: objSphere?.r ?? 0.0 },  // >0 enables proximity fade
            uFadeMult : { value: 5.0 },                  // paths taper out 5× radii from surface
        },
        transparent: true,
        opacity    : 0.72,
        blending   : THREE.AdditiveBlending,
        depthWrite : false,
    });

    _group = new THREE.LineSegments(geo, mat);
    scene.add(_group);
    return _group;
}

/** Remove the simulated streamlines from the scene and free GPU memory. */
export function clearSimGroup() {
    if (_group) {
        scene.remove(_group);
        _group.geometry.dispose();
        _group.material.dispose();
        _group = null;
    }
}

/** Returns true when sim lines are currently visible in the scene. */
export function isSimGroupActive() {
    return _group !== null;
}
