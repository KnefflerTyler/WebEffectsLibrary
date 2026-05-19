// ── Pressure cross-section plane — fragment shader ────────────────────────────
//
// Computes the pressure coefficient Cp = 1 − (v/U)² at each pixel using the
// exact analytical potential-flow solution for a sphere in uniform +Z flow:
//
//   v_x/U = −3R³ dz dx / (2r⁵)      (= −B·dz·dx)
//   v_y/U = −3R³ dz dy / (2r⁵)      (= −B·dz·dy)
//   v_z/U =  1 + R³/(2r³) − 3R³dz²/(2r⁵)  (= 1 + A − B·dz²)
//
// This is a pure GPU computation — no CPU data transfer per frame.
// Cp range: +1 (stagnation) → 0 (freestream) → −1.25 (suction peak at equator)
//
// Colour map (standard CFD cool-warm):
//   Red   = high pressure (Cp ≥ +0.8)
//   White = ambient pressure (Cp ≈ 0)
//   Blue  = low pressure   (Cp ≤ −1.0)

precision highp float;

uniform vec3  uObjCenter;   // world-space object centroid
uniform float uObjRadius;   // effective sphere radius (0 = no object)

varying vec3 vWorldPos;

// Standard CFD cool-warm ramp:  blue → white → red
// input t ∈ [0,1], 0 = Cp_min (−1.25), 1 = Cp_max (+1.0)
vec3 cpRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.5) {
        return mix(vec3(0.05, 0.10, 0.85), vec3(1.0, 1.0, 1.0), t * 2.0);
    } else {
        return mix(vec3(1.0, 1.0, 1.0), vec3(0.88, 0.04, 0.04), (t - 0.5) * 2.0);
    }
}

void main() {
    // No object — show a dim neutral field so the plane is still visible
    if (uObjRadius < 0.01) {
        gl_FragColor = vec4(cpRamp(0.5), 0.18);
        return;
    }

    vec3  d  = vWorldPos - uObjCenter;
    float r2 = dot(d, d);
    float R  = uObjRadius;

    // Inside the object bounding sphere — show dark silhouette
    if (r2 < R * R * 0.98) {
        gl_FragColor = vec4(0.05, 0.05, 0.08, 0.75);
        return;
    }

    float r  = sqrt(r2);
    float r3 = r2 * r;
    float r5 = r3 * r2;
    float R3 = R * R * R;

    float A = R3 / (2.0 * r3);
    float B = 3.0 * R3 / (2.0 * r5);

    // Normalised velocity components (divide by U — cancels out in Cp)
    float vz_n = 1.0 + A - B * d.z * d.z;
    float vx_n =           -B * d.z * d.x;
    float vy_n =           -B * d.z * d.y;

    float v2_n = vx_n * vx_n + vy_n * vy_n + vz_n * vz_n;
    float Cp   = 1.0 - v2_n;

    // Map Cp ∈ [−1.25, +1.0] → t ∈ [0, 1]
    float t = (Cp + 1.25) / 2.25;

    // Opacity: stronger near object, fades far away
    float distFade = 1.0 - smoothstep(R * 1.5, R * 6.0, r);
    float alpha    = mix(0.12, 0.52, distFade);

    gl_FragColor = vec4(cpRamp(t), alpha);
}
