import THREE             from './three.js';
import { GALAXY_CONFIG } from './config.js';
import { Galaxy }        from './GalaxySystem.js';
import {
    BODY_VERT, BODY_FRAG,
    STAR_FRAG,
    BLACKHOLE_FRAG,
} from './shaders.js';

// ── Renderer + Scene ─────────────────────────────────────────────────────────

const container = document.getElementById('pageBackground');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
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
const AMBIENT_COL = new THREE.Color(0x111128);

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

// ── Materials ─────────────────────────────────────────────────────────────────

// Stars — self-luminous, no external lighting
const starMat = new THREE.ShaderMaterial({
    vertexShader  : BODY_VERT,
    fragmentShader: STAR_FRAG,
    vertexColors  : true,
    uniforms: {
        uLuminosity: { value: 0.85 },
        uTime      : { value: 0 },
    },
});

// Planets — Blinn-Phong, moderate shininess
const planetMat = new THREE.ShaderMaterial({
    vertexShader  : BODY_VERT,
    fragmentShader: BODY_FRAG,
    vertexColors  : true,
    uniforms      : bodyUniforms(35),
});

// Moons — rougher surface, low shininess
const moonMat = new THREE.ShaderMaterial({
    vertexShader  : BODY_VERT,
    fragmentShader: BODY_FRAG,
    vertexColors  : true,
    uniforms      : bodyUniforms(12),
});

// Meteors — very rough, almost matte
const meteorMat = new THREE.ShaderMaterial({
    vertexShader  : BODY_VERT,
    fragmentShader: BODY_FRAG,
    vertexColors  : true,
    uniforms      : bodyUniforms(4),
});

// Black holes — animated rim / event horizon
const blackHoleMat = new THREE.ShaderMaterial({
    vertexShader  : BODY_VERT,
    fragmentShader: BLACKHOLE_FRAG,
    vertexColors  : true,
    uniforms: {
        uTime: { value: 0 },
    },
});

// ── Build instanced meshes ────────────────────────────────────────────────────

const starMesh      = buildMesh(galaxy.stars,      starMat);
const planetMesh    = buildMesh(galaxy.planets,    planetMat);
const moonMesh      = buildMesh(galaxy.moons,      moonMat);
const meteorMesh    = buildMesh(galaxy.meteors,    meteorMat);
const blackHoleMesh = buildMesh(galaxy.blackHoles, blackHoleMat);

// ── Accretion disks around black holes ────────────────────────────────────────

const accretionMeshes = galaxy.blackHoles.map(bh => {
    const geo  = new THREE.TorusGeometry(bh.size * 3.5, bh.size * 0.4, 6, 32);
    const mat  = new THREE.MeshBasicMaterial({
        color      : bh.accretionColor,
        transparent: true,
        opacity    : 0.55,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2 + bh.orbitTilt;
    scene.add(mesh);
    return mesh;
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

const glowMesh = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.10 }),
);
scene.add(glowMesh);

// Subtle galactic-disk plane
const diskMesh = new THREE.Mesh(
    new THREE.CircleGeometry(GALAXY_CONFIG.radius * 1.05, 64),
    new THREE.MeshBasicMaterial({
        color      : 0x3311aa,
        transparent: true,
        opacity    : 0.04,
        side       : THREE.DoubleSide,
    }),
);
diskMesh.rotation.x = Math.PI / 2;
scene.add(diskMesh);

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

let camAngle     = 0.0;
let camTiltPhase = 0.0;
const CAM_DIST       = GALAXY_CONFIG.cameraDistance;
const CAM_ORBIT_SPDS = 0.00025;  // rad/ms
const CAM_TILT_AMP   = 0.30;     // max tilt (rad)
const CAM_TILT_SPEED = 0.000055; // rad/ms

camera.position.set(0, CAM_DIST * 0.3, CAM_DIST);
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

    // Sync accretion disks
    galaxy.blackHoles.forEach((bh, i) => {
        accretionMeshes[i].position.copy(bh.position);
        accretionMeshes[i].rotation.z += 0.008;
    });

    // Pulsing core glow
    glowMesh.material.opacity = 0.07 + 0.03 * Math.sin(now * 0.0008);

    // Update time uniforms for animated shaders
    const t = now * 0.001;
    starMat.uniforms.uTime.value      = t;
    blackHoleMat.uniforms.uTime.value = t;

    // Orbit camera with slow vertical sine
    camAngle     += CAM_ORBIT_SPDS * 1000 * dt;
    camTiltPhase += CAM_TILT_SPEED  * 1000 * dt;

    camera.position.set(
        Math.cos(camAngle) * CAM_DIST,
        Math.sin(camTiltPhase) * CAM_TILT_AMP * CAM_DIST * 0.45,
        Math.sin(camAngle) * CAM_DIST,
    );
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
})();
