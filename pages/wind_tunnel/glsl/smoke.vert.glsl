// ── Smoke particle — vertex shader ───────────────────────────────────────────
//
// Each particle is a screen-space billboard point (rendered via THREE.Points).
// Size is inversely proportional to local flow speed:
//   • Fast freestream → small bright dot   (tight, energetic)
//   • Slow wake/stagnation → large soft puff (low-pressure, dispersed)
//
// This mirrors what you see in real smoke-wire wind tunnel experiments:
// coherent thin threads upstream, dispersing volumetric cloud in the wake.

precision highp float;

attribute float aSpeed;     // normalised flow speed (0=still, 1=freestream, >1=fast)

uniform vec3  uObjCenter;
uniform float uObjRadius;
uniform float uFadeMult;
uniform float uSizeScale;   // UI: Puff size ×  (default 1.0)uniform float uDotMode;     // UI: 0=soft puffs, 1=hard dots
varying vec3  vColor;
varying float vAlpha;

// Same velocity-to-colour ramp used by the streamlines for visual coherence.
// 0 → deep blue, 0.5 → cyan, 1 → green, 1.5 → yellow, 2 → red
vec3 speedRamp(float s) {
    s = clamp(s, 0.0, 2.0);
    if (s < 0.5) return mix(vec3(0.08, 0.18, 0.90), vec3(0.08, 0.85, 0.95), s * 2.0);
    if (s < 1.0) return mix(vec3(0.08, 0.85, 0.95), vec3(0.10, 0.90, 0.25), (s - 0.5) * 2.0);
    if (s < 1.5) return mix(vec3(0.10, 0.90, 0.25), vec3(0.95, 0.85, 0.10), (s - 1.0) * 2.0);
    return             mix(vec3(0.95, 0.85, 0.10), vec3(0.95, 0.10, 0.08), (s - 1.5) * 2.0);
}

void main() {
    // Desaturate toward a cool blue-white to differentiate smoke from the
    // fully-saturated streamlines while keeping the velocity story readable.
    vColor = mix(vec3(0.60, 0.78, 1.00), speedRamp(aSpeed), 0.38);

    // ── Proximity fade (same logic as streamlines) ────────────────────────────
    if (uObjRadius < 0.01) {
        vAlpha = 0.55;
    } else {
        float dist  = length(position - uObjCenter);
        float inner = uObjRadius * 1.05;
        float outer = max(uObjRadius * uFadeMult, inner + 0.001);
        vAlpha      = 1.0 - smoothstep(inner, outer, dist);
    }

    // ── Perspective-correct billboard size ───────────────────────────────────
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);

    // Larger puffs in slow flow, smaller dots in fast flow.
    // Range: aSpeed 0.05 → 3 px world-base, aSpeed 2.5 → 0.8 px world-base.
    float speedClamped = clamp(aSpeed, 0.05, 2.5);
    float baseSize     = mix(3.0, 0.8, (speedClamped - 0.05) / 2.45);

    // In dot mode scale down to a small crisp circle; puff mode uses full size.
    float modeScale = uDotMode > 0.5 ? 0.35 : 1.0;

    // Scale with distance so apparent size stays roughly constant in world space.
    // The constant 300.0 is tuned to the tunnel scale (TW≈10, camera at ~12 units).
    gl_PointSize = clamp(baseSize * uSizeScale * modeScale * (300.0 / -mvPos.z), 1.0, 24.0);

    gl_Position = projectionMatrix * mvPos;
}
