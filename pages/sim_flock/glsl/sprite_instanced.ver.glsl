#version 300 es
precision mediump float;

layout(location = 0) in vec2 aCorner;

// x, y, width, height
layout(location = 1) in vec4 aTransform;

// rotation, alpha
layout(location = 2) in vec2 aRotAlpha;

// cols, rows, row, startCol
layout(location = 3) in vec4 aSheetA;

// endCol, animSpeed, animTime, frameOffset
layout(location = 4) in vec4 aSheetB;

uniform vec2 uResolution;

out vec2 vUv;
out float vAlpha;
out vec4 vSheetA;
out vec4 vSheetB;

void main() {
    vec2 pos = aTransform.xy;
    vec2 size = aTransform.zw;

    float rotation = aRotAlpha.x;
    float alpha = aRotAlpha.y;

    vec2 centered = aCorner - vec2(0.5);

    float c = cos(rotation);
    float s = sin(rotation);

    vec2 local = centered * size;

    vec2 rotated = vec2(
        local.x * c - local.y * s,
        local.x * s + local.y * c
    );

    vec2 world = pos + rotated;

    vec2 zeroToOne = world / uResolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clip = zeroToTwo - 1.0;

    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

    vUv = aCorner;
    vAlpha = alpha;
    vSheetA = aSheetA;
    vSheetB = aSheetB;
}