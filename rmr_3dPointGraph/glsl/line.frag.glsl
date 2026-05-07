uniform vec3  uColor;
varying float vAlpha;

void main() {
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(uColor, vAlpha);
}
