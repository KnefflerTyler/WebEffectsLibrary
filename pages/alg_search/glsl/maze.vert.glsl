#version 300 es
/* ── Maze vertex shader ────────────────────────────────────────────────────
   Outputs a full-screen clip-space quad.
   gl_FragCoord in the fragment shader gives pixel coordinates directly.
*/
in vec2 a_pos;

void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
