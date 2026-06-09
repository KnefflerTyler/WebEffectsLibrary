#version 300 es
/* ── Maze fragment shader ──────────────────────────────────────────────────
   Each fragment maps a screen pixel → grid cell → cell state.
   All N*M cells are coloured in parallel on the GPU.

   State texture (RGBA8UI, cols×rows):
     R  = state:  0=floor  1=room  2=visited  3=path  4=start  5=exit
     G  = visited intensity  0-255  (0 = earliest visited)
     B  = wall bits:  bit0(1)=N  bit1(2)=S  bit2(4)=E  bit3(8)=W
     A  = unused

   Uniforms:
     u_state       – cell state texture (unit 0)
     u_gridSize    – vec2(cols, rows)
     u_cellSize    – pixels per cell (square)
     u_offset      – vec2(ox, oy)  top-left corner of grid in pixel-space
     u_canvasSize  – vec2(width, height)  canvas dimensions in pixels
     u_algColor    – vec3  r/g/b  0-1  colour for visited-cell gradient
     u_pathColor   – vec3  r/g/b  0-1  colour for path cells
*/
precision highp float;
precision highp usampler2D;

uniform usampler2D u_state;
uniform vec2  u_gridSize;
uniform float u_cellSize;
uniform vec2  u_offset;
uniform vec2  u_canvasSize;
uniform vec3  u_algColor;
uniform vec3  u_pathColor;

out vec4 fragColor;

/* ── Colour constants ─────────────────────────────────────────────────────── */
const vec3 C_BG    = vec3(0.039, 0.055, 0.078);   /* #0a0e14 */
const vec3 C_FLOOR = vec3(0.086, 0.106, 0.133);   /* #161b22 */
const vec3 C_ROOM  = vec3(0.118, 0.165, 0.118);   /* #1e2a1e */
const vec3 C_WALL  = vec3(0.176, 0.216, 0.282);   /* #2d3748 */
const vec3 C_START = vec3(0.000, 0.839, 0.561);   /* #00d68f */
const vec3 C_EXIT  = vec3(1.000, 0.278, 0.341);   /* #ff4757 */
const vec3 C_SOLID = vec3(0.031, 0.039, 0.051);   /* #080a0d */

void main() {
    /* gl_FragCoord.xy has Y=0 at the bottom; canvas Y=0 is at the top. */
    vec2 pixelPos = vec2(gl_FragCoord.x, u_canvasSize.y - gl_FragCoord.y);
    vec2 gridPos  = (pixelPos - u_offset) / u_cellSize;

    int col = int(floor(gridPos.x));
    int row = int(floor(gridPos.y));

    /* Outside the grid → background */
    if (col < 0 || col >= int(u_gridSize.x) ||
        row < 0 || row >= int(u_gridSize.y)) {
        fragColor = vec4(C_BG, 1.0);
        return;
    }

    /* Sample cell state */
    uvec4 s       = texelFetch(u_state, ivec2(col, row), 0);
    uint  state   = s.r;
    float intense = float(s.g) / 255.0;
    uint  wbits   = s.b;

    /* Solid wall — fill entire cell, no wall-line overlay */
    if (state == 6u) { fragColor = vec4(C_SOLID, 1.0); return; }
    /* Wall detection – fractional position within this cell */
    vec2  cf = fract(gridPos);
    float wt = clamp(1.5 / u_cellSize, 0.01, 0.18);   /* wall thickness */

    bool isWall =
        (cf.y < wt       && (wbits &  1u) != 0u) ||   /* N */
        (cf.y > 1.0 - wt && (wbits &  2u) != 0u) ||   /* S */
        (cf.x > 1.0 - wt && (wbits &  4u) != 0u) ||   /* E */
        (cf.x < wt       && (wbits &  8u) != 0u);      /* W */

    if (isWall) { fragColor = vec4(C_WALL, 1.0); return; }

    /* Cell interior colour */
    if (state == 4u) { fragColor = vec4(C_START,     1.0); return; }
    if (state == 5u) { fragColor = vec4(C_EXIT,      1.0); return; }
    if (state == 3u) { fragColor = vec4(u_pathColor, 1.0); return; }
    if (state == 2u) {
        /* Visited gradient: faint early → bright recent */
        float a = 0.13 + intense * 0.62;
        fragColor = vec4(mix(C_FLOOR, u_algColor, a), 1.0);
        return;
    }
    if (state == 1u) { fragColor = vec4(C_ROOM,  1.0); return; }
    fragColor = vec4(C_FLOOR, 1.0);
}
