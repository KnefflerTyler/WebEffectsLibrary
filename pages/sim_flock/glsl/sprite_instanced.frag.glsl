#version 300 es
precision mediump float;

in vec2 vUv;
in float vAlpha;

// cols, rows, row, startCol
in vec4 vSheetA;

// endCol, animSpeed, animTime, frameOffset
in vec4 vSheetB;

uniform sampler2D uTexture;
uniform float uAlphaCutoff;

out vec4 outColor;

void main() {
    float uCols = vSheetA.x;
    float uRows = vSheetA.y;
    float uRow = vSheetA.z;
    float uStartCol = vSheetA.w;

    float uEndCol = vSheetB.x;
    float uAnimSpeed = vSheetB.y;
    float uTime = vSheetB.z;
    float uFrameOffset = vSheetB.w;

    float cols = max(1.0, uCols);
    float rows = max(1.0, uRows);

    float startC = clamp(uStartCol, 0.0, cols - 1.0);
    float endC = clamp(uEndCol, 0.0, cols - 1.0);
    float frameCount = max(1.0, endC - startC + 1.0);

    float localFrame = floor(mod(uTime * uAnimSpeed + uFrameOffset, frameCount));
    float frame = startC + localFrame;

    vec2 cell = vec2(1.0 / cols, 1.0 / rows);

    float r = clamp(uRow, 0.0, rows - 1.0);
    vec2 offset = vec2(frame * cell.x, r * cell.y);

    vec2 uv = offset + vUv * cell;

    vec4 color = texture(uTexture, uv);
    color.a *= vAlpha;

    if (color.a <= uAlphaCutoff) {
        discard;
    }

    outColor = color;
}