attribute float aAlpha;
varying   float vAlpha;

void main() {
    vAlpha      = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
