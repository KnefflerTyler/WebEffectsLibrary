// Planet / Moon / Meteor — Blinn-Phong with galactic-core point light + rim directional.

uniform float uShininess;   // specular tightness

// Galactic core point light
uniform vec3  uCorePos;     // world-space position of the core light
uniform vec3  uCoreColor;   // core light colour
uniform float uCoreIntens;  // core intensity

// Rim directional light
uniform vec3  uRimDir;      // world-space direction (normalised)
uniform vec3  uRimColor;    // rim light colour

// Ambient
uniform vec3  uAmbient;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vColor;        // per-instance colour from instanceColor buffer

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Core point light
    vec3  toCore    = uCorePos - vWorldPos;
    float coreDist  = length(toCore);
    vec3  L_core    = toCore / coreDist;
    float atten     = uCoreIntens / (1.0 + 0.004 * coreDist * coreDist);

    float diff_core = max(dot(N, L_core), 0.0);
    vec3  H_core    = normalize(L_core + V);
    float spec_core = pow(max(dot(N, H_core), 0.0), uShininess);

    // Rim directional light
    vec3  L_rim    = normalize(uRimDir);
    float diff_rim = max(dot(N, L_rim), 0.0);
    vec3  H_rim    = normalize(L_rim + V);
    float spec_rim = pow(max(dot(N, H_rim), 0.0), uShininess * 0.5);

    // Combine
    vec3 color = uAmbient * vColor
               + diff_core * atten * uCoreColor * vColor
               + spec_core * atten * uCoreColor * 0.35
               + diff_rim  * uRimColor * vColor * 0.30
               + spec_rim  * uRimColor * 0.10;

    gl_FragColor = vec4(color, 1.0);
}
