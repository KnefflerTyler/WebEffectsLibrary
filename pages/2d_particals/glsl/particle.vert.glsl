uniform float uTime;

attribute float aAlpha;
attribute float aSize;
attribute float aHue;
attribute float aPhase;   // per-particle shimmer phase offset

varying  float vAlpha;
varying  float vHue;

void main() {
    vAlpha = aAlpha;
    vHue   = aHue;

    // Shimmer: size oscillates with individual phase offset so every particle
    // pulsates independently.
    float shimmer = 0.70 + 0.30 * sin(uTime * 11.0 + aPhase);
    gl_PointSize  = aSize * shimmer;
    gl_Position   = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
