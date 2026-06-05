// ── Smoke GPGPU render vertex shader ─────────────────────────────────────────
//
// Reads particle world-position and normalised speed from the GPGPU state
// texture rather than vertex buffer attributes.  The only per-vertex input
// is aIndex (particle index 0 … N_SMOKE-1); position and speed come from a
// texture2D lookup, letting the GPU sim shader own all particle state.

precision highp float;

attribute float aIndex;       // particle index, 0 … N_SMOKE-1

uniform sampler2D uPosTex;    // GPGPU output: RGB = world pos, A = norm speed
uniform vec2  uTexSize;       // (TEX_W, TEX_H)

uniform vec3  uObjCenter;
uniform float uObjRadius;
uniform float uFadeMult;
uniform float uSizeScale;     // UI: Puff size
uniform float uDotMode;       // UI: 0 = soft puffs, 1 = hard dots

varying vec3  vColor;
varying float vAlpha;

vec3 speedRamp(float s) {
    s = clamp(s, 0.0, 2.0);
    if (s < 0.5) return mix(vec3(0.08, 0.18, 0.90), vec3(0.08, 0.85, 0.95), s * 2.0);
    if (s < 1.0) return mix(vec3(0.08, 0.85, 0.95), vec3(0.10, 0.90, 0.25), (s - 0.5) * 2.0);
    if (s < 1.5) return mix(vec3(0.10, 0.90, 0.25), vec3(0.95, 0.85, 0.10), (s - 1.0) * 2.0);
    return             mix(vec3(0.95, 0.85, 0.10), vec3(0.95, 0.10, 0.08), (s - 1.5) * 2.0);
}

void main() {
    // Decode texture UV from particle index
    float col = mod(aIndex, uTexSize.x);
    float row = floor(aIndex / uTexSize.x);
    vec2  uv  = (vec2(col, row) + 0.5) / uTexSize;

    vec4  state = texture2D(uPosTex, uv);
    vec3  pos   = state.xyz;
    float speed = state.w;

    // Desaturate toward a cool blue-white to differentiate from streamlines
    vColor = mix(vec3(0.60, 0.78, 1.00), speedRamp(speed), 0.38);

    // Alpha: denser/brighter in slow wake, translucent in fast freestream
    float sn = clamp(speed, 0.0, 2.0);
    vAlpha   = mix(0.72, 0.18, sn * 0.5);

    // Proximity fade near the object surface
    if (uObjRadius > 0.01) {
        float dist  = length(pos - uObjCenter);
        float inner = uObjRadius * 1.1;
        float outer = max(uObjRadius * uFadeMult, inner + 0.001);
        vAlpha *= 1.0 - smoothstep(inner, outer, dist);
    }

    // Perspective-correct billboard size: large soft puffs in slow flow, small in fast
    vec4  mvPos        = modelViewMatrix * vec4(pos, 1.0);
    float speedClamped = clamp(speed, 0.05, 2.5);
    float baseSize     = mix(3.0, 0.8, (speedClamped - 0.05) / 2.45);
    float modeScale    = uDotMode > 0.5 ? 0.35 : 1.0;
    gl_PointSize       = clamp(baseSize * uSizeScale * modeScale * (300.0 / -mvPos.z), 1.0, 24.0);
    gl_Position        = projectionMatrix * mvPos;
}
