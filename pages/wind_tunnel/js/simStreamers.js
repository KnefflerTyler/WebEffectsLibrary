/**
 * simStreamers.js — inject batch-simulated streamlines into the 3-D scene.
 *
 * Takes the `allPaths` array produced by simulate.js (each entry: Float32Array
 * sub-views xs, ys, zs, ss) and builds a single THREE.LineSegments object so
 * all 12 000 paths are drawn in one GPU draw call.
 *
 * The same STREAMER_VERT / STREAMER_FRAG shaders are reused.  Setting
 * uObjRadius = 0 activates the "no-object" branch in the vertex shader, which
 * renders the full extent of every line at uniform opacity — exactly what we
 * want for the frozen simulation snapshot.
 */
import * as THREE from 'three';
import { STREAMER_VERT, STREAMER_FRAG } from './shaders.js';
import { scene }                        from './scene.js';

let _group = null;

/**
 * Build a LineSegments group from 3-D paths and add it to the scene.
 * Any previously built group is removed first.
 *
 * @param {Array<{xs,ys,zs,ss}>} paths3d
 * @returns {THREE.LineSegments}
 */
export function buildSimGroup(paths3d) {
    clearSimGroup();

    const posArr = [];
    const spdArr = [];

    for (const { xs, ys, zs, ss } of paths3d) {
        const n = xs.length;
        for (let i = 0; i < n - 1; i++) {
            // Each segment = two vertices (GL_LINES / LineSegments)
            posArr.push(xs[i],     ys[i],     zs[i]);
            posArr.push(xs[i + 1], ys[i + 1], zs[i + 1]);
            const s = (ss[i] + ss[i + 1]) * 0.5;
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
            uObjCenter: { value: new THREE.Vector3() },
            uObjRadius: { value: 0.0 },
            uFadeMult : { value: 3.0 },
        },
        transparent: true,
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
