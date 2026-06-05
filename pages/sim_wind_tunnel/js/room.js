/**
 * room.js — builds the wind-tunnel 3-D room.
 *
 * GPU improvements vs. old code:
 *   • Checkerboard floor uses a ShaderMaterial with procedural tiling in GLSL
 *     (replaces CPU-side Canvas texture generation).
 *   • Animated grid-glow pulse runs entirely on the GPU.
 *   • floor.vert / floor.frag are hot-reloadable GLSL source files.
 *
 * Export: floorMat  — update floorMat.uniforms.uTime.value each frame.
 */
import * as THREE from 'three';
import { TW, TH, TL } from './config.js';
import { FLOOR_VERT, FLOOR_FRAG } from './shaders.js';
import { scene } from './scene.js';

const lerp = (a, b, t) => a + (b - a) * t;

// ── Procedural floor material (GPU checkerboard + animated glow) ──────────────
export const floorMat = new THREE.ShaderMaterial({
    vertexShader  : FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: {
        uTime    : { value: 0 },
        uTileSize: { value: 1.0 },     // one checker tile = 1 world unit
    },
    side: THREE.FrontSide,
});

// ── Public init ───────────────────────────────────────────────────────────────
export function buildRoom() {
    _buildGlassWalls();
    _buildEdgeWireframe();
    _buildInletArrows();
    _buildFloor();
}

// ── Private helpers ───────────────────────────────────────────────────────────
function _buildGlassWalls() {
    const glassM = new THREE.MeshBasicMaterial({
        color: 0x2244aa, transparent: true, opacity: 0.06,
        side: THREE.DoubleSide, depthWrite: false,
    });

    const defs = [
        { pos: [-TW / 2, 0,       0], rotY:  Math.PI / 2, w: TL, h: TH }, // left
        { pos: [ TW / 2, 0,       0], rotY:  Math.PI / 2, w: TL, h: TH }, // right
        { pos: [0,        TH / 2, 0], rotX: -Math.PI / 2, w: TW, h: TL }, // ceiling
    ];

    for (const d of defs) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), glassM);
        if (d.rotY !== undefined) m.rotation.y = d.rotY;
        if (d.rotX !== undefined) m.rotation.x = d.rotX;
        m.position.set(...d.pos);
        scene.add(m);
    }
}

function _buildEdgeWireframe() {
    scene.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(TW, TH, TL)),
        new THREE.LineBasicMaterial({ color: 0x2255bb, transparent: true, opacity: 0.55 })
    ));
}

function _buildInletArrows() {
    // Small arrow segments on the inlet face (z = −TL/2) to show flow direction.
    const mat = new THREE.LineBasicMaterial({ color: 0x114499, transparent: true, opacity: 0.45 });
    for (let xi = 0; xi < 5; xi++) {
        for (let yi = 0; yi < 3; yi++) {
            const ax = lerp(-TW / 2 + 1, TW / 2 - 1, xi / 4);
            const ay = lerp(-TH / 2 + 0.5, TH / 2 - 0.5, yi / 2);
            const pts = [
                new THREE.Vector3(ax, ay, -TL / 2),
                new THREE.Vector3(ax, ay, -TL / 2 + 0.9),
            ];
            scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
        }
    }
}

function _buildFloor() {
    // PlaneGeometry rotated flat; uv not used — shader reads vWorldPos.xz instead.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(TW, TL), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TH / 2;
    scene.add(floor);
}
