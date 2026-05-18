// Deprecated: this monolithic file has been refactored into separate modules.
// See: js/main.js, js/scene.js, js/room.js, js/physics.js,
//      js/streamers.js, js/objects.js, js/stats.js, js/shaders.js
// GLSL shaders: glsl/streamer.{vert,frag}.glsl, glsl/object.{vert,frag}.glsl, glsl/floor.{vert,frag}.glsl

import * as THREE from 'three';
import { OBJLoader }      from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls }  from 'three/addons/controls/OrbitControls.js';
import { initPanelToggle } from '../../../shared/settings.js';
import {
    TW, TH, TL, VSIM, TRAIL_LEN, N_SX, N_SY,
    AIR_RHO, AIR_MU, PRESET_CD,
} from './config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ── Renderer / Scene / Camera ─────────────────────────────────────────────────
const container = document.getElementById('pageBackground');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x040810);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(10, 6, -12);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping   = true;
controls.dampingFactor   = 0.07;
controls.minDistance     = 4;
controls.maxDistance     = 40;

// Lighting
scene.add(new THREE.AmbientLight(0x2244aa, 2.0));
const keyLight = new THREE.DirectionalLight(0x88aaff, 2.5);
keyLight.position.set(5, 12, -6);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x4466cc, 1.0);
fillLight.position.set(-8, 3, 8);
scene.add(fillLight);

// ── Room Building ─────────────────────────────────────────────────────────────
(function buildRoom() {
    // --- Glass walls (transparent planes) ------------------------------------
    const glassM = new THREE.MeshBasicMaterial({
        color: 0x2244aa, transparent: true, opacity: 0.06, side: THREE.DoubleSide,
        depthWrite: false,
    });

    const wallDefs = [
        { pos: [-TW / 2, 0, 0], rotY: Math.PI / 2, w: TL, h: TH },  // left
        { pos: [ TW / 2, 0, 0], rotY: Math.PI / 2, w: TL, h: TH },  // right
        { pos: [0, TH / 2, 0],  rotX: -Math.PI / 2, w: TW, h: TL }, // ceiling
    ];
    for (const d of wallDefs) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), glassM);
        if (d.rotY !== undefined) m.rotation.y = d.rotY;
        if (d.rotX !== undefined) m.rotation.x = d.rotX;
        m.position.set(...d.pos);
        scene.add(m);
    }

    // --- Box edge wireframe --------------------------------------------------
    const boxEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(TW, TH, TL)),
        new THREE.LineBasicMaterial({ color: 0x2255bb, transparent: true, opacity: 0.55 })
    );
    scene.add(boxEdges);

    // --- Inlet indicator arrows (z = -TL/2 face) ----------------------------
    const arrowM = new THREE.LineBasicMaterial({ color: 0x114499, transparent: true, opacity: 0.45 });
    for (let xi = 0; xi < 5; xi++) {
        for (let yi = 0; yi < 3; yi++) {
            const ax = lerp(-TW / 2 + 1, TW / 2 - 1, xi / 4);
            const ay = lerp(-TH / 2 + 0.5, TH / 2 - 0.5, yi / 2);
            const pts = [
                new THREE.Vector3(ax, ay, -TL / 2),
                new THREE.Vector3(ax, ay, -TL / 2 + 0.9),
            ];
            scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arrowM));
        }
    }

    // --- Checkered floor (y = -TH/2) -----------------------------------------
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 512;
    const ctx = cvs.getContext('2d');
    const tile = 64;
    for (let x = 0; x < 512; x += tile) {
        for (let y = 0; y < 512; y += tile) {
            ctx.fillStyle = ((x + y) / tile % 2 === 0) ? '#0b1426' : '#091020';
            ctx.fillRect(x, y, tile, tile);
        }
    }
    ctx.strokeStyle = '#1a3060';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 512; i += tile) {
        ctx.beginPath(); ctx.moveTo(i, 0);   ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i);   ctx.lineTo(512, i); ctx.stroke();
    }
    const floorTex = new THREE.CanvasTexture(cvs);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(TW / 2, TL / 2);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(TW, TL),
        new THREE.MeshLambertMaterial({ map: floorTex })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TH / 2;
    scene.add(floor);

    // Subtle grid glow on floor
    const gPts = [];
    for (let x = -TW / 2; x <= TW / 2; x += 1) {
        gPts.push(x, -TH / 2 + 0.002, -TL / 2, x, -TH / 2 + 0.002, TL / 2);
    }
    for (let z = -TL / 2; z <= TL / 2; z += 1) {
        gPts.push(-TW / 2, -TH / 2 + 0.002, z, TW / 2, -TH / 2 + 0.002, z);
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPts, 3));
    scene.add(new THREE.LineSegments(gGeo,
        new THREE.LineBasicMaterial({ color: 0x1a3366, transparent: true, opacity: 0.25 })));
})();

