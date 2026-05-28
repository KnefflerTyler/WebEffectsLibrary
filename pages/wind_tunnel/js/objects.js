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
 * @param {'none'|'sphere'|'cube'|'cylinder'|'cone'|'car'} type
 * @returns {Promise<void>}
 */
export async function loadPreset(type) {
    if (type === 'none') { _clearObject(); return; }

    // ── Torus: procedurally generated, no OBJ file needed ─────────────────────
    if (type === 'torus') {
        const R_maj = 1.0, r_min = 0.35;
        // TorusGeometry default axis = +Z (ring lies in XY plane), so the hole
        // faces the incoming +Z flow — perfect for demonstrating through-hole flow.
        const geo  = new THREE.TorusGeometry(R_maj, r_min, 24, 64);
        const mesh = new THREE.Mesh(geo, objectMat);
        const meta = PRESET_META.torus;
        _setObject(mesh, meta.label, meta.knownCd, meta.physLenM, meta.physAreaM2);
        return;
    }

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

    // Build BEM panel velocity grid so getVelocity uses mesh-accurate flow
    // deflection for every shape — no per-shape branches in physics.js.
    const panelGrid = buildPanelSystem(mesh.geometry, mesh.position, scaleFactor);

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
        // BEM precomputed velocity perturbation grid – topology-correct flow field
        panelGrid,
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

// ── BEM Panel Velocity Grid ───────────────────────────────────────────────────
/**
 * Build a precomputed panel-method velocity grid from the mesh geometry.
 *
 * Algorithm (Neumann BEM with lumped source panels):
 *   1. Sample ≤ N_MAX_PANELS triangle centroids, face normals, and areas.
 *   2. Assemble the N×N influence matrix M and solve M·σ = –n_z for the
 *      source strengths σ that satisfy the no-penetration condition at U=1.
 *   3. Evaluate the induced velocity perturbation on a 24³ grid covering the
 *      object's bounding box plus 1.5-unit padding.  Values are at U=1;
 *      physics.js multiplies by the actual wind speed U at query time.
 *
 * This is fully shape-agnostic: holes, gaps, cutouts, and any topological
 * feature emerge naturally from the BEM solution.  The torus hole, for
 * example, shows (near-)freestream flow through the opening because the ring
 * of panels has zero net z-perturbation at the hole centre — no torus-specific
 * code is needed anywhere in the pipeline.
 *
 * @param {THREE.BufferGeometry} geometry  centred, unscaled source geometry
 * @param {THREE.Vector3}        position  world-space mesh.position
 * @param {number}               scale     uniform scale factor
 * @returns {{ ox,oy,oz, dx,dy,dz, nx,ny,nz, vx,vy,vz }|null}
 */
const N_MAX_PANELS = 200;
const PANEL_GRID   = 24;       // grid resolution per axis (24³ = 13 824 cells)
const _INV4PI      = 1.0 / (4 * Math.PI);

function buildPanelSystem(geometry, position, scale) {
    const posAttr  = geometry.attributes.position.array;
    const idxArr   = geometry.index ? geometry.index.array : null;
    const triCount = idxArr ? (idxArr.length / 3) : (posAttr.length / 9);
    if (triCount < 8) return null;

    // Sample triangles uniformly across the mesh
    const N      = Math.min(triCount, N_MAX_PANELS);
    const stride = triCount / N;
    const pcx = new Float64Array(N), pcy = new Float64Array(N), pcz = new Float64Array(N);
    const pnx = new Float64Array(N), pny = new Float64Array(N), pnz = new Float64Array(N);
    const pA  = new Float64Array(N);

    function vtxW(i, out) {
        out[0] = posAttr[i * 3    ] * scale + position.x;
        out[1] = posAttr[i * 3 + 1] * scale + position.y;
        out[2] = posAttr[i * 3 + 2] * scale + position.z;
    }
    const va = new Float64Array(3), vb = new Float64Array(3), vc = new Float64Array(3);

    for (let p = 0; p < N; p++) {
        const ti = Math.floor(p * stride);
        const i0 = idxArr ? idxArr[ti * 3    ] : ti * 3;
        const i1 = idxArr ? idxArr[ti * 3 + 1] : ti * 3 + 1;
        const i2 = idxArr ? idxArr[ti * 3 + 2] : ti * 3 + 2;
        vtxW(i0, va); vtxW(i1, vb); vtxW(i2, vc);

        pcx[p] = (va[0] + vb[0] + vc[0]) / 3;
        pcy[p] = (va[1] + vb[1] + vc[1]) / 3;
        pcz[p] = (va[2] + vb[2] + vc[2]) / 3;

        const e1x = vb[0]-va[0], e1y = vb[1]-va[1], e1z = vb[2]-va[2];
        const e2x = vc[0]-va[0], e2y = vc[1]-va[1], e2z = vc[2]-va[2];
        const cx = e1y*e2z - e1z*e2y, cy = e1z*e2x - e1x*e2z, cz = e1x*e2y - e1y*e2x;
        const len = Math.sqrt(cx*cx + cy*cy + cz*cz);
        if (len < 1e-12) { pnz[p] = 1; continue; }
        pnx[p] = cx / len; pny[p] = cy / len; pnz[p] = cz / len;
        pA[p]  = len * 0.5;
    }

    // ── Assemble influence matrix M and RHS b ─────────────────────────────────
    // M[i][j] = A_j / (4π) · dot(xi–xj, ni) / |xi–xj|³   (i ≠ j)
    // M[i][i] = 0.5   (Neumann jump condition for exterior domain)
    // b[i]    = –nz_i  (no-penetration under unit +Z freestream)
    const M = new Float64Array(N * N);
    const b = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        M[i * N + i] = 0.5;
        b[i] = -pnz[i];
        const xi = pcx[i], yi = pcy[i], zi = pcz[i];
        const nix = pnx[i], niy = pny[i], niz = pnz[i];
        for (let j = 0; j < N; j++) {
            if (i === j) continue;
            const rx = xi - pcx[j], ry = yi - pcy[j], rz = zi - pcz[j];
            const r2 = rx*rx + ry*ry + rz*rz;
            if (r2 < 1e-12) continue;
            M[i * N + j] = pA[j] * _INV4PI * (rx*nix + ry*niy + rz*niz) / (r2 * Math.sqrt(r2));
        }
    }

    const sigma = _gaussianElim(M, b, N);
    if (!sigma) return null;

    // ── Precompute induced velocity on a PANEL_GRID³ grid ────────────────────
    geometry.computeBoundingBox();
    const bb  = geometry.boundingBox;
    const pad = 1.5;   // world-unit padding beyond bounding box
    const ox = bb.min.x * scale + position.x - pad,  ex = bb.max.x * scale + position.x + pad;
    const oy = bb.min.y * scale + position.y - pad,  ey = bb.max.y * scale + position.y + pad;
    const oz = bb.min.z * scale + position.z - pad,  ez = bb.max.z * scale + position.z + pad;
    const G = PANEL_GRID;
    const gdx = (ex - ox) / G, gdy = (ey - oy) / G, gdz = (ez - oz) / G;
    const gvx = new Float32Array(G * G * G);
    const gvy = new Float32Array(G * G * G);
    const gvz = new Float32Array(G * G * G);

    for (let iz = 0; iz < G; iz++) {
        for (let iy = 0; iy < G; iy++) {
            for (let ix = 0; ix < G; ix++) {
                const qx = ox + (ix + 0.5) * gdx;
                const qy = oy + (iy + 0.5) * gdy;
                const qz = oz + (iz + 0.5) * gdz;
                let svx = 0, svy = 0, svz = 0;
                for (let p = 0; p < N; p++) {
                    const rx = qx - pcx[p], ry = qy - pcy[p], rz = qz - pcz[p];
                    const r2 = rx*rx + ry*ry + rz*rz;
                    if (r2 < 1e-6) continue;
                    const s = sigma[p] * pA[p] * _INV4PI / (r2 * Math.sqrt(r2));
                    svx += s * rx; svy += s * ry; svz += s * rz;
                }
                const idx = ix + G * (iy + G * iz);
                gvx[idx] = svx; gvy[idx] = svy; gvz[idx] = svz;
            }
        }
    }
    return { ox, oy, oz, dx: gdx, dy: gdy, dz: gdz, nx: G, ny: G, nz: G,
             vx: gvx, vy: gvy, vz: gvz };
}

