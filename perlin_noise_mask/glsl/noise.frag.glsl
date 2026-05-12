// ── Uniforms ──────────────────────────────────────────────────────────────────
uniform float uTime;

// Noise shape
uniform float uScale;       // spatial frequency
uniform float uSpeed;       // animation speed
uniform float uDriftRatio;  // Y-axis drift speed relative to X

// Noise shaping
uniform float uContrast;    // power curve on noise output (>1 tighter, <1 expanded)
uniform float uAmplitude;   // stretches range around 0.5 (>1 = more extreme)
uniform float uBias;        // shifts all values up/down before threshold
uniform float uRidged;      // blend toward ridged (inverted-peak) noise (0–1)
uniform float uWarpStrength;// domain warp displacement amount (0 = off)
uniform float uWarpScale;   // spatial frequency of the warp noise

// Mask edge
uniform float uThreshold;   // noise value at which the mask edge sits (0–1)
uniform float uSoftness;    // blend width around the threshold

// FBM
uniform int   uOctaves;     // number of stacked noise layers (1–8)
uniform float uPersistence; // amplitude falloff per octave
uniform float uLacunarity;  // frequency multiplier per octave

// Appearance
uniform float         uMaskOpacity; // overall erase strength
uniform sampler2D     uTextTexture; // 2D canvas: text content snapshot

// Gradient background — 4 colour stops for a 135° linear gradient
uniform vec3  uGradColors[4];
uniform float uGradStops[4];

varying vec2 vUv;

// ── Gradient noise helpers ────────────────────────────────────────────────────
vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// Value in [0, 1]
float gradientNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f); // quintic-like smoothstep

    float a = dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.5 + 0.5;
}

// Fractional Brownian Motion
float fbm(vec2 p) {
    float value    = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float maxValue  = 0.0;

    for (int i = 0; i < 8; i++) {
        if (i >= uOctaves) break;
        value    += amplitude * gradientNoise(p * frequency);
        maxValue += amplitude;
        amplitude *= uPersistence;
        frequency *= uLacunarity;
    }
    return value / maxValue; // normalised to [0, 1]
}

// ── Gradient evaluation ───────────────────────────────────────────────────────
// Interpolates the four colour stops for the background gradient.
vec3 evalGradient(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < uGradStops[1]) {
        float f = (t - uGradStops[0]) / (uGradStops[1] - uGradStops[0]);
        return mix(uGradColors[0], uGradColors[1], f);
    } else if (t < uGradStops[2]) {
        float f = (t - uGradStops[1]) / (uGradStops[2] - uGradStops[1]);
        return mix(uGradColors[1], uGradColors[2], f);
    } else {
        float f = (t - uGradStops[2]) / (uGradStops[3] - uGradStops[2]);
        return mix(uGradColors[2], uGradColors[3], f);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
void main() {
    // 135° gradient: t=0 at top-left (UV 0,1), t=1 at bottom-right (UV 1,0)
    float gradT    = (vUv.x + (1.0 - vUv.y)) * 0.5;
    vec3 gradColor = evalGradient(gradT);

    // Animated noise coordinate — two axes drift at slightly different rates
    // so the field doesn't translate uniformly (feels more "alive")
    vec2 p = vUv * uScale + vec2(uTime * uSpeed, uTime * uSpeed * uDriftRatio);

    // Optional domain warp: displace p by a secondary noise field before
    // evaluating FBM, producing swirling / folded shapes
    if (uWarpStrength > 0.0) {
        vec2 wp = vUv * uWarpScale;
        float wx = gradientNoise(wp + vec2(1.7, 9.2));
        float wy = gradientNoise(wp + vec2(8.3, 2.8));
        p += (vec2(wx, wy) * 2.0 - 1.0) * uWarpStrength;
    }

    float n = fbm(p);

    // Ridged: blend between normal fbm and ridge form (1 - |2n-1|)
    float ridgedN = 1.0 - abs(n * 2.0 - 1.0);
    n = mix(n, ridgedN, uRidged);

    // Amplitude: stretch range around 0.5
    n = clamp((n - 0.5) * uAmplitude + 0.5, 0.0, 1.0);

    // Bias: shift the whole field up or down
    n = clamp(n + uBias, 0.0, 1.0);

    // Contrast: power curve reshapes the noise distribution
    n = pow(n, uContrast);

    // Smooth-step the noise value into a [0,1] mask alpha around the threshold
    float edge0 = uThreshold - uSoftness * 0.5;
    float edge1 = uThreshold + uSoftness * 0.5;
    float noiseAlpha = smoothstep(edge0, edge1, n);

    // Sample the text/content texture.
    // Where noiseAlpha is LOW  → pixel shows the content texture.
    // Where noiseAlpha is HIGH → pixel blends toward the gradient background.
    vec4 text  = texture2D(uTextTexture, vUv);
    vec3 color = mix(text.rgb, gradColor, noiseAlpha * uMaskOpacity);

    gl_FragColor = vec4(color, 1.0);
}

