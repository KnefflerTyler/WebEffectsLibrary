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

// ── Preset metadata (physical dimensions for drag / Cd stats) ────────────────
const PRESET_META = {
    sphere:   { label: 'Sphere',           knownCd: null,  physLenM: 2.0, physAreaM2: Math.PI       },
    cube:     { label: 'Cube',             knownCd: null,  physLenM: 2.0, physAreaM2: 4.0           },
    cylinder: { label: 'Cylinder',         knownCd: null,  physLenM: 2.0, physAreaM2: 4.0           },
    cone:     { label: 'Cone',             knownCd: null,  physLenM: 2.5, physAreaM2: Math.PI       },
    car:      { label: 'Car (simplified)', knownCd: null,  physLenM: 4.0, physAreaM2: 2.2           },
    torus:    { label: 'Torus (Donut)',    knownCd: 0.10,  physLenM: 0.7, physAreaM2: 1.2           },
};
// Back-fill knownCd from config (kept separate so PRESET_META stays readable)
Object.keys(PRESET_META).forEach(k => {
    if (PRESET_CD[k] != null) PRESET_META[k].knownCd = PRESET_CD[k];
});

// ── Preset loader ─────────────────────────────────────────────────────────────
/**
 * Replace the current object with a named preset shape loaded from an OBJ file.
 * Returns a Promise so callers that need to await geometry placement can do so.
 *
 * @param {'none'|'sphere'|'cube'|'cylinder'|'cone'|'car'|'torus'} type
 * @returns {Promise<void>}
 */
