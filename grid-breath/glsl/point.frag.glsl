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
