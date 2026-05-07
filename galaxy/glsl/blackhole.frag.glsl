// Black hole — near-perfect light absorber with animated accretion rim.

uniform float uTime;        // seconds since start

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec3 vColor;        // per-instance colour (near-black base)

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Fresnel: the "event horizon" glow at grazing angles
    float rim = 1.0 - max(dot(N, V), 0.0);
    rim = pow(rim, 3.5);

    // Animated colour cycling on the rim (accretion colour)
    float wave   = sin(uTime * 1.4 + rim * 8.0) * 0.5 + 0.5;
    vec3  rimCol = mix(vec3(0.55, 0.0, 1.0),   // violet
                       vec3(0.0,  0.8, 1.0),   // cyan
                       wave);

    // Core is near-black; only the rim is emissive
    vec3 color = vColor * (1.0 - rim * 0.85)
               + rimCol * rim * 1.6;

    // Hard vignette: centre face → very dark (light-absorbing core)
    float dist = length(vUv - 0.5) * 2.0;
    color *= mix(0.08, 1.0, clamp(dist / 0.85, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
}
