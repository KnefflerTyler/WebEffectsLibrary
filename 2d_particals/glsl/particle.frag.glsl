varying float vAlpha;
varying float vHue;

// Hue → RGB (full saturation, varies lightness via caller)
vec3 hue2rgb(float h) {
    float r = abs(h * 6.0 - 3.0) - 1.0;
    float g = 2.0 - abs(h * 6.0 - 2.0);
    float b = 2.0 - abs(h * 6.0 - 4.0);
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

// HSL → RGB (s always 1)
vec3 hsl(float h, float l) {
    vec3  rgb = hue2rgb(fract(h));
    float c   = (1.0 - abs(2.0 * l - 1.0));   // s = 1
    return (rgb - 0.5) * c + l;
}

void main() {
    if (vAlpha < 0.004) discard;

    float dist = length(gl_PointCoord - 0.5);
    if (dist > 0.5) discard;

    // Soft radial glow: bright white-hot core, saturated colour at edges
    float glow = pow(max(0.0, 1.0 - dist * 2.0), 1.5);
    vec3  col  = hsl(vHue, 0.38 + 0.57 * glow);   // core nearly white, rim saturated

    // Alpha: strong at core, falls off toward rim
    float a = vAlpha * (0.10 + 0.90 * glow);

    gl_FragColor = vec4(col, a);
}