// ── Velocity Color Mapping ────────────────────────────────────────────────────
/**
 * Map normalised speed (v / U_free) → RGB colour.
 * 0   = blue  (stagnation)
 * 0.5 = cyan
 * 1   = green (free-stream)
 * 1.5 = yellow
 * 2+  = red   (fast around equator)
 */
function speedToColor(s) {
    const t = clamp(s / 2.0, 0, 1);
    let r, g, b;
    if (t < 0.25)      { const f = t / 0.25;          r = 0;   g = f;   b = 1;   }
    else if (t < 0.5)  { const f = (t - 0.25) / 0.25; r = 0;   g = 1;   b = 1-f; }
    else if (t < 0.75) { const f = (t - 0.5)  / 0.25; r = f;   g = 1;   b = 0;   }
    else               { const f = (t - 0.75) / 0.25; r = 1;   g = 1-f; b = 0;   }
    return { r, g, b };
}

// ── Physics ───────────────────────────────────────────────────────────────────
/**
 * Effective sphere (for potential-flow model).
 * Set by setObject(); null = free stream.
 */
let objSphere = null; // { cx, cy, cz, r }
let simTime   = 0;

/**
 * Returns the velocity vector at world position (px, py, pz).
 * Uses exact potential-flow solution for a sphere (doublet + uniform flow),
 * plus a simplified wake deficit model downstream of the object.
 *
 * Flow direction is +Z (VSIM * windMultiplier units/sec).
 */
function getVelocity(px, py, pz, t, windMult) {
    const U = VSIM * windMult;
    let vx = 0, vy = 0, vz = U;

    if (!objSphere) return { x: vx, y: vy, z: vz };

    const { cx, cy, cz, r: R } = objSphere;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    const r2 = dx*dx + dy*dy + dz*dz;

    // Inside object → zero velocity
    if (r2 < R * R * 0.96) return { x: 0, y: 0, z: 0 };

    const dist = Math.sqrt(r2);
    const R3 = R * R * R;
    const r3 = dist * dist * dist;
    const r5 = r3 * dist * dist;

    // Potential-flow perturbation (flow in +Z, sphere at origin of local frame)
    //   vz +=  U*(R³/2r³ − 3R³dz²/2r⁵)
    //   vx -= 3U* R³ dz dx / 2r⁵
    //   vy -= 3U* R³ dz dy / 2r⁵
    const coeff  = R3 / (2 * r3);
    const coeff2 = 3 * R3 / (2 * r5);

    vz += U * (coeff - coeff2 * dz * dz);
    vx -= U * coeff2 * dz * dx;
    vy -= U * coeff2 * dz * dy;

    // Wake deficit (downstream of centre, beyond R)
    if (dz > 0) {
        const wR      = Math.sqrt(dx*dx + dy*dy);
        const wWidth  = R * (1.0 + 0.45 * dz / R);   // expands downstream
        if (wR < wWidth) {
            const fDecay  = Math.exp(-dz / (3.8 * R));
            const fRadial = Math.exp(-2 * wR*wR / (wWidth*wWidth));
            const deficit = U * 0.5 * fDecay * fRadial;
            vz -= deficit;
            // Unsteady turbulent fluctuations
            const turb = U * 0.09 * fDecay * fRadial;
            vx += turb * Math.sin(t * 2.3 + dx * 1.7 + dz * 0.9);
            vy += turb * Math.cos(t * 1.9 + dy * 2.1 + dz * 1.1);
        }
    }

    return { x: vx, y: vy, z: vz };
}

// ── Streamers ─────────────────────────────────────────────────────────────────
const streamerGroup = new THREE.Group();
scene.add(streamerGroup);

const streamerMat = new THREE.LineBasicMaterial({
    vertexColors : true,
    blending     : THREE.AdditiveBlending,
    depthWrite   : false,
    transparent  : true,
    opacity      : 0.9,
});

let streamers = [];

