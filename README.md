# Web Effects Library

A collection of interactive visual effects, each self-contained in its own directory.

**Live site:** [https://tylerkneffler.github.io/WebEffectsLibrary/](https://knefflertyler.github.io/WebEffectsLibrary/)

## Effects

| Effect | Description |
|---|---|
| Default Cube | Basic rotating cube with custom shaders |
| Galaxy | Celestial body simulation with stars, planets, and moons |
| Grid Breath | Animated point grid with breathing effect |
| Shape Grid | Ripple and spotlight effects on a line grid |
| 3D Point Graph | Interactive 3D point cloud with mouse interaction |
| Perlin Noise Mask | Animated Perlin noise shader mask |
| OBJ Viewer | Upload and view `.obj`/`.mtl` models with multiple view modes |

## Running Locally

A local dev server is required (browsers block `fetch()` on `file://` URLs due to CORS):

```bash
npx serve .
```

Then open `http://localhost:3000`.
