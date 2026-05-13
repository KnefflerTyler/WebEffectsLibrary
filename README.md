# Web Effects Library

A collection of interactive visual effects, each self-contained in its own directory.

**Live site:** [https://tylerkneffler.github.io/WebEffectsLibrary/](https://tylerkneffler.github.io/WebEffectsLibrary/)

## Effects

| Effect | Description |
|---|---|
| [Default Cube](https://tylerkneffler.github.io/WebEffectsLibrary/default_cube/) | Basic rotating cube with custom shaders |
| [Galaxy](https://tylerkneffler.github.io/WebEffectsLibrary/galaxy/) | Celestial body simulation with stars, planets, and moons |
| [Grid Breath](https://tylerkneffler.github.io/WebEffectsLibrary/grid_breath/) | Animated point grid with breathing effect |
| [Shape Grid](https://tylerkneffler.github.io/WebEffectsLibrary/grid_shape/) | Ripple and spotlight effects on a line grid |
| [3D Point Graph](https://tylerkneffler.github.io/WebEffectsLibrary/grid_3d_points/) | Interactive 3D point cloud with mouse interaction |
| [Perlin Noise Mask](https://tylerkneffler.github.io/WebEffectsLibrary/perlin_noise_mask/) | Animated Perlin noise shader mask |
| [OBJ Viewer](https://tylerkneffler.github.io/WebEffectsLibrary/obj_display/) | Upload and view `.obj`/`.mtl` models with multiple view modes |
| [Parallax Horizontal](https://tylerkneffler.github.io/WebEffectsLibrary/Parallax_Horizontal/) | Horizontal multi-layer parallax scrolling |
| [Parallax Vertical](https://tylerkneffler.github.io/WebEffectsLibrary/Parallax_Vertical/) | Vertical multi-layer parallax scrolling |
| [Marching Cubes](https://tylerkneffler.github.io/WebEffectsLibrary/marching_cubes/) | Infinite procedural terrain with Perlin fBm noise, chunk streaming, fog, and a fly camera |

## Running Locally

A local dev server is required (browsers block `fetch()` on `file://` URLs due to CORS):

```bash
npx serve .
```

Then open `http://localhost:3000`.
