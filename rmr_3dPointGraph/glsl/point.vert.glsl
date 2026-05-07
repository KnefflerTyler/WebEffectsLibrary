varying float vWorldZ;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldZ = worldPos.z;
    gl_Position  = projectionMatrix * viewMatrix * worldPos;
    gl_PointSize = 3.0;
}
