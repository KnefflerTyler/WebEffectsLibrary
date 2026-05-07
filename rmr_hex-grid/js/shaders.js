/**
 * Vertex shader for the hex-grid line segments.
 * Each vertex carries an `aAlpha` float (0–1) that drives the hover blend.
 */
export const LINE_VERTEX = /* glsl */`
    attribute float aAlpha;
    varying   float vAlpha;

    void main() {
        vAlpha      = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

/**
 * Fragment shader for the hex-grid line segments.
 * Lines are nearly invisible at rest (uMinOpacity) and glow bright on hover.
 * Matches the gridBreath fade-in/fade-out style.
 */
export const LINE_FRAGMENT = /* glsl */`
    uniform vec3  uColor;
    uniform vec3  uHoverColor;
    uniform float uMinOpacity;

    varying float vAlpha;

    void main() {
        if (vAlpha < 0.005 && uMinOpacity < 0.01) discard;
        vec3  col     = mix(uColor, uHoverColor, vAlpha);
        float opacity = mix(uMinOpacity, 1.0, vAlpha);
        gl_FragColor  = vec4(col, opacity);
    }
`;
