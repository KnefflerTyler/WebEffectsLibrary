// ── Voxel terrain vertex shader — GPU FBM + quantization (GLSL ES 3.00 / WebGL 2)
// Mesh geometry is a flat (y=0) XZ grid.  This shader evaluates seeded Perlin
// FBM noise, quantizes the result to uCellSize steps to produce a blocky
// voxel-like surface, then derives face normals via central differences so the
// fragment shader can tell top faces (normal.y≈1) from step sides (normal.y≈0).

// ── Noise / FBM uniforms ──────────────────────────────────────────────────────
uniform sampler2D uPermTex;     // 512×1 R8 texture encoding the permutation table
uniform float     uNoiseScale;
uniform float     uOctaves;
uniform float     uPersistence;
uniform float     uLacunarity;
uniform float     uHeightScale;
uniform float     uCellSize;    // quantization step (= world units per voxel)

out vec3  vNormal;
out vec3  vWorldPos;
out float vHeight;

// ── Permutation table lookup ──────────────────────────────────────────────────
int perm(int i) {
    float u = (float(i) + 0.5) / 512.0;
    return int(texture(uPermTex, vec2(u, 0.5)).r * 255.0 + 0.5);
}

// ── Gradient contribution (12 unit-edge gradients) ────────────────────────────
float grad3(int h, float x, float y, float z) {
    int g = h - (h / 12) * 12;
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

float fade(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float noise3xz(float x, float z) {
    int X = int(floor(x)) & 255;
    int Z = int(floor(z)) & 255;
    x -= floor(x);
    z -= floor(z);
    float u = fade(x), w = fade(z);
    int A  = perm(X)     + 0;
    int B  = perm(X + 1) + 0;
    int AA = perm(A)     + Z;
    int BA = perm(B)     + Z;
    return mix(
        mix(grad3(perm(AA),   x,      0.0, z),
            grad3(perm(BA),   x-1.0,  0.0, z), u),
        mix(grad3(perm(AA+1), x,      0.0, z-1.0),
            grad3(perm(BA+1), x-1.0,  0.0, z-1.0), u),
        w);
}

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
    return value / maxAmp;
}

// ── Quantize a raw height to the nearest cellSize step ────────────────────────
float quantize(float h) {
    return floor(h / uCellSize + 0.5) * uCellSize;
}

float height(float wx, float wz) {
    return quantize(fbm(wx, wz) * uHeightScale);
}

void main() {
    float wx = position.x;
    float wz = position.z;

    float wy  = height(wx, wz);

    // ── Normal via central differences of the quantized surface ──────────────
    // eps = cellSize so neighbors snap to the same grid the vertices use,
    // producing (0,1,0) on flat tops and steeply-tilted normals at step edges.
    float eps  = uCellSize;
    float dydx = (height(wx + eps, wz) - height(wx - eps, wz)) / (2.0 * eps);
    float dydz = (height(wx, wz + eps) - height(wx, wz - eps)) / (2.0 * eps);
    vec3  localNormal = normalize(vec3(-dydx, 1.0, -dydz));

    // ── Transform and emit ────────────────────────────────────────────────────
    vec4 worldPos = modelMatrix * vec4(wx, wy, wz, 1.0);
    vWorldPos     = worldPos.xyz;
    vHeight       = wy;
    vNormal       = normalize(normalMatrix * localNormal);
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
}
