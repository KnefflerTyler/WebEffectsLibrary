uniform vec3  uColor;       // face / solid color
uniform vec3  uLightDir;    // primary light direction (world space)
uniform vec3  uLightColor;  // primary light color
uniform vec3  uAmbient;     // ambient color
uniform float uShininess;

varying vec2  vUv;
varying vec3  vNormal;
varying vec3  vWorldPos;

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    // Diffuse
    float diff = max(dot(N, L), 0.0);

    // Specular (Blinn-Phong)
    float spec = pow(max(dot(N, H), 0.0), uShininess);

    vec3 color = uAmbient * uColor
               + diff * uLightColor * uColor
               + spec * uLightColor * 0.4;

    gl_FragColor = vec4(color, 1.0);
}
