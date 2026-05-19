/**
 * objects.js — preset mesh builders, OBJ importer, and object placement.
 *
 * GPU improvement: All imported / procedural objects use a custom ShaderMaterial
 * (object.vert / object.frag) instead of MeshPhongMaterial.
 *   • Blinn-Phong + Fresnel rim computed per-pixel on GPU.
 *   • Aerodynamic pressure tint (blue upstream / warm downstream) is pure GLSL.
 *
 * Exported getters are functions to avoid sharing mutable references.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { TH, TW, PRESET_CD } from './config.js';
import { OBJECT_VERT, OBJECT_FRAG } from './shaders.js';
import { scene } from './scene.js';
import { estimateCd } from './physics.js';

// ── Shared GPU material for all objects ───────────────────────────────────────
export const objectMat = new THREE.ShaderMaterial({
    vertexShader  : OBJECT_VERT,
    fragmentShader: OBJECT_FRAG,
    uniforms: {
        uBaseColor : { value: new THREE.Color(0x8899cc) },   // metallic blue-grey
        uRimColor  : { value: new THREE.Color(0x44aaff) },   // cyan Fresnel rim
        uLightDir  : { value: new THREE.Vector3(5, 12, -6).normalize() },
        uObjCenter : { value: new THREE.Vector3(0, 0, 0) },  // for Cp surface map
        uSimDone   : { value: 0.0 },  // 0 = plain metallic; 1 = Cp pressure colours
        uCpMap     : { value: null },  // sim-derived Cp texture (128×64 equirectangular)
        uUseCpMap  : { value: 0.0 },   // 0 = analytical formula, 1 = sim texture
    },
    transparent: true,
    depthWrite : true,
    side: THREE.DoubleSide,
});

/**
 * Enable Cp pressure coloring on the object surface.
 * Call after simulation completes. Pass false to revert to plain metallic.
 */
export function enableCpColoring(on = true) {
    objectMat.uniforms.uSimDone.value = on ? 1.0 : 0.0;
}

/**
 * Upload the simulation-derived pressure texture.
 * Pass null to fall back to the analytical formula.
 */
export function setCpTexture(tex) {
    objectMat.uniforms.uCpMap.value    = tex;
    objectMat.uniforms.uUseCpMap.value = tex ? 1.0 : 0.0;
}

// ── Internal module state ─────────────────────────────────────────────────────
let _currentMesh  = null;
let _objSphere    = null;    // { cx, cy, cz, r }
let _currentStats = null;    // forwarded to stats.js

// ── Public getters ────────────────────────────────────────────────────────────
export const getObjSphere    = () => _objSphere;
export const getCurrentStats = () => _currentStats;

// ── Preset loader ─────────────────────────────────────────────────────────────
/**
 * Replace the current object with a named preset shape.
 * @param {'none'|'sphere'|'cube'|'cylinder'|'cone'|'car'} type
 */
export function loadPreset(type) {
    if (type === 'none') { _clearObject(); return; }

    let geo, label, knownCd, physLenM, physAreaM2;
    const R = 1.0;   // 1-world-unit radius for all presets

    switch (type) {
        case 'sphere':
            geo        = new THREE.SphereGeometry(R, 40, 30);
            label      = 'Sphere';
            knownCd    = PRESET_CD.sphere;
            physLenM   = 2 * R;
            physAreaM2 = Math.PI * R * R;
            break;
        case 'cube':
            geo        = new THREE.BoxGeometry(R*2, R*2, R*2);
            label      = 'Cube';
            knownCd    = PRESET_CD.cube;
            physLenM   = R * 2;
            physAreaM2 = (R*2) * (R*2);
            break;
        case 'cylinder':
            geo        = new THREE.CylinderGeometry(R, R, R*2, 36);
            geo.rotateX(Math.PI / 2);   // orient along flow axis
            label      = 'Cylinder';
            knownCd    = PRESET_CD.cylinder;
            physLenM   = R * 2;
            physAreaM2 = R * 2 * R * 2;
            break;
        case 'cone':
            geo        = new THREE.ConeGeometry(R, R*2.5, 36);
            geo.rotateX(Math.PI / 2);
            label      = 'Cone';
            knownCd    = PRESET_CD.cone;
            physLenM   = R * 2.5;
            physAreaM2 = Math.PI * R * R;
            break;
        case 'car':
            geo        = _buildCarGeo();
            label      = 'Car (simplified)';
            knownCd    = PRESET_CD.car;
            physLenM   = 4;
            physAreaM2 = 2.2;
            break;
        default:
            return;
    }

    const mesh = new THREE.Mesh(geo, objectMat);
    _setObject(mesh, label, knownCd, physLenM, physAreaM2);
}

/**
 * Parse and display an OBJ file (text string).
 */
