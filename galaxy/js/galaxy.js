import THREE                  from './three.js';
import { GALAXY_CONFIG }      from './config.js';
import { Galaxy }             from './GalaxySystem.js';
import {
    BODY_VERT, BODY_FRAG,
    PLANET_FRAG, MOON_FRAG,
    STAR_FRAG,
    BLACKHOLE_FRAG,
} from './shaders.js';
import { createInputHandler } from './userinput.js';

// ── Renderer + Scene ─────────────────────────────────────────────────────────

const container = document.getElementById('pageBackground');

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.05,
    3000,
);

// ── Galaxy generation ─────────────────────────────────────────────────────────

const galaxy = new Galaxy(GALAXY_CONFIG);

// ── Instanced-mesh factory ────────────────────────────────────────────────────
//
// InstancedMesh = one GPU draw-call per body type regardless of body count.
// setColorAt() with vertexColors:true lets each instance carry its own colour.

const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const dummy   = new THREE.Object3D();

function buildMesh(bodies, material) {
    const count = Math.max(bodies.length, 1);
    const mesh  = new THREE.InstancedMesh(cubeGeo, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // avoid pop-in for fast-moving meteors

    bodies.forEach((body, i) => {
        dummy.position.copy(body.position);
        dummy.scale.setScalar(body.size);
        dummy.rotation.copy(body.rotation);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, body.color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    return mesh;
}

function syncMesh(mesh, bodies) {
    if (bodies.length === 0) return;
    bodies.forEach((body, i) => {
        dummy.position.copy(body.position);
        dummy.scale.setScalar(body.size);
        dummy.rotation.copy(body.rotation);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
}

// ── Shared light uniforms (updated in the animation loop) ───────────────────

const CORE_POS    = new THREE.Vector3(0, 5, 0);
const CORE_COLOR  = new THREE.Color(0xcc88ff);
const RIM_DIR     = new THREE.Vector3(60, 40, -30).normalize();
const RIM_COLOR   = new THREE.Color(0x4466ff);
const AMBIENT_COL = new THREE.Color(0x2a2a2a); // neutral grey — prevents purple bleed into planet colours

function bodyUniforms(shininess) {
    return {
        uShininess  : { value: shininess },
        uCorePos    : { value: CORE_POS },
        uCoreColor  : { value: CORE_COLOR },
        uCoreIntens : { value: 3.5 },
        uRimDir     : { value: RIM_DIR },
        uRimColor   : { value: RIM_COLOR },
        uAmbient    : { value: AMBIENT_COL },
    };
}

// ── TEST: Solid-colour materials per body type ───────────────────────────────
// Each type gets a distinct flat colour so they are unambiguously identifiable.
//   Stars       → bright yellow
//   Planets     → blue
//   Moons       → grey-white
//   Meteors     → brown-orange
//   Black holes → deep purple

const starMat      = new THREE.MeshBasicMaterial({ color: 0xffee44 });
const starGlowMat  = null;   // disabled during test
const planetMat    = new THREE.MeshBasicMaterial({ color: 0x3399ff });
const moonMat      = new THREE.MeshBasicMaterial({ color: 0xcccccc });
const meteorMat    = new THREE.MeshBasicMaterial({ color: 0xcc6622 });
const blackHoleMat = new THREE.MeshBasicMaterial({ color: 0x9900cc });

// ── Build instanced meshes ────────────────────────────────────────────────────

const starMesh      = buildMesh(galaxy.stars,      starMat);
const planetMesh    = buildMesh(galaxy.planets,    planetMat);
const moonMesh      = buildMesh(galaxy.moons,      moonMat);
const meteorMesh    = buildMesh(galaxy.meteors,    meteorMat);
const blackHoleMesh = buildMesh(galaxy.blackHoles, blackHoleMat);

// ── Accretion disk cube rings around black holes ───────────────────────────────
// 18 cubes in a ring — fits the cube-based pixel-art aesthetic.

const DISK_SEGS     = 18;
const diskCubeMat   = new THREE.MeshBasicMaterial({ vertexColors: true });
const accretionData = galaxy.blackHoles.map(bh => {
    const mesh  = new THREE.InstancedMesh(cubeGeo, diskCubeMat, DISK_SEGS);
    mesh.frustumCulled = false;
    const color = new THREE.Color();
    for (let i = 0; i < DISK_SEGS; i++) {
        const angle = (i / DISK_SEGS) * Math.PI * 2;
        const r     = bh.size * 3.8;
        dummy.position.set(bh.position.x + Math.cos(angle) * r, bh.position.y,
                           bh.position.z + Math.sin(angle) * r);
        dummy.scale.setScalar(bh.size * 0.38);
        dummy.rotation.set(0, -angle, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.setHSL(0.75 + (i / DISK_SEGS) * 0.22, 1.0, 0.55);
        mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    return { mesh, bh, phase: 0 };
});

// ── Background starfield ──────────────────────────────────────────────────────

const bgPositions = new Float32Array(2500 * 3);
for (let i = 0; i < 2500; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(Math.random() * 2 - 1);
    const r     = 500 + Math.random() * 300;
    bgPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    bgPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    bgPositions[i * 3 + 2] = r * Math.cos(phi);
}
const bgGeo = new THREE.BufferGeometry();
bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPositions, 3));
scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({
    color          : 0xffffff,
    size           : 0.6,
    sizeAttenuation: true,
    transparent    : true,
    opacity        : 0.75,
})));

// ── Galactic core glow ────────────────────────────────────────────────────────
// Small dim sphere — just enough to mark the galactic centre.

const glowMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.0, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.06 }),
);
scene.add(glowMesh);

