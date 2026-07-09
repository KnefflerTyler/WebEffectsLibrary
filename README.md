# Web Effects Library

A growing collection of interactive browser-based visual effects, simulations, rendering experiments, and algorithm visualizers. Each demo is self-contained in its own directory and can be viewed directly in the browser.

**Live Demo:**
https://tylerkneffler.github.io/WebEffectsLibrary/index.html

## Effects Library

### WebGL, Shaders, and 3D Rendering

| Effect                                                                                    | Description                                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Default Cube](https://tylerkneffler.github.io/WebEffectsLibrary/pages/default_cube/index.html)           | Basic rotating cube rendered with custom GLSL shaders             |
| [Galaxy](https://tylerkneffler.github.io/WebEffectsLibrary/pages/galaxy/index.html)                       | Celestial simulation with stars, planets, and moons               |
| [3D Point Graph](https://tylerkneffler.github.io/WebEffectsLibrary/pages/grid_3d_points/index.html)       | Interactive 3D point cloud with mouse interaction                 |
| [Perlin Noise Mask](https://tylerkneffler.github.io/WebEffectsLibrary/pages/perlin_noise_mask/index.html) | Animated Perlin noise shader mask                                 |
| [OBJ Viewer](https://tylerkneffler.github.io/WebEffectsLibrary/pages/obj_display/index.html)              | Upload and view `.obj` and `.mtl` models with multiple view modes |

### Procedural Terrain and Voxel Rendering

| Effect                                                                                | Description                                                                                               |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Marching Cubes](https://tylerkneffler.github.io/WebEffectsLibrary/pages/marching_cubes/index.html)   | Smooth procedural terrain with GPU Perlin fBm displacement, chunk streaming, fog, and fly camera controls |
| [Hex Terrain](https://tylerkneffler.github.io/WebEffectsLibrary/pages/marching_hex/index.html)        | GPU-driven procedural terrain built from pointy-top hexagonal cells                                       |
| [Cubic Voxel Terrain](https://tylerkneffler.github.io/WebEffectsLibrary/pages/voxel_cubes/index.html) | Blocky voxel-style terrain using GPU Perlin fBm quantized into discrete height steps                      |
| [Hex Voxel Terrain](https://tylerkneffler.github.io/WebEffectsLibrary/pages/voxel_hex/index.html)     | Hexagonal voxel terrain with GPU noise and stepped terrain topology                                       |

### Particles, Physics, and Simulations

| Effect                                                                                       | Description                                                          |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [2D Particles](https://tylerkneffler.github.io/WebEffectsLibrary/pages/2d_particles/index.html)              | GPU fireworks particle system using GLSL vertex and fragment shaders |
| [2D Collisions](https://tylerkneffler.github.io/WebEffectsLibrary/pages/2d_collisions/index.html)            | Real-time 2D physics collision simulation                            |
| [Pixel Sandbox](https://tylerkneffler.github.io/WebEffectsLibrary/pages/2d_pixel_sandbox/index.html)         | Cellular pixel world with water, dirt, wood, fire, and smoke         |
| [Cloth Simulation](https://tylerkneffler.github.io/WebEffectsLibrary/pages/sim_cloth/index.html)             | Interactive cloth physics simulation                                 |
| [Fluid Simulation - 2D](https://tylerkneffler.github.io/WebEffectsLibrary/pages/sim_fluid/index.html)        | GPU-based 2D fluid simulation                                        |
| [Fluid Simulation - 3D](https://tylerkneffler.github.io/WebEffectsLibrary/pages/sim_fluid_3d/index.html)     | 3D fluid simulation with volumetric rendering                        |
| [Wind Tunnel Simulation](https://tylerkneffler.github.io/WebEffectsLibrary/pages/sim_wind_tunnel/index.html) | Flow field visualization with object interaction                     |

### Grid and Animation Effects

| Effect                                                                                        | Description                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [Grid Breath](https://tylerkneffler.github.io/WebEffectsLibrary/pages/grid_breath/index.html)                 | Animated point grid with a breathing motion effect |
| [Shape Grid](https://tylerkneffler.github.io/WebEffectsLibrary/pages/grid_shape/index.html)                   | Line grid with ripple and spotlight effects        |
| [Parallax Horizontal](https://tylerkneffler.github.io/WebEffectsLibrary/pages/Parallax_Horizontal/index.html) | Horizontal multi-layer parallax scrolling          |
| [Parallax Vertical](https://tylerkneffler.github.io/WebEffectsLibrary/pages/Parallax_Vertical/index.html)     | Vertical multi-layer parallax scrolling            |

### Scroll-Driven UI Experiments

| Effect                                                                                               | Description                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Scroll Jacking Demo](https://tylerkneffler.github.io/WebEffectsLibrary/pages/scrolljack_web_sample/index.html)      | Apple-style scroll-driven showcase with hero transitions, word reveal, feature morphing, carousel movement, depth zoom, counters, and parallax CTA |
| [Scrolljack Carousel](https://tylerkneffler.github.io/WebEffectsLibrary/pages/scrolljack_carousel/index.html)        | Horizontal carousel variant for scroll-based UI interactions                                                                                       |
| [Scrolljack Progress Bar](https://tylerkneffler.github.io/WebEffectsLibrary/pages/scrolljack_progressbar/index.html) | Scroll-driven progress bar and animation effects                                                                                                   |

### Algorithms and Visualizers

| Effect                                                                            | Description                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Algorithm Search](https://tylerkneffler.github.io/WebEffectsLibrary/pages/alg_search/index.html) | Maze generation and graph search visualizations                    |
| [Algorithm Sorting](https://tylerkneffler.github.io/WebEffectsLibrary/pages/alg_sort/index.html)  | Sorting algorithm visualizer with animated bars and audio feedback |

### Networking and Collaboration Demos

| Effect                                                                                        | Description                                           |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [Collaborative Drawing](https://tylerkneffler.github.io/WebEffectsLibrary/pages/conn_drawing/index.html)      | Real-time collaborative drawing canvas                |
| [Multi-Mouse](https://tylerkneffler.github.io/WebEffectsLibrary/pages/conn_mice/index.html)                   | Multi-cursor demo for shared browser interactions     |
| [P2P Chat](https://tylerkneffler.github.io/WebEffectsLibrary/pages/conn_p2p_chat/index.html)                  | Peer-to-peer chat demo using WebRTC                   |
| [PeerJS Chat](https://tylerkneffler.github.io/WebEffectsLibrary/pages/conn_peerjs_chat/index.html)            | Browser chat demo using PeerJS signaling              |
| [Connection Stress Test](https://tylerkneffler.github.io/WebEffectsLibrary/pages/conn_stress_test/index.html) | Network stress testing utilities and connection demos |
| [Tic Tac Toe - P2P](https://tylerkneffler.github.io/WebEffectsLibrary/pages/conn_ticktacktoe/index.html)      | Peer-to-peer multiplayer Tic-Tac-Toe                  |
| [Tanks ](https://tylerkneffler.github.io/WebEffectsLibrary/pages/conn_tanks/index.html)      | Peer-to-peer multiplayer Tanks     Game             |
## Technologies Used

* JavaScript
* HTML5
* CSS3
* Canvas API
* WebGL
* GLSL
* WebRTC
* PeerJS
* GitHub Pages

## Running Locally

Clone the repository:

```bash
git clone https://github.com/TylerKneffler/WebEffectsLibrary.git
```

Open any effect directory and run it with a local development server.

Example using Python:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Some WebGL, module, or asset-based demos may require a local server rather than opening the HTML file directly in the browser.

## Live Site

View the full library here:

https://tylerkneffler.github.io/WebEffectsLibrary/index.html