export function importOBJ(text) {
    const loader = new OBJLoader();
    const group  = loader.parse(text);

    // Flatten group into a single merged-geometry mesh
    const geos = [];
    group.traverse(child => {
        if (child.isMesh) geos.push(child.geometry.clone());
    });
    if (!geos.length) return;

    const merged = _mergeGeometries(geos);
    const mesh   = new THREE.Mesh(merged, objectMat);
    merged.computeBoundingBox();
    const box = merged.boundingBox;
    const lenZ   = box.max.z - box.min.z;
    const frontalW = box.max.x - box.min.x;
    const frontalH = box.max.y - box.min.y;
    _setObject(mesh, 'Imported OBJ', null, lenZ, frontalW * frontalH * 0.7854);
}

// ── Private helpers ───────────────────────────────────────────────────────────
function _clearObject() {
    if (_currentMesh) { scene.remove(_currentMesh); _currentMesh = null; }
    _objSphere    = null;
    _currentStats = null;
}

function _setObject(mesh, label, knownCd, physLenM, physAreaM2) {
    _clearObject();

    // Centre and scale to fit within the tunnel cross-section
    mesh.geometry.computeBoundingBox();
    const bb   = mesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    bb.getSize(size);
    const maxExtent = Math.max(size.x, size.y, size.z);
    const maxAllowed = Math.min(TH * 0.55, TW * 0.30);
    const scaleFactor = maxAllowed / maxExtent;
    mesh.scale.setScalar(scaleFactor);

    // Centre on bounding box midpoint
    const centre = new THREE.Vector3();
    bb.getCenter(centre);
    mesh.geometry.translate(-centre.x, -centre.y, -centre.z);

    // Sit on floor
    mesh.position.set(0, -TH / 2 + size.y * scaleFactor * 0.5, 0);

    scene.add(mesh);
    _currentMesh = mesh;

    // Bounding sphere used by physics (unscaled; apply scale manually)
    mesh.geometry.computeBoundingSphere();
    const bs = mesh.geometry.boundingSphere;
    _objSphere = {
        cx: mesh.position.x,
        cy: mesh.position.y,
        cz: mesh.position.z,
        r : bs.radius * scaleFactor,
    };

    // Keep object shader's Cp centre in sync with placement
    objectMat.uniforms.uObjCenter.value.set(
        mesh.position.x, mesh.position.y, mesh.position.z
    );

    // ── Drag / efficiency metrics ─────────────────────────────────────────────
    const scaledLen  = physLenM  * scaleFactor;
    const scaledArea = physAreaM2 * scaleFactor * scaleFactor;
    const fineness   = scaledLen / Math.sqrt(scaledArea);
    const cd         = knownCd ?? estimateCd(fineness);

    _currentStats = { label, cd, physLenM: scaledLen, physAreaM2: scaledArea, fineness };

    // Notify listener if registered (set by main.js)
    if (_onObjectChange) _onObjectChange(_currentStats);
}

/** Car: three merged boxes (body + cabin + spoiler). */
function _buildCarGeo() {
    const body   = new THREE.BoxGeometry(1.8, 0.5, 4.0);
    const cabin  = new THREE.BoxGeometry(1.4, 0.6, 2.2);
    const spoiler = new THREE.BoxGeometry(1.6, 0.08, 0.5);

    // Position sub-meshes before merging
    cabin.translate(0, 0.55, -0.4);
    spoiler.translate(0, 0.75, -2.0);

    return _mergeGeometries([body, cabin, spoiler]);
}

/** Naively merge an array of BufferGeometries into one. */
function _mergeGeometries(geos) {
    let totalVerts = 0;
    let totalIdx   = 0;
    let hasIndex   = false;

    for (const g of geos) {
        totalVerts += g.attributes.position.count;
        if (g.index) { totalIdx += g.index.count; hasIndex = true; }
    }

    const posArr = new Float32Array(totalVerts * 3);
    const nrmArr = new Float32Array(totalVerts * 3);
    const idxArr = hasIndex ? new Uint32Array(totalIdx) : null;

    let vOff = 0, iOff = 0;
    for (const g of geos) {
        g.computeVertexNormals();
        const pos = g.attributes.position.array;
        const nrm = g.attributes.normal?.array;
        posArr.set(pos, vOff * 3);
        if (nrm) nrmArr.set(nrm, vOff * 3);
        if (hasIndex && g.index) {
            const src = g.index.array;
            for (let j = 0; j < src.length; j++) idxArr[iOff + j] = src[j] + vOff;
            iOff += src.length;
        }
        vOff += g.attributes.position.count;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    out.setAttribute('normal',   new THREE.BufferAttribute(nrmArr, 3));
    if (idxArr) out.setIndex(new THREE.BufferAttribute(idxArr, 1));
    return out;
}

// ── Optional callback (set by main.js after stats module is ready) ────────────
let _onObjectChange = null;
export function setObjectChangeCallback(fn) { _onObjectChange = fn; }
