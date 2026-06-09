'use strict';
/* ── Maze shader source strings ────────────────────────────────────────────
   Canonical GLSL source lives in glsl/maze.vert.glsl and glsl/maze.frag.glsl.
   These JS constants mirror those files so Renderer.js can compile them
   synchronously without a fetch() call.
*/

/* eslint-disable */
const MAZE_VERT_SRC = /* glsl */`#version 300 es
in vec2 a_pos;
void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const MAZE_FRAG_SRC = /* glsl */`#version 300 es
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

const vec3 C_BG    = vec3(0.039, 0.055, 0.078);
const vec3 C_FLOOR = vec3(0.086, 0.106, 0.133);
const vec3 C_ROOM  = vec3(0.118, 0.165, 0.118);
const vec3 C_WALL  = vec3(0.176, 0.216, 0.282);
const vec3 C_START = vec3(0.000, 0.839, 0.561);
const vec3 C_EXIT  = vec3(1.000, 0.278, 0.341);
const vec3 C_SOLID = vec3(0.031, 0.039, 0.051);

void main() {
    vec2 pixelPos = vec2(gl_FragCoord.x, u_canvasSize.y - gl_FragCoord.y);
    vec2 gridPos  = (pixelPos - u_offset) / u_cellSize;

    int col = int(floor(gridPos.x));
    int row = int(floor(gridPos.y));

    if (col < 0 || col >= int(u_gridSize.x) ||
        row < 0 || row >= int(u_gridSize.y)) {
        fragColor = vec4(C_BG, 1.0);
        return;
    }

    uvec4 s       = texelFetch(u_state, ivec2(col, row), 0);
    uint  state   = s.r;
    float intense = float(s.g) / 255.0;
    uint  wbits   = s.b;

    // Solid wall — fill entire cell, no wall-line overlay
    if (state == 6u) { fragColor = vec4(C_SOLID, 1.0); return; }

    vec2  cf = fract(gridPos);
    float wt = clamp(1.5 / u_cellSize, 0.01, 0.18);

    bool isWall =
        (cf.y < wt       && (wbits &  1u) != 0u) ||
        (cf.y > 1.0 - wt && (wbits &  2u) != 0u) ||
        (cf.x > 1.0 - wt && (wbits &  4u) != 0u) ||
        (cf.x < wt       && (wbits &  8u) != 0u);

    if (isWall) { fragColor = vec4(C_WALL, 1.0); return; }

    if (state == 4u) { fragColor = vec4(C_START,     1.0); return; }
    if (state == 5u) { fragColor = vec4(C_EXIT,      1.0); return; }
    if (state == 3u) { fragColor = vec4(u_pathColor, 1.0); return; }
    if (state == 2u) {
        float a = 0.13 + intense * 0.62;
        fragColor = vec4(mix(C_FLOOR, u_algColor, a), 1.0);
        return;
    }
    if (state == 1u) { fragColor = vec4(C_ROOM,  1.0); return; }
    fragColor = vec4(C_FLOOR, 1.0);
}`;