function buildStreamers(nX, nY) {
    streamerGroup.clear();
    streamers = [];

    for (let iy = 0; iy < nY; iy++) {
        for (let ix = 0; ix < nX; ix++) {
            const x0 = lerp(-TW / 2 + 0.9, TW / 2 - 0.9, nX > 1 ? ix / (nX - 1) : 0.5);
            const y0 = lerp(-TH / 2 + 0.4, TH / 2 - 0.4, nY > 1 ? iy / (nY - 1) : 0.5);

            const positions = new Float32Array(TRAIL_LEN * 3);
            const colors    = new Float32Array(TRAIL_LEN * 3);

            // Stagger initial Z so streamers don't all arrive together
            const startZ = -TL / 2 - (ix + iy * nX) * (TL / (nX * nY + 1));

            for (let i = 0; i < TRAIL_LEN; i++) {
                positions[i * 3 + 0] = x0;
                positions[i * 3 + 1] = y0;
                positions[i * 3 + 2] = startZ;
                const c = speedToColor(1.0);
                colors[i * 3]     = c.r;
                colors[i * 3 + 1] = c.g;
                colors[i * 3 + 2] = c.b;
            }

            const geo     = new THREE.BufferGeometry();
            const posAttr = new THREE.BufferAttribute(positions, 3);
            const colAttr = new THREE.BufferAttribute(colors, 3);
            posAttr.usage = THREE.DynamicDrawUsage;
            colAttr.usage = THREE.DynamicDrawUsage;
            geo.setAttribute('position', posAttr);
            geo.setAttribute('color',    colAttr);

            const line = new THREE.Line(geo, streamerMat);
            streamerGroup.add(line);

            streamers.push({ positions, colors, posAttr, colAttr, x0, y0, seed: Math.random() * Math.PI * 2 });
        }
    }
}

/** Advance all streamers one simulation step using RK4 integration. */
function advanceStreamers(dt, windMult) {
    simTime += dt;
    const T = TRAIL_LEN;

    for (const s of streamers) {
        const { positions: pos, colors: col, posAttr, colAttr } = s;

        const hx = pos[0], hy = pos[1], hz = pos[2];

        // ── RK4 ──────────────────────────────────────────────────────────────
        const v1 = getVelocity(hx, hy, hz, simTime, windMult);

        const m1x = hx + v1.x * dt * 0.5;
        const m1y = hy + v1.y * dt * 0.5;
        const m1z = hz + v1.z * dt * 0.5;
        const v2 = getVelocity(m1x, m1y, m1z, simTime, windMult);

        const m2x = hx + v2.x * dt * 0.5;
        const m2y = hy + v2.y * dt * 0.5;
        const m2z = hz + v2.z * dt * 0.5;
        const v3 = getVelocity(m2x, m2y, m2z, simTime, windMult);

        const e3x = hx + v3.x * dt;
        const e3y = hy + v3.y * dt;
        const e3z = hz + v3.z * dt;
        const v4 = getVelocity(e3x, e3y, e3z, simTime, windMult);

        const nx = hx + (v1.x + 2*v2.x + 2*v3.x + v4.x) * dt / 6;
        const ny = hy + (v1.y + 2*v2.y + 2*v3.y + v4.y) * dt / 6;
        const nz = hz + (v1.z + 2*v2.z + 2*v3.z + v4.z) * dt / 6;

        // Magnitude of representative velocity (midpoint)
        const spd = Math.sqrt(v2.x*v2.x + v2.y*v2.y + v2.z*v2.z) / (VSIM * windMult);

        // ── Reset if out of bounds ─────────────────────────────────────────────
        if (nz > TL / 2 + 0.5 || nz < -TL / 2 - 1.0 ||
            Math.abs(nx) > TW / 2 + 0.1 || Math.abs(ny) > TH / 2 + 0.1) {

            for (let i = 0; i < T; i++) {
                pos[i * 3]     = s.x0;
                pos[i * 3 + 1] = s.y0;
                pos[i * 3 + 2] = -TL / 2;
            }
            posAttr.needsUpdate = true;
            continue;
        }

        // ── Shift trail (new head at index 0) ─────────────────────────────────
        pos.copyWithin(3, 0, (T - 1) * 3);
        pos[0] = nx; pos[1] = ny; pos[2] = nz;

        col.copyWithin(3, 0, (T - 1) * 3);
        const c = speedToColor(spd);
        col[0] = c.r; col[1] = c.g; col[2] = c.b;

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
    }
}

// ── Object Management ─────────────────────────────────────────────────────────
let currentMesh = null;   // currently displayed mesh
let currentStats = null;  // { cd, frontAreaM2, lengthM, label }

