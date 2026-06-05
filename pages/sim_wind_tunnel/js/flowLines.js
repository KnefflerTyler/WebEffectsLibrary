/**
 * flowLines.js — speed-coloured streamline ribbons from simulation paths.
 *
 * Static mode  : all segments visible, coloured by local speed (blue → red).
 * Animated mode: a comet-shaped bead travels along each path at a speed
 *                proportional to the local air speed — fast paths (near the
 *                equator) have fast-moving beads, stagnation zones are slow.
 *                The bead has a sharp leading edge and a linearly-fading tail
 *                so it reads visually as a moving air particle.
 *
 * Why LineSegments (not Lines)?  One merged geometry = one draw call no matter
 * how many paths are drawn.
 *
 * Animation is driven by calling updateFlowLinesTime(t) every frame from the
 * main animation loop.  It simply writes to the uTime uniform — zero GPU
 * re-upload of geometry data.
 */
import * as THREE from 'three';
import { scene }  from './scene.js';

// ── Tuning constants ──────────────────────────────────────────────────────────
const MAX_PATHS    = 250;    // paths rendered (evenly sampled from all paths)
const MAX_STEPS    = 350;    // steps kept per path  (≈ full tunnel at DT=0.022)
const ANIM_SPEED   = 0.28;   // bead cycles per second at freestream (ss = 1)
const BEAD_WIDTH   = 0.18;   // fraction of path length covered by comet tail

// ── Module state ──────────────────────────────────────────────────────────────
let _lines     = null;
let _opacity   = 0.75;
let _animated  = false;
let _beadWidth = BEAD_WIDTH;

// ── GLSL shaders ──────────────────────────────────────────────────────────────
// aPathT      : normalised position along path [0 = inlet, 1 = outlet]
// aPathOffset : per-path random phase so all beads don't align simultaneously
// aAvgSpeed   : mean ss of this path (scales bead travel speed)
// aColor      : pre-baked speed colour (vec3, linear)

const VERT_SRC = /* glsl */`
    attribute vec3  aColor;
    attribute float aPathT;
    attribute float aPathOffset;
    attribute float aAvgSpeed;

    uniform float uTime;
    uniform float uAnimate;
    uniform float uAnimSpeed;
    uniform float uBeadWidth;
    uniform float uOpacity;

    varying vec3  vColor;
    varying float vAlpha;

    void main() {
        vColor = aColor;

        if (uAnimate > 0.5) {
            // Bead front moves in the +pathT direction (inlet → outlet).
            // Faster paths (aAvgSpeed > 1) have proportionally faster beads.
            float beadFront = fract(uTime * uAnimSpeed * aAvgSpeed + aPathOffset);

            // Signed distance: +ve = vertex is behind the bead front (in tail)
            //                  -ve = vertex is ahead of the bead front
            float dist = beadFront - aPathT;
            if (dist >  0.5) dist -= 1.0;   // wrap seam at 0/1
            if (dist < -0.5) dist += 1.0;

            // Sharp leading edge, linear fade toward tail
            if (dist >= 0.0 && dist <= uBeadWidth) {
                vAlpha = (1.0 - dist / uBeadWidth) * uOpacity;
            } else {
                vAlpha = 0.0;
            }
        } else {
            // Static: all segments fully visible at base opacity
            vAlpha = uOpacity;
        }

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const FRAG_SRC = /* glsl */`
    varying vec3  vColor;
    varying float vAlpha;

    void main() {
        if (vAlpha < 0.005) discard;
        gl_FragColor = vec4(vColor, vAlpha);
    }
