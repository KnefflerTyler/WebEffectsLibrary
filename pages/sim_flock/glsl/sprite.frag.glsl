// Fragment shader that renders a single cell from a spritesheet.
// Animation uses a row/column system: each row is an animation/state,
// each column is a frame. Parameters control sheet layout and speed.

precision mediump float;

varying vec2 vUv;

uniform sampler2D uTexture;   // spritesheet texture
uniform float uTime;          // current time (seconds)
uniform float uAnimSpeed;     // frames per second
uniform float uCols;          // number of columns (frames per row)
uniform float uRows;          // number of rows
uniform float uRow;           // selected row (0-based)
uniform float uStartCol;     // start column index (inclusive, 0-based)
uniform float uEndCol;       // end column index (inclusive, 0-based)
uniform float uFrameOffset;   // optional offset to shift animation phase
uniform float uAlphaCutoff;   // discard threshold for transparency

void main() {
	// Safety: avoid divide-by-zero
	float cols = max(1.0, uCols);
	float rows = max(1.0, uRows);

	// Compute start/end and clamp
	float startC = clamp(uStartCol, 0.0, cols - 1.0);
	float endC   = clamp(uEndCol, 0.0, cols - 1.0);
	float frameCount = max(1.0, endC - startC + 1.0);

	// Determine current frame index within the start..end range
	float localFrame = floor(mod(uTime * uAnimSpeed + uFrameOffset, frameCount));
	float frame = startC + localFrame;

	// Size of each cell in UV space
	vec2 cell = vec2(1.0 / cols, 1.0 / rows);

	// Compute the UV offset for the chosen cell (row major)
	float r = clamp(uRow, 0.0, rows - 1.0);
	vec2 offset = vec2(frame * cell.x, r * cell.y);

	// Remap varying UV (0..1) into the selected cell
	vec2 uv = offset + vUv * cell;

	vec4 color = texture2D(uTexture, uv);
	if (color.a <= uAlphaCutoff) discard;

	gl_FragColor = color;
}

