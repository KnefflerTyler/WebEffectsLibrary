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