const objectMat = new THREE.MeshPhongMaterial({
    color    : 0x8899cc,
    specular : 0x334477,
    shininess: 60,
    transparent: true,
    opacity  : 0.88,
});

/**
 * Place a mesh in the tunnel.
 * @param {THREE.Mesh} mesh
 * @param {string}     label
 * @param {number}     [knownCd]   - If provided, skip shape estimation
 * @param {number}     [physLenM]  - Physical length in metres (for Re / drag)
 * @param {number}     [physAreaM2]- Physical frontal area in m²
 */
function setObject(mesh, label, knownCd, physLenM, physAreaM2) {
    // Remove old object
    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
    }

    if (!mesh) {
        currentMesh = null;
        objSphere   = null;
        currentStats = null;
        updateStats();
        return;
    }

    // Centre + fit into tunnel
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const ctr = new THREE.Vector3();
    box.getCenter(ctr);
    mesh.position.sub(ctr);

    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = Math.min(TH * 0.6, TW * 0.35, 2.2);
    const scale = targetSize / maxDim;
    mesh.scale.multiplyScalar(scale);
    mesh.position.multiplyScalar(scale);

    mesh.material = objectMat;
    scene.add(mesh);
    currentMesh = mesh;

    // Bounding sphere for flow model
    const scaledBox  = new THREE.Box3().setFromObject(mesh);
    const scaledSize = new THREE.Vector3();
    scaledBox.getSize(scaledSize);
    const sphere = new THREE.Sphere();
    scaledBox.getBoundingSphere(sphere);

    objSphere = {
        cx: sphere.center.x,
        cy: sphere.center.y,
        cz: sphere.center.z,
        r : sphere.radius * 0.85,  // slightly smaller to keep flow tangent
    };

    // Drag metrics
    const Lz   = scaledSize.z;   // streamwise length (flow = +Z)
    const Hx   = scaledSize.x;   // frontal width
    const Hy   = scaledSize.y;   // frontal height
    const frontArea = Hx * Hy;   // simple frontal area estimate

    let cd = (knownCd !== undefined) ? knownCd : estimateCd(Lz / Math.sqrt(frontArea));

    // Physical dimensions (default: assume object ≈ 0.5 m characteristic length)
    const physLen  = physLenM   ?? 0.5;
    const physArea = physAreaM2 ?? (physLen * physLen * 0.7);

    currentStats = { cd, frontAreaM2: physArea, lengthM: physLen, label: label ?? 'Custom OBJ' };
    updateStats();
}

/**
 * Estimate Cd from fineness ratio (streamwise length / sqrt(frontal area)).
 * Based on empirical data for smooth axisymmetric bodies.
 */
function estimateCd(f) {
    if (f <= 0.25) return 1.17;
    if (f <= 0.5)  return lerp(1.17, 0.90, (f - 0.25) / 0.25);
    if (f <= 1.0)  return lerp(0.90, 0.47, (f - 0.5)  / 0.5 );
    if (f <= 2.0)  return lerp(0.47, 0.28, (f - 1.0)  / 1.0 );
    if (f <= 4.0)  return lerp(0.28, 0.12, (f - 2.0)  / 2.0 );
    if (f <= 8.0)  return lerp(0.12, 0.05, (f - 4.0)  / 4.0 );
    return 0.04;
}