// ── Lighting ──────────────────────────────────────────────────────────────────

scene.add(new THREE.AmbientLight(0x111128, 1.2));

const coreLight = new THREE.PointLight(0xcc88ff, 3.5, 180, 1.8);
coreLight.position.set(0, 5, 0);
scene.add(coreLight);

const rimLight = new THREE.DirectionalLight(0x4466ff, 0.4);
rimLight.position.set(60, 40, -30);
scene.add(rimLight);

// ── HUD ───────────────────────────────────────────────────────────────────────

const hud = document.createElement('div');
hud.style.cssText = `
    position: fixed; bottom: 20px; left: 20px;
    color: rgba(180,200,255,0.65);
    font-family: 'Courier New', monospace;
    font-size: 12px; pointer-events: none; line-height: 2;
    text-shadow: 0 0 10px rgba(120,160,255,0.5);
    user-select: none;
`;
hud.innerHTML =
    `GALAXY TYPE &nbsp;: ${GALAXY_CONFIG.type.toUpperCase()}<br>` +
    `STARS &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${galaxy.stars.length}<br>` +
    `PLANETS &nbsp;&nbsp;&nbsp;&nbsp;: ${galaxy.planets.length}<br>` +
    `MOONS &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${galaxy.moons.length}<br>` +
    `METEORS &nbsp;&nbsp;&nbsp;&nbsp;: ${galaxy.meteors.length}<br>` +
    `BLACK HOLES : ${galaxy.blackHoles.length}`;
document.body.appendChild(hud);

// ── Camera orbit ──────────────────────────────────────────────────────────────
//
// Spherical camera path driven by two independent sinusoids:
//
//   azimuth φ — horizontal rotation around the galaxy (fast-ish)
//   polar θ   — elevation from equator toward poles (slow, wide sweep)
//
// Using two incommensurable frequencies means the path never exactly repeats,
// so the viewer sees the disk edge-on, obliquely, and top-down over time.
//
//   φ(t) = φ_speed * t
//   θ(t) = θ_amp * sin(θ_speed * t)         ← swings −θ_amp … +θ_amp
//
// Camera sits at: ( cos(φ)·cos(θ)·R,  sin(θ)·R,  sin(φ)·cos(θ)·R )

const CAM_DIST_DEFAULT = GALAXY_CONFIG.cameraDistance;
const CAM_DIST_MIN     = 4;
const CAM_DIST_MAX     = CAM_DIST_DEFAULT * 3;
const ZOOM_SPEED       = 0.12;   // fraction of current distance per scroll tick

const PHI_SPEED   = 0.000035;   // rad/ms  — ∼5 min full lap
const THETA_SPEED = 0.0000083;  // rad/ms  — ∼12.5 min pole-to-pole cycle
const THETA_AMP   = 1.15;       // radians — goes well past 45°, approaches poles

let camPhi   = 0.0;   // auto-orbit azimuth
let camTheta = 0.0;   // auto-orbit polar phase

// Input handler — scroll zoom + right-click drag orbit
const input = createInputHandler(renderer.domElement, {
    distDefault: CAM_DIST_DEFAULT,
    distMin:     CAM_DIST_MIN,
    distMax:     CAM_DIST_MAX,
    zoomSpeed:   ZOOM_SPEED,
});

camera.position.set(0, CAM_DIST_DEFAULT * 0.3, CAM_DIST_DEFAULT);
camera.lookAt(0, 0, 0);

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Animation loop ────────────────────────────────────────────────────────────

let lastTime = performance.now();

(function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;

    // Advance simulation
    galaxy.update(dt);

    // Sync GPU matrices
    syncMesh(starMesh,      galaxy.stars);
    syncMesh(planetMesh,    galaxy.planets);
    syncMesh(moonMesh,      galaxy.moons);
    syncMesh(meteorMesh,    galaxy.meteors);
    syncMesh(blackHoleMesh, galaxy.blackHoles);

    // Sync accretion disk cube rings
    accretionData.forEach(item => {
        item.phase += 0.006 * dt;
        const { mesh, bh } = item;
        for (let i = 0; i < DISK_SEGS; i++) {
            const angle = item.phase + (i / DISK_SEGS) * Math.PI * 2;
            const r     = bh.size * 3.8;
            dummy.position.set(
                bh.position.x + Math.cos(angle) * r,
                bh.position.y,
                bh.position.z + Math.sin(angle) * r,
            );
            dummy.scale.setScalar(bh.size * 0.38);
            dummy.rotation.set(0.2, -angle, 0.2);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    // Pulsing core glow
    glowMesh.material.opacity = 0.07 + 0.03 * Math.sin(now * 0.0008);

    // Update time uniforms for animated shaders
    const t = now * 0.001;
    // (time uniforms unused during solid-colour test mode)

    // Advance spherical camera (auto-orbit + manual drag offset)
    camPhi   += PHI_SPEED   * 1000 * dt;
    camTheta += THETA_SPEED * 1000 * dt;

    const phi       = camPhi   + input.dragPhi;
    const elevation = Math.sin(camTheta) * THETA_AMP + input.dragTheta;
    const dist      = input.dist;

    camera.position.set(
        Math.cos(phi) * Math.cos(elevation) * dist,
        Math.sin(elevation)                 * dist,
        Math.sin(phi) * Math.cos(elevation) * dist,
    );
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
})();
