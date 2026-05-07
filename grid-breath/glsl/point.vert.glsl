uniform float uPointSize;

attribute float aAlpha;
attribute float aScale;
varying   float vAlpha;

void main() {
    vAlpha       = aAlpha;
    gl_PointSize = uPointSize * aScale;
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