// ── Stats Display ─────────────────────────────────────────────────────────────
function updateStats() {
    const windMs = parseFloat(document.getElementById('cfgWindSpeed')?.value ?? 50);

    const labelEl = document.getElementById('stat-object-label');
    if (!currentStats) {
        if (labelEl) labelEl.textContent = 'No object';
        ['stat-cd','stat-fd','stat-re','stat-area','stat-pow','stat-wake'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        const bar = document.getElementById('stat-eff-bar');
        const txt = document.getElementById('stat-eff');
        if (bar) { bar.style.width = '0%'; bar.style.background = '#555'; }
        if (txt) txt.textContent = '—';
        return;
    }

    if (labelEl) labelEl.textContent = currentStats.label;
    const { cd, frontAreaM2, lengthM } = currentStats;

    // Drag force:   Fd = ½ ρ v² Cd A
    const Fd = 0.5 * AIR_RHO * windMs * windMs * cd * frontAreaM2;
    // Reynolds:      Re = ρ v L / μ
    const Re = AIR_RHO * windMs * lengthM / AIR_MU;
    // Power:         P  = Fd · v
    const Pw = Fd * windMs;
    // Wake length estimate: ~ Cd * L (empirical)
    const Wl = cd * lengthM;
    // Efficiency score (0–100 %), 0=flat-plate (Cd≥1.17), 100=ideal (Cd→0)
    const eff = Math.max(0, Math.round((1 - cd / 1.17) * 100));

    const fmt = (n, dp, unit) => `${n.toFixed(dp)} ${unit}`;

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    set('stat-cd',   cd.toFixed(3));
    set('stat-fd',   fmt(Fd, 1, 'N'));
    set('stat-re',   Re >= 1e6 ? (Re / 1e6).toFixed(2) + ' M' : Math.round(Re).toLocaleString());
    set('stat-area', fmt(frontAreaM2, 3, 'm²'));
    set('stat-pow',  Pw >= 1000 ? fmt(Pw / 1000, 2, 'kW') : fmt(Pw, 1, 'W'));
    set('stat-wake', fmt(Wl, 2, 'm'));

    const bar = document.getElementById('stat-eff-bar');
    const txt = document.getElementById('stat-eff');
    if (bar) {
        bar.style.width = eff + '%';
        bar.style.background =
            eff >= 70 ? '#22cc66' :
            eff >= 40 ? '#ccaa22' : '#cc3322';
    }
    if (txt) txt.textContent = eff + '%';
}

// ── Preset Shapes ─────────────────────────────────────────────────────────────
function loadPreset(type) {
    if (type === 'none') { setObject(null); return; }

    let geo, cd, physLenM, physAreaM2, label, extraRot;

    switch (type) {
        case 'sphere':
            geo = new THREE.SphereGeometry(0.8, 40, 32);
            cd = PRESET_CD.sphere; label = 'Sphere';
            physLenM = 0.5; physAreaM2 = Math.PI * 0.25 * 0.25;
            break;

        case 'cube':
            geo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
            cd = PRESET_CD.cube; label = 'Cube';
            physLenM = 0.5; physAreaM2 = 0.5 * 0.5;
            break;

        case 'cylinder':
            // Cylinder lying along the flow axis (Z)
            geo = new THREE.CylinderGeometry(0.65, 0.65, 1.5, 40);
            extraRot = new THREE.Euler(Math.PI / 2, 0, 0); // rotate axis to Z
            cd = PRESET_CD.cylinder; label = 'Cylinder';
            physLenM = 0.6; physAreaM2 = Math.PI * 0.25 * 0.25;
            break;

        case 'cone':
            // Cone pointing into the flow (−Z = upstream)
            geo = new THREE.ConeGeometry(0.65, 2.0, 40);
            extraRot = new THREE.Euler(Math.PI / 2, 0, 0);
            cd = PRESET_CD.cone; label = 'Streamlined Cone';
            physLenM = 1.0; physAreaM2 = Math.PI * 0.2 * 0.2;
            break;

        case 'car':
            // Simplified car silhouette (two boxes merged)
            geo = buildCarGeo();
            cd = PRESET_CD.car; label = 'Car Body';
            physLenM = 4.5; physAreaM2 = 2.2;
            break;

        default: return;
    }

    const mesh = new THREE.Mesh(geo, objectMat.clone());
    if (extraRot) mesh.rotation.copy(extraRot);
    setObject(mesh, label, cd, physLenM, physAreaM2);
}

function buildCarGeo() {
    // Merge two boxes to make a simple car body profile
    const body  = new THREE.BoxGeometry(2.2, 0.65, 1.0);
    const cabin = new THREE.BoxGeometry(1.3, 0.65, 0.95);

    // Translate cabin vertices up and slightly forward
    const cabinPos = cabin.attributes.position;
    for (let i = 0; i < cabinPos.count; i++) {
        cabinPos.setY(i, cabinPos.getY(i) + 0.65);
        cabinPos.setZ(i, cabinPos.getZ(i) - 0.15);
    }
    cabinPos.needsUpdate = true;
    cabin.computeVertexNormals();

    // Merge manually
    const merged = mergeGeometries([body, cabin]);
    merged.computeVertexNormals();
    return merged;
}

/** Minimal geometry merge (only position + normal). */
function mergeGeometries(geos) {
    let totalVerts = 0;
    let totalIdx   = 0;
    for (const g of geos) {
        totalVerts += g.attributes.position.count;
        if (g.index) totalIdx += g.index.count;
    }

    const pos  = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    const idx  = totalIdx ? new Uint32Array(totalIdx) : null;

    let vOff = 0, iOff = 0;
    for (const g of geos) {
        const gPos  = g.attributes.position.array;
        const gNorm = g.attributes.normal?.array;
        const gIdx  = g.index?.array;
        const vBase = vOff / 3;

        pos.set(gPos, vOff);
        if (gNorm) norm.set(gNorm, vOff);
        vOff += gPos.length;

        if (gIdx && idx) {
            for (let i = 0; i < gIdx.length; i++) idx[iOff++] = gIdx[i] + vBase;
        }
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal',   new THREE.BufferAttribute(norm, 3));
    if (idx) out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
}

// ── OBJ Import ────────────────────────────────────────────────────────────────
const objLoader = new OBJLoader();

async function importOBJ(text) {
    const group = objLoader.parse(text);

    // Collect all geometries into one mesh
    const geos = [];
    group.traverse(child => {
        if (child.isMesh) geos.push(child.geometry);
    });

    if (!geos.length) {
        alert('No mesh data found in the OBJ file.');
        return;
    }

    const geo  = geos.length === 1 ? geos[0] : mergeGeometries(geos);
    const mesh = new THREE.Mesh(geo, objectMat.clone());

    // Compute bounding box BEFORE setObject scales it
    const box  = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Estimate fineness ratio in the Z (flow) direction
    const frontArea = size.x * size.y;
    const fineness  = size.z / Math.sqrt(frontArea);
    const cd        = estimateCd(fineness);

    // Assume 1 unit ≈ 0.1 m (scale to reasonable physical size)
    const physLenM  = size.z * 0.1;
    const physAreaM2 = frontArea * 0.01;

    setObject(mesh, 'Imported OBJ', cd, physLenM, physAreaM2);
}

// ── Velocity Legend Canvas ────────────────────────────────────────────────────
function drawLegend() {
    const cvs = document.getElementById('legend-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    const stops = [
        [0,     'rgb(0,0,255)'],
        [0.25,  'rgb(0,255,255)'],
        [0.5,   'rgb(0,255,0)'],
        [0.75,  'rgb(255,255,0)'],
        [1.0,   'rgb(255,0,0)'],
    ];
    stops.forEach(([t, c]) => grad.addColorStop(t, c));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
}

// ── Animation Loop ────────────────────────────────────────────────────────────
let lastTime   = 0;
let simRunning = true;

function animate(time) {
    requestAnimationFrame(animate);

    const dt = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    controls.update();

    if (simRunning) {
        const wm = parseFloat(document.getElementById('cfgWindMult')?.value ?? 1.0);
        advanceStreamers(dt, wm);
    }

    renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// ── Resize Handler ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// ── UI Wiring ─────────────────────────────────────────────────────────────────
// Settings panel toggle
initPanelToggle('spBtn', 'spPanel');

// Range → value display
['cfgWindSpeed', 'cfgWindMult', 'cfgStreamerX', 'cfgStreamerY'].forEach(id => {
    const el  = document.getElementById(id);
    const val = document.getElementById('val' + id.replace('cfg', ''));
    if (!el || !val) return;
    el.addEventListener('input', () => {
        val.textContent = parseFloat(el.value).toFixed(
            id === 'cfgWindMult' ? 1 : 0
        );
        if (id === 'cfgWindSpeed') updateStats();
        if (id === 'cfgStreamerX' || id === 'cfgStreamerY') rebuildStreamers();
    });
});

function rebuildStreamers() {
    const nx = parseInt(document.getElementById('cfgStreamerX')?.value ?? N_SX);
    const ny = parseInt(document.getElementById('cfgStreamerY')?.value ?? N_SY);
    buildStreamers(nx, ny);
}

// Preset shape buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadPreset(btn.dataset.shape);
    });
});

// Import OBJ
document.getElementById('importBtn')?.addEventListener('click', () =>
    document.getElementById('fileInput')?.click()
);
document.getElementById('fileInput')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById('importBtn').textContent = '⏳ Loading…';
    try {
        const text = await file.text();
        await importOBJ(text);
        document.getElementById('importBtn').textContent = '📁 ' + file.name.replace(/\.obj$/i, '');
    } catch (err) {
        console.error(err);
        alert('Failed to load OBJ: ' + err.message);
        document.getElementById('importBtn').textContent = '📂 Import OBJ';
    }
    e.target.value = ''; // allow re-importing same file
});

// Pause / Resume
document.getElementById('cfgPause')?.addEventListener('change', e => {
    simRunning = !e.target.checked;
});

// ── Init ──────────────────────────────────────────────────────────────────────
buildStreamers(N_SX, N_SY);
drawLegend();
loadPreset('sphere'); // start with a sphere so users see the effect immediately
