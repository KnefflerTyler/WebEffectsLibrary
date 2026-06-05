/**
 * scene.js — renderer, scene, camera, OrbitControls, lighting.
 *
 * All other modules import {scene, renderer, camera, controls} from here.
 * Module code runs once; Three.js objects are true singletons.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('pageBackground');

// ── Renderer ──────────────────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x040810);
renderer.toneMapping        = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();

// ── Camera ────────────────────────────────────────────────────────────────────
export const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(10, 6, -12);
camera.lookAt(0, 0, 0);

// ── Controls ──────────────────────────────────────────────────────────────────
export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping  = true;
controls.dampingFactor  = 0.07;
controls.minDistance    = 4;
controls.maxDistance    = 40;

// ── Lighting ──────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x2244aa, 2.0));

const keyLight = new THREE.DirectionalLight(0x88aaff, 2.5);
keyLight.position.set(5, 12, -6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x4466cc, 1.0);
fillLight.position.set(-8, 3, 8);
scene.add(fillLight);

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
