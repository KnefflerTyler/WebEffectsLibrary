// Planet / Moon / Meteor — cel (toon) shading for pixel-art cube look.
// Hard-quantized diffuse bands: bright / mid / dark — no specular.

uniform float uShininess;   // unused in cel mode, kept for API consistency

// Galactic core point light
uniform vec3  uCorePos;
uniform vec3  uCoreColor;
uniform float uCoreIntens;

// Rim directional light
uniform vec3  uRimDir;
uniform vec3  uRimColor;

// Ambient
uniform vec3  uAmbient;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vColor;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Core point light (attenuated)
    vec3  toCore   = uCorePos - vWorldPos;
    float coreDist = length(toCore);
    vec3  L_core   = toCore / coreDist;
    float atten    = uCoreIntens / (1.0 + 0.006 * coreDist * coreDist);
    float d_core   = max(dot(N, L_core), 0.0) * atten;

    // Rim directional
    float d_rim = max(dot(N, normalize(uRimDir)), 0.0) * 0.5;

    // Combined brightness, quantized into 3 cel bands
    float brightness = clamp(d_core + d_rim, 0.0, 1.0);
    float cel;
    if      (brightness > 0.55) cel = 1.0;
    else if (brightness > 0.20) cel = 0.55;
    else                        cel = 0.28;  // raised from 0.12 — keeps planet hue on dark faces

    // Lit colour + neutral ambient floor so dark faces show their actual hue.
    // uAmbient is kept as a gentle multiplier (no 2× boost) to avoid purple cast.
    vec3 lit   = vColor * cel;
    vec3 amb   = uAmbient * vColor;
    vec3 color = max(lit, amb);

    // Silhouette darkening: faces nearly perpendicular to camera go darker,
    // which makes individual cube edges pop at pixel-art scale.
    float edge = smoothstep(0.0, 0.28, max(dot(N, V), 0.0));
    color *= mix(0.15, 1.0, edge);

    gl_FragColor = vec4(color, 1.0);
}
