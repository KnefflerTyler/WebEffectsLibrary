// Star — self-luminous with animated corona pulse and Fresnel rim glow.

uniform float uLuminosity;  // [0,1] brightness scalar
uniform float uTime;        // seconds since start

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vColor;        // per-instance colour from instanceColor buffer

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Fresnel glow: brighten edges like a stellar corona
    float fresnel = 1.0 - max(dot(N, V), 0.0);
    fresnel = pow(fresnel, 2.2);

    // Animated pulse (subtle surface shimmer)
    float pulse = 0.92 + 0.08 * sin(uTime * 2.3 + vWorldPos.x * 4.0);

    // Base emission — stars emit their own light; no external lighting needed.
    vec3 emission = vColor * uLuminosity * pulse;

    // Corona overlay: slightly shifted hue toward white at the rim
    vec3 coronaColor = mix(vColor, vec3(1.0, 0.95, 0.80), fresnel * 0.55);
    emission = mix(emission, coronaColor * uLuminosity * 1.35, fresnel * 0.7);

    // Soft bloom core (center of face is brighter)
    float centerBrightness = 1.0 + 0.25 * max(dot(N, V) - 0.7, 0.0);
    emission *= centerBrightness;

    gl_FragColor = vec4(emission, 1.0);
}
