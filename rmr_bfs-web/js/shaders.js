/** GLSL vertex shader for the scrolling point grid */
export const POINT_VERTEX = /* glsl */`
    varying float vWorldZ;
    void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldZ = worldPos.z;
        gl_Position  = projectionMatrix * viewMatrix * worldPos;
        gl_PointSize = 3.0;
    }
`;

/** GLSL fragment shader for the scrolling point grid */
export const POINT_FRAGMENT = /* glsl */`
    uniform float uCameraZ;
    uniform float uFarDist;
    uniform vec3  uColor;
    varying float vWorldZ;
    void main() {
        float dist  = uCameraZ - vWorldZ;
        float alpha = 1.0 - clamp(dist / uFarDist, 0.0, 1.0);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
    }
`;

/** GLSL vertex shader for mouse-attraction line segments */
export const LINE_VERTEX = /* glsl */`
    attribute float aAlpha;
    varying   float vAlpha;
    void main() {
        vAlpha      = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

/** GLSL fragment shader for mouse-attraction line segments */
export const LINE_FRAGMENT = /* glsl */`
    uniform vec3  uColor;
    varying float vAlpha;
    void main() {
        if (vAlpha < 0.01) discard;
        gl_FragColor = vec4(uColor, vAlpha);
    }
`;