export async function loadPreset(type) {
    if (type === 'none') { _clearObject(); return; }

    const meta = PRESET_META[type];
    if (!meta) return;

    // Resolve URL relative to this module file (obj/ lives next to js/)
    const url = new URL(`../obj/${type}.obj`, import.meta.url).href;
    const text = await fetch(url).then(r => {
        if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
        return r.text();
    });

    const loader = new OBJLoader();
    const group  = loader.parse(text);

    // Collect per-component geometries (one per OBJ group/object)
    const geos = [];
    const compBoxes = [];
    group.traverse(child => {
        if (!child.isMesh) return;
        const g = child.geometry.clone();
        g.computeBoundingBox();
        compBoxes.push(g.boundingBox.clone());
        geos.push(g);
    });
    if (!geos.length) return;

    // Per-component boxes are only meaningful when there are multiple parts
    const merged = _mergeGeometries(geos);
    const mesh   = new THREE.Mesh(merged, objectMat);
    _setObject(mesh, meta.label, meta.knownCd, meta.physLenM, meta.physAreaM2,
               compBoxes.length > 1 ? compBoxes : null);
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

function _setObject(mesh, label, knownCd, physLenM, physAreaM2, rawCompBoxes = null) {
    _clearObject();

    // ── 1. Uniform scale: fit the largest dimension within the tunnel's
    //       cross-section while leaving clearance for airflow around it.
    mesh.geometry.computeBoundingBox();
    const bb   = mesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    bb.getSize(size);
    const maxExtent  = Math.max(size.x, size.y, size.z);
    const maxAllowed = Math.min(TH * 0.55, TW * 0.30);  // tighter of height/width limits
    const scaleFactor = maxAllowed / maxExtent;
    mesh.scale.setScalar(scaleFactor);

    // ── 2. Centre: translate geometry so the bounding-box midpoint is at origin.
    //       This ensures mesh.position always refers to the object's geometric centre.
    const centre = new THREE.Vector3();
    bb.getCenter(centre);
    mesh.geometry.translate(-centre.x, -centre.y, -centre.z);

    // ── 3. Floor placement: lift the object so its bottom face rests on the floor.
    mesh.position.set(0, -TH / 2 + size.y * scaleFactor * 0.5, 0);

    scene.add(mesh);
    _currentMesh = mesh;

    // ── 4. Bounding sphere + AABB half-extents for physics lookups.
    //       The sphere (r) drives the doublet velocity field (sphere approximation).
    //       The half-extents (hx/hy/hz) give physics.js an accurate solid interior
    //       check so particles cannot pass through flat faces or corners of non-
    //       spherical shapes.  Both are computed on the centred un-scaled geometry
    //       and then manually scaled because THREE doesn't auto-scale these with mesh.scale.
    mesh.geometry.computeBoundingSphere();
    const bs = mesh.geometry.boundingSphere;

    // Per-component world-space AABBs (only when multiple OBJ groups present, e.g. car).
    // Each raw Box3 is in original geometry space; apply same centre-offset + scale + position.
    let boxes = null;
    if (rawCompBoxes) {
        boxes = rawCompBoxes.map(bb => {
            const minW = bb.min.clone().sub(centre).multiplyScalar(scaleFactor).add(mesh.position);
            const maxW = bb.max.clone().sub(centre).multiplyScalar(scaleFactor).add(mesh.position);
            return {
                cx: (minW.x + maxW.x) * 0.5,
                cy: (minW.y + maxW.y) * 0.5,
                cz: (minW.z + maxW.z) * 0.5,
                hx: (maxW.x - minW.x) * 0.5,
                hy: (maxW.y - minW.y) * 0.5,
                hz: (maxW.z - minW.z) * 0.5,
            };
        });
    }

    // Build triangle-mesh voxel grid for accurate inside/outside collision.
    const voxels = buildVoxelGrid(mesh.geometry, mesh.position, scaleFactor);

    _objSphere = {
        cx: mesh.position.x,
        cy: mesh.position.y,
        cz: mesh.position.z,
        r : bs.radius * scaleFactor,
        // Merged AABB half-extents (kept for wake sizing in physics)
        hx: size.x * scaleFactor * 0.5,
        hy: size.y * scaleFactor * 0.5,
        hz: size.z * scaleFactor * 0.5,
        // Per-component AABBs (null for single-part shapes)
        boxes,
        // Triangle-mesh voxel grid – primary inside/outside test in physics.js
        voxels,
    };

    // Keep the object shader's Cp-map centre uniform in sync with world placement.
    objectMat.uniforms.uObjCenter.value.set(
        mesh.position.x, mesh.position.y, mesh.position.z
    );

    // ── 5. Drag / efficiency metrics ──────────────────────────────────────────
    // Fineness ratio f = L / √A  (streamwise length over root frontal area).
    // Used to estimate Cd from empirical smooth-body data when knownCd is null.
    const scaledLen  = physLenM  * scaleFactor;
    const scaledArea = physAreaM2 * scaleFactor * scaleFactor;
    const fineness   = scaledLen / Math.sqrt(scaledArea);
    const cd         = knownCd ?? estimateCd(fineness);

    _currentStats = { label, cd, physLenM: scaledLen, physAreaM2: scaledArea, fineness };

    // Notify listener if registered (set by main.js)
    if (_onObjectChange) _onObjectChange(_currentStats);
}

// ── Mesh voxelizer ────────────────────────────────────────────────────────────
/**
 * Build a binary voxel grid from a (centred, unscaled) BufferGeometry.
 * Uses Möller–Trumbore ray casting along the +X axis with a parity rule to
 * determine inside/outside — this respects the actual triangle faces of the
 * mesh rather than bounding shapes.
 *
 * @param {THREE.BufferGeometry} geometry  centred, unscaled source geometry
 * @param {THREE.Vector3}        position  world-space mesh.position
 * @param {number}               scale     uniform scale factor applied to mesh
 * @returns {{ ox, oy, oz, step, nx, ny, nz, data: Uint8Array }}
 */
function buildVoxelGrid(geometry, position, scale) {
    const posAttr = geometry.attributes.position.array;
    const idxArr  = geometry.index ? geometry.index.array : null;
    const triCount = idxArr ? (idxArr.length / 3) : (posAttr.length / 9);

    // World-space AABB
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const pad = 0.04;
    const ox = bb.min.x * scale + position.x - pad;
    const oy = bb.min.y * scale + position.y - pad;
    const oz = bb.min.z * scale + position.z - pad;
    const ex = bb.max.x * scale + position.x + pad;
    const ey = bb.max.y * scale + position.y + pad;
    const ez = bb.max.z * scale + position.z + pad;

    // ~64 cells across the largest dimension
    const maxDim = Math.max(ex - ox, ey - oy, ez - oz);
    const step   = maxDim / 64;
    const nx = Math.max(1, Math.ceil((ex - ox) / step));
    const ny = Math.max(1, Math.ceil((ey - oy) / step));
    const nz = Math.max(1, Math.ceil((ez - oz) / step));

    const data = new Uint8Array(nx * ny * nz);

    // Helper: get world-space vertex i into out[0..2]
    function vtx(i, out) {
        out[0] = posAttr[i * 3    ] * scale + position.x;
        out[1] = posAttr[i * 3 + 1] * scale + position.y;
        out[2] = posAttr[i * 3 + 2] * scale + position.z;
    }

    const a = new Float64Array(3), b = new Float64Array(3), c = new Float64Array(3);

    // For each (iy, iz) column shoot a ray in the +X direction and collect all
    // triangle intersection X values, then use the even-odd rule to fill voxels.
    for (let iz = 0; iz < nz; iz++) {
        for (let iy = 0; iy < ny; iy++) {
            const ry = oy + (iy + 0.5) * step;
            const rz = oz + (iz + 0.5) * step;

            const hits = [];

            for (let ti = 0; ti < triCount; ti++) {
                const i0 = idxArr ? idxArr[ti * 3    ] : ti * 3;
                const i1 = idxArr ? idxArr[ti * 3 + 1] : ti * 3 + 1;
                const i2 = idxArr ? idxArr[ti * 3 + 2] : ti * 3 + 2;
                vtx(i0, a); vtx(i1, b); vtx(i2, c);

                // Möller–Trumbore: ray origin = (0, ry, rz), direction = (1, 0, 0)
                const e1x = b[0]-a[0], e1y = b[1]-a[1], e1z = b[2]-a[2];
                const e2x = c[0]-a[0], e2y = c[1]-a[1], e2z = c[2]-a[2];
                // h = dir × e2  (dir = [1,0,0])  →  [0*e2z-0*e2y, 0*e2x-1*e2z, 1*e2y-0*e2x]
                //                                  = [0, -e2z, e2y]
                const hy = -e2z, hz = e2y;
                const det = /* e1x*0 + */ e1y * hy + e1z * hz;
                if (Math.abs(det) < 1e-10) continue;
                const inv = 1.0 / det;

                // s = rayOrigin - a  (rayOrigin.x = 0)
                const sx = -a[0], sy = ry - a[1], sz = rz - a[2];
                // u = (s · h) * inv  (hx=0 so s·h = sy*hy + sz*hz)
                const u = (sy * hy + sz * hz) * inv;
                if (u < 0 || u > 1) continue;

                // q = s × e1
                const qx = sy * e1z - sz * e1y;
                const qy = sz * e1x - sx * e1z;
                const qz = sx * e1y - sy * e1x;
                // v = (dir · q) * inv  (dir=[1,0,0] → dir·q = qx)
                const v = qx * inv;
                if (v < 0 || u + v > 1) continue;

                // t = (e2 · q) * inv  → hit world X = 0 + t*1 = t
                const hitX = (e2x * qx + e2y * qy + e2z * qz) * inv;
                hits.push(hitX);
            }

            if (!hits.length) continue;
            hits.sort((p, q) => p - q);

            // Walk voxels in X, toggling inside/outside at each hit
            let inside = false, hi = 0;
            for (let ix = 0; ix < nx; ix++) {
                const wx = ox + (ix + 0.5) * step;
                while (hi < hits.length && hits[hi] < wx) { inside = !inside; hi++; }
                if (inside) data[ix + nx * (iy + ny * iz)] = 1;
            }
        }
    }

    return { ox, oy, oz, step, nx, ny, nz, data };
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