`;

// ── Speed → RGB colour (mirrors the velocity legend gradient) ─────────────────
// ss = 0.0 (stagnation) → blue
// ss = 1.0 (freestream) → green
// ss = 2.0 (fast)       → red
function speedColor(ss) {
    const t = Math.max(0, Math.min(1, ss * 0.5));
    let r, g, b;
    if      (t < 0.25) { const s = t / 0.25;          r = 0; g = s;     b = 1;   }
    else if (t < 0.50) { const s = (t - 0.25) / 0.25; r = 0; g = 1;     b = 1-s; }
    else if (t < 0.75) { const s = (t - 0.50) / 0.25; r = s; g = 1;     b = 0;   }
    else               { const s = (t - 0.75) / 0.25; r = 1; g = 1 - s; b = 0;   }
    return [r, g, b];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build (or rebuild) the flow-line geometry from a completed simulation.
 * Safe to call multiple times — disposes any previous geometry first.
 *
 * @param {Array<{xs,ys,zs,ss}>} paths3d
 * @returns {THREE.LineSegments|null}
 */
export function buildFlowLines(paths3d) {
    clearFlowLines();
    if (!paths3d?.length) return null;

    const pathStride = Math.max(1, Math.ceil(paths3d.length / MAX_PATHS));

    // Count segments first to allocate exact buffer sizes
    let totalSegs = 0;
    for (let p = 0; p < paths3d.length; p += pathStride) {
        const len = Math.min(paths3d[p].xs.length, MAX_STEPS);
        if (len > 1) totalSegs += len - 1;
    }
    if (totalSegs === 0) return null;

    // Each LineSegment = 2 vertices; each vertex has xyz, rgb, pathT, pathOffset, avgSpeed
    const positions   = new Float32Array(totalSegs * 6);
    const colors      = new Float32Array(totalSegs * 6);
    const pathT       = new Float32Array(totalSegs * 2);
    const pathOffset  = new Float32Array(totalSegs * 2);
    const avgSpeed    = new Float32Array(totalSegs * 2);

    let seg = 0;

    for (let p = 0; p < paths3d.length; p += pathStride) {
        const { xs, ys, zs, ss } = paths3d[p];
        const len = Math.min(xs.length, MAX_STEPS);
        if (len < 2) continue;

        // Per-path average speed (ss ≈ |v|/U)
        let ssSum = 0;
        for (let s = 0; s < len; s++) ssSum += ss[s];
        const ssMean = Math.max(0.1, ssSum / len);   // clamp away from 0

        // Random phase offset so beads don't all lap at the same moment
        const phase = Math.random();

        const lastIdx = len - 1;
        for (let s = 0; s < lastIdx; s++) {
            const t0 = s        / lastIdx;   // normalised path position at start
            const t1 = (s + 1)  / lastIdx;   // … at end

            // ── Segment start ──────────────────────────────────────────────────
            positions[seg * 6]     = xs[s];
            positions[seg * 6 + 1] = ys[s];
            positions[seg * 6 + 2] = zs[s];
            // ── Segment end ────────────────────────────────────────────────────
            positions[seg * 6 + 3] = xs[s + 1];
            positions[seg * 6 + 4] = ys[s + 1];
            positions[seg * 6 + 5] = zs[s + 1];

            // Colour each endpoint by its own local speed for a smooth gradient
            const [r0, g0, b0] = speedColor(ss[s]);
            const [r1, g1, b1] = speedColor(ss[s + 1]);
            colors[seg * 6]     = r0; colors[seg * 6 + 1] = g0; colors[seg * 6 + 2] = b0;
            colors[seg * 6 + 3] = r1; colors[seg * 6 + 4] = g1; colors[seg * 6 + 5] = b1;

            // Animation attributes (2 values per segment)
            pathT    [seg * 2]     = t0;
            pathT    [seg * 2 + 1] = t1;
            pathOffset[seg * 2]    = phase;
            pathOffset[seg * 2 + 1]= phase;
            avgSpeed [seg * 2]     = ssMean;
            avgSpeed [seg * 2 + 1] = ssMean;

            seg++;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',    new THREE.BufferAttribute(positions,    3));
    geo.setAttribute('aColor',      new THREE.BufferAttribute(colors,       3));
    geo.setAttribute('aPathT',      new THREE.BufferAttribute(pathT,        1));
    geo.setAttribute('aPathOffset', new THREE.BufferAttribute(pathOffset,   1));
    geo.setAttribute('aAvgSpeed',   new THREE.BufferAttribute(avgSpeed,     1));

    const mat = new THREE.ShaderMaterial({
        vertexShader  : VERT_SRC,
        fragmentShader: FRAG_SRC,
        transparent   : true,
        depthWrite    : false,
        uniforms: {
            uTime      : { value: 0 },
            uAnimate   : { value: _animated ? 1 : 0 },
            uAnimSpeed : { value: ANIM_SPEED },
            uBeadWidth : { value: _beadWidth },
            uOpacity   : { value: _opacity },
        },
    });

    _lines = new THREE.LineSegments(geo, mat);
    _lines.renderOrder = 1;   // after opaque meshes
    scene.add(_lines);
    return _lines;
}

/** Remove flow lines from scene and free GPU memory. */
export function clearFlowLines() {
    if (_lines) {
        scene.remove(_lines);
        _lines.geometry.dispose();
        _lines.material.dispose();
        _lines = null;
    }
}

/** Show / hide without rebuilding geometry. */
export function setFlowLinesVisible(visible) {
    if (_lines) _lines.visible = visible;
}

/**
 * Called every frame from the animation loop.
 * Writes elapsed time into the shader uniform — no geometry re-upload.
 *
 * @param {number} t  Elapsed seconds (e.g. from _totalTime in main.js)
 */
export function updateFlowLinesTime(t) {
    if (_lines) _lines.material.uniforms.uTime.value = t;
}

/** Enable or disable the animated bead mode. */
export function setFlowLinesAnimated(animated) {
    _animated = animated;
    if (_lines) _lines.material.uniforms.uAnimate.value = animated ? 1 : 0;
}

/** Adjust base opacity (0–1). */
export function setFlowLinesOpacity(opacity) {
    _opacity = opacity;
    if (_lines) _lines.material.uniforms.uOpacity.value = opacity;
}

/**
 * Set the comet tail length as a fraction of path length (0.05 – 0.50).
 * Smaller = tighter, sharper bead.  Larger = long glowing trail.
 *
 * @param {number} w
 */
export function setFlowLinesBeadWidth(w) {
    _beadWidth = w;
    if (_lines) _lines.material.uniforms.uBeadWidth.value = w;
}

/** Returns true when flow lines are currently in the scene. */
export function isFlowLinesActive() {
    return _lines !== null;
}
