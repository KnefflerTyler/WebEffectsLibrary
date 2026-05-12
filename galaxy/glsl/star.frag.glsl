// Star — face-based flat emission with hard level quantization.
// Produces bright, punchy cubes that read clearly at galaxy scale.

uniform float uLuminosity;  // [0,1] overall brightness
uniform float uTime;        // seconds since start

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vColor;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Hard two-level quantization: front face = bright, back face = dim
    float facing = max(dot(N, V), 0.0);
    float level  = facing > 0.45 ? 1.0 : 0.35;

    // Very slow pulse — just enough life to feel like a star
    float pulse = 0.93 + 0.07 * sin(uTime * 1.2 + vWorldPos.x * 2.5);

    // Hot-white shift on the brightest face
    vec3 hotColor = mix(vColor, vec3(1.0, 1.0, 0.88), (facing - 0.45) * 0.8);
    vec3 emission = hotColor * uLuminosity * level * pulse;

    // Ensure minimum visible brightness so stars never vanish
    emission = max(emission, vColor * 0.25);

    gl_FragColor = vec4(emission, 1.0);
}
