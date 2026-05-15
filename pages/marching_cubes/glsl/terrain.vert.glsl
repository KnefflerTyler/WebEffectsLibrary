// ── Terrain vertex shader — GPU FBM displacement (GLSL ES 3.00 / WebGL 2) ────
// Three.js injects: modelMatrix, viewMatrix, projectionMatrix, normalMatrix,
// position (in vec3), normal (in vec3).
//
// Mesh geometry is a flat (y=0) XZ grid.  This shader evaluates seeded Perlin
// FBM noise to displace each vertex vertically and computes smooth normals via
// analytical central differences of the same noise function.

// ── Noise / FBM uniforms ──────────────────────────────────────────────────────
uniform sampler2D uPermTex;    // 512×1 R8 texture encoding the permutation table
uniform float     uNoiseScale;
uniform float     uOctaves;    // passed as float, cast to int in loop
uniform float     uPersistence;
uniform float     uLacunarity;
uniform float     uHeightScale;

out vec3  vNormal;
out vec3  vWorldPos;
out float vHeight;

// ── Permutation table lookup (512-wide, 1-tall R8 texture) ───────────────────
int perm(int i) {
    float u = (float(i) + 0.5) / 512.0;
    return int(texture(uPermTex, vec2(u, 0.5)).r * 255.0 + 0.5);
}

// ── Gradient contribution for one corner (12 unit-edge gradients) ─────────────
float grad3(int h, float x, float y, float z) {
    int g = h - (h / 12) * 12;   // h % 12
    if      (g == 0)  return  x + y;
    else if (g == 1)  return -x + y;
    else if (g == 2)  return  x - y;
    else if (g == 3)  return -x - y;
    else if (g == 4)  return  x + z;
    else if (g == 5)  return -x + z;
    else if (g == 6)  return  x - z;
    else if (g == 7)  return -x - z;
    else if (g == 8)  return  y + z;
    else if (g == 9)  return -y + z;
    else if (g == 10) return  y - z;
    else              return -y - z;
}

// ── Quintic fade ──────────────────────────────────────────────────────────────
float fade(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

// ── 3-D Perlin noise with y fixed to 0 (faithful JS port, y-dimension collapses)
float noise3xz(float x, float z) {
    int X = int(floor(x)) & 255;
    int Z = int(floor(z)) & 255;
    x -= floor(x);
    z -= floor(z);
    float u = fade(x), w = fade(z);

    // Y = 0 → v = fade(0) = 0 so the v-dimension lerps collapse to first arg.
    int A  = perm(X)     + 0;   // perm(X) + Y, Y=0
    int B  = perm(X + 1) + 0;
    int AA = perm(A)     + Z;
    int BA = perm(B)     + Z;

    return mix(
        mix(grad3(perm(AA),   x,      0.0,  z),
            grad3(perm(BA),   x-1.0,  0.0,  z), u),
        mix(grad3(perm(AA+1), x,      0.0,  z-1.0),
            grad3(perm(BA+1), x-1.0,  0.0,  z-1.0), u),
        w);
}

// ── Fractional Brownian Motion (matches JS fbm exactly) ──────────────────────
float fbm(float wx, float wz) {
    float amp    = 1.0;
    float freq   = uNoiseScale;
    float value  = 0.0;
    float maxAmp = 0.0;
    int   oct    = int(uOctaves);
    for (int i = 0; i < 16; i++) {
        if (i >= oct) break;
        value  += amp * noise3xz(wx * freq, wz * freq);
        maxAmp += amp;
        amp    *= uPersistence;
        freq   *= uLacunarity;
    }
    return maxAmp > 0.0 ? value / maxAmp : 0.0;
}

void main() {
    float wx = position.x;
    float wz = position.z;

    // ── Displace Y using FBM ──────────────────────────────────────────────────
    float wy = fbm(wx, wz) * uHeightScale;

    // ── Smooth normal via central differences (matches JS cellSize=1 step) ────
    float eps  = 1.0;
    float dydx = (fbm(wx + eps, wz) - fbm(wx - eps, wz)) * uHeightScale / (2.0 * eps);
    float dydz = (fbm(wx, wz + eps) - fbm(wx, wz - eps)) * uHeightScale / (2.0 * eps);
    vec3  localNormal = normalize(vec3(-dydx, 1.0, -dydz));

    // ── Transform and emit ────────────────────────────────────────────────────
    vec4 worldPos = modelMatrix * vec4(wx, wy, wz, 1.0);
    vWorldPos     = worldPos.xyz;
    vHeight       = wy;
    vNormal       = normalize(normalMatrix * localNormal);
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
}
