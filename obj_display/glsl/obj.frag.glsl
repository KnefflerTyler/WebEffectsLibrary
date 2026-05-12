uniform vec3      uDiffuse;
uniform vec3      uAmbient;
uniform vec3      uSpecular;
uniform float     uShininess;
uniform float     uOpacity;

uniform vec3      uLightDir;
uniform vec3      uLightColor;
uniform vec3      uFillDir;
uniform vec3      uFillColor;

uniform bool      uHasTexture;
uniform sampler2D uTexture;

// 0 = solid (lit)  1 = unlit  2 = normals  3 = depth  4 = clay (no texture, lit)
uniform int       uViewMode;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // ── Normals mode ─────────────────────────────────────────────────────────
    if (uViewMode == 2) {
        gl_FragColor = vec4(N * 0.5 + 0.5, uOpacity);
        return;
    }

    // ── Depth mode ───────────────────────────────────────────────────────────
    if (uViewMode == 3) {
        float near = 0.01;
        float far  = 1000.0;
        float z = gl_FragCoord.z / gl_FragCoord.w;
        float d = clamp((z - near) / (far - near), 0.0, 1.0);
        float v = 1.0 - pow(d, 0.25);
        gl_FragColor = vec4(vec3(v), uOpacity);
        return;
    }

    // ── Base color ───────────────────────────────────────────────────────────
    // Clay mode: ignore texture, use a neutral clay colour
    vec3 baseColor = (uViewMode == 4)
        ? vec3(0.72, 0.56, 0.42)
        : (uHasTexture ? texture2D(uTexture, vUv).rgb : uDiffuse);

    // ── Unlit mode ───────────────────────────────────────────────────────────
    if (uViewMode == 1) {
        gl_FragColor = vec4(baseColor, uOpacity);
        return;
    }

    // ── Solid / Clay (lit) ───────────────────────────────────────────────────
    // Key light (Blinn-Phong)
    vec3 L1 = normalize(uLightDir);
    vec3 H1 = normalize(L1 + V);
    float diff1 = max(dot(N, L1), 0.0);
    float spec1 = (uViewMode == 4) ? 0.0 : pow(max(dot(N, H1), 0.0), max(uShininess, 1.0));

    // Fill light (diffuse only)
    vec3 L2 = normalize(uFillDir);
    float diff2 = max(dot(N, L2), 0.0) * 0.4;

    vec3 color = uAmbient * baseColor
               + diff1  * uLightColor * baseColor
               + spec1  * uLightColor * uSpecular
               + diff2  * uFillColor  * baseColor;

    gl_FragColor = vec4(color, uOpacity);
}