/** Gaussian elimination with partial pivoting.  Returns null if singular. */
function _gaussianElim(matIn, rhsIn, N) {
    const A = Float64Array.from(matIn), b = Float64Array.from(rhsIn);
    for (let col = 0; col < N; col++) {
        let maxV = Math.abs(A[col * N + col]), maxR = col;
        for (let row = col + 1; row < N; row++) {
            const v = Math.abs(A[row * N + col]);
            if (v > maxV) { maxV = v; maxR = row; }
        }
        if (maxV < 1e-14) return null;
        if (maxR !== col) {
            for (let k = 0; k < N; k++) {
                const t = A[col * N + k]; A[col * N + k] = A[maxR * N + k]; A[maxR * N + k] = t;
            }
            const t = b[col]; b[col] = b[maxR]; b[maxR] = t;
        }
        const inv = 1.0 / A[col * N + col];
        for (let row = col + 1; row < N; row++) {
            const f = A[row * N + col] * inv;
            for (let k = col; k < N; k++) A[row * N + k] -= f * A[col * N + k];
            b[row] -= f * b[col];
        }
    }
    const x = new Float64Array(N);
    for (let i = N - 1; i >= 0; i--) {
        let s = b[i];
        for (let j = i + 1; j < N; j++) s -= A[i * N + j] * x[j];
        x[i] = s / A[i * N + i];
    }
    return x;
}

// ── Optional callback (set by main.js after stats module is ready) ────────────
let _onObjectChange = null;
export function setObjectChangeCallback(fn) { _onObjectChange = fn; }
