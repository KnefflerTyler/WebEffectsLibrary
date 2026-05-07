/**
 * Vertex shader — passes the per-point alpha to the fragment and sizes the point.
 * aAlpha and aScale are both written every frame by gridBreath.js.
 */
export const POINT_VERTEX = /* glsl */`
    attribute float aAlpha;
    attribute float aScale;
    varying   float vAlpha;
    void main() {
        vAlpha       = aAlpha;
        gl_PointSize = uPointSize * aScale;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// uPointSize is injected as a uniform so it can be set from JS.
// Three.js ShaderMaterial doesn't include it by default, so we declare it here.
export const POINT_VERTEX_UNIFORMS = /* glsl */`
    uniform float uPointSize;
`;

/**
 * Fragment shader — blends between base color and hover color based on vAlpha,
 * and discards nearly-transparent fragments.
 */
export const POINT_FRAGMENT = /* glsl */`
    uniform vec3  uColor;
    uniform vec3  uHoverColor;
    varying float vAlpha;
    void main() {
        if (vAlpha < 0.005) discard;
        // Circular point shape
        if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
        vec3  col = mix(uColor, uHoverColor, vAlpha);
        float a   = mix(0.15, 1.0, vAlpha);
        gl_FragColor = vec4(col, a);
    }
`;
