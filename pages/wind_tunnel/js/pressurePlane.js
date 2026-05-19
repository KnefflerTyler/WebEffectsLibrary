/**
 * pressurePlane.js — semi-transparent Cp cross-section visualization.
 *
 * Adds a horizontal plane (the XZ symmetry plane at the object's Y centre)
 * coloured by pressure coefficient Cp = 1 − (v/U)², computed per-fragment
 * on the GPU using the analytical potential-flow solution for a sphere.
 *
 * This is the defining view in every professional CFD post-processor —
 * stagnation regions show red, free-stream white, suction peaks blue.
 *
 * The plane is hidden by default; toggle via setPressurePlaneVisible().
 */
import * as THREE from 'three';
import { TW, TL } from './config.js';
import { PRESSURE_VERT, PRESSURE_FRAG } from './shaders.js';
import { scene } from './scene.js';

// ── Material ──────────────────────────────────────────────────────────────────
const pressureMat = new THREE.ShaderMaterial({
    vertexShader  : PRESSURE_VERT,
    fragmentShader: PRESSURE_FRAG,
    uniforms: {
        uObjCenter : { value: new THREE.Vector3(0, 0, 0) },
        uObjRadius : { value: 0.0 },
    },
    transparent : true,
    depthWrite  : false,
    side        : THREE.DoubleSide,
});

// ── Mesh — high-density grid so interpolation is smooth ──────────────────────
// PlaneGeometry default orientation is XY; rotate −90° around X for XZ plane.
const planeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(TW * 0.95, TL * 0.95, 1, 1),
    pressureMat
);
planeMesh.rotation.x = -Math.PI / 2;
planeMesh.visible    = false;
scene.add(planeMesh);

// ── Public API ────────────────────────────────────────────────────────────────
export function setPressurePlaneVisible(visible) {
    planeMesh.visible = visible;
}

/**
 * Call each frame (or whenever the object changes) to keep the plane centred
 * on the object and the shader uniforms in sync.
 *
 * @param {{ cx, cy, cz, r }|null} objSphere
 */
export function updatePressurePlane(objSphere) {
    if (objSphere) {
        pressureMat.uniforms.uObjCenter.value.set(objSphere.cx, objSphere.cy, objSphere.cz);
        pressureMat.uniforms.uObjRadius.value = objSphere.r;
        // Move the plane to the object's vertical centre
        planeMesh.position.y = objSphere.cy;
    } else {
        pressureMat.uniforms.uObjRadius.value = 0.0;
    }
}
