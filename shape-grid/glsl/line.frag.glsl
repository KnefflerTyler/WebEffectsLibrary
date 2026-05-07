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
