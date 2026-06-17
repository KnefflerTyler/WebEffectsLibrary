# Web Effects Library

A growing collection of interactive browser-based visual effects, simulations, rendering experiments, and algorithm visualizers. Each demo is self-contained in its own directory and can be viewed directly in the browser.

**Live Demo:**
https://tylerkneffler.github.io/WebEffectsLibrary/

## Effects Library

### WebGL, Shaders, and 3D Rendering

| Effect                                                                                    | Description                                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Default Cube](https://tylerkneffler.github.io/WebEffectsLibrary/default_cube/)           | Basic rotating cube rendered with custom GLSL shaders             |
| [Galaxy](https://tylerkneffler.github.io/WebEffectsLibrary/galaxy/)                       | Celestial simulation with stars, planets, and moons               |
| [3D Point Graph](https://tylerkneffler.github.io/WebEffectsLibrary/grid_3d_points/)       | Interactive 3D point cloud with mouse interaction                 |
| [Perlin Noise Mask](https://tylerkneffler.github.io/WebEffectsLibrary/perlin_noise_mask/) | Animated Perlin noise shader mask                                 |
| [OBJ Viewer](https://tylerkneffler.github.io/WebEffectsLibrary/obj_display/)              | Upload and view `.obj` and `.mtl` models with multiple view modes |

### Procedural Terrain and Voxel Rendering

| Effect                                                                                | Description                                                                                               |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Marching Cubes](https://tylerkneffler.github.io/WebEffectsLibrary/marching_cubes/)   | Smooth procedural terrain with GPU Perlin fBm displacement, chunk streaming, fog, and fly camera controls |
| [Hex Terrain](https://tylerkneffler.github.io/WebEffectsLibrary/marching_hex/)        | GPU-driven procedural terrain built from pointy-top hexagonal cells                                       |
| [Cubic Voxel Terrain](https://tylerkneffler.github.io/WebEffectsLibrary/voxel_cubes/) | Blocky voxel-style terrain using GPU Perlin fBm quantized into discrete height steps                      |
| [Hex Voxel Terrain](https://tylerkneffler.github.io/WebEffectsLibrary/voxel_hex/)     | Hexagonal voxel terrain with GPU noise and stepped terrain topology                                       |

### Particles, Physics, and Simulations

| Effect                                                                                       | Description                                                          |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [2D Particles](https://tylerkneffler.github.io/WebEffectsLibrary/2d_particles/)              | GPU fireworks particle system using GLSL vertex and fragment shaders |
| [2D Collisions](https://tylerkneffler.github.io/WebEffectsLibrary/2d_collisions/)            | Real-time 2D physics collision simulation                            |
| [Cloth Simulation](https://tylerkneffler.github.io/WebEffectsLibrary/sim_cloth/)             | Interactive cloth physics simulation                                 |
| [Fluid Simulation - 2D](https://tylerkneffler.github.io/WebEffectsLibrary/sim_fluid/)        | GPU-based 2D fluid simulation                                        |
| [Fluid Simulation - 3D](https://tylerkneffler.github.io/WebEffectsLibrary/sim_fluid_3d/)     | 3D fluid simulation with volumetric rendering                        |
| [Wind Tunnel Simulation](https://tylerkneffler.github.io/WebEffectsLibrary/sim_wind_tunnel/) | Flow field visualization with object interaction                     |

### Grid and Animation Effects

| Effect                                                                                        | Description                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [Grid Breath](https://tylerkneffler.github.io/WebEffectsLibrary/grid_breath/)                 | Animated point grid with a breathing motion effect |
| [Shape Grid](https://tylerkneffler.github.io/WebEffectsLibrary/grid_shape/)                   | Line grid with ripple and spotlight effects        |
| [Parallax Horizontal](https://tylerkneffler.github.io/WebEffectsLibrary/Parallax_Horizontal/) | Horizontal multi-layer parallax scrolling          |
| [Parallax Vertical](https://tylerkneffler.github.io/WebEffectsLibrary/Parallax_Vertical/)     | Vertical multi-layer parallax scrolling            |

### Scroll-Driven UI Experiments

| Effect                                                                                               | Description                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Scroll Jacking Demo](https://tylerkneffler.github.io/WebEffectsLibrary/scrolljack_web_sample/)      | Apple-style scroll-driven showcase with hero transitions, word reveal, feature morphing, carousel movement, depth zoom, counters, and parallax CTA |
| [Scrolljack Carousel](https://tylerkneffler.github.io/WebEffectsLibrary/scrolljack_carousel/)        | Horizontal carousel variant for scroll-based UI interactions                                                                                       |
| [Scrolljack Progress Bar](https://tylerkneffler.github.io/WebEffectsLibrary/scrolljack_progressbar/) | Scroll-driven progress bar and animation effects                                                                                                   |

### Algorithms and Visualizers

| Effect                                                                            | Description                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Algorithm Search](https://tylerkneffler.github.io/WebEffectsLibrary/alg_search/) | Maze generation and graph search visualizations                    |
| [Algorithm Sorting](https://tylerkneffler.github.io/WebEffectsLibrary/alg_sort/)  | Sorting algorithm visualizer with animated bars and audio feedback |

### Networking and Collaboration Demos

| Effect                                                                                        | Description                                           |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [Collaborative Drawing](https://tylerkneffler.github.io/WebEffectsLibrary/conn_drawing/)      | Real-time collaborative drawing canvas                |
| [Multi-Mouse](https://tylerkneffler.github.io/WebEffectsLibrary/conn_mice/)                   | Multi-cursor demo for shared browser interactions     |
| [P2P Chat](https://tylerkneffler.github.io/WebEffectsLibrary/conn_p2p_chat/)                  | Peer-to-peer chat demo using WebRTC                   |
| [PeerJS Chat](https://tylerkneffler.github.io/WebEffectsLibrary/conn_peerjs_chat/)            | Browser chat demo using PeerJS signaling              |
| [Connection Stress Test](https://tylerkneffler.github.io/WebEffectsLibrary/conn_stress_test/) | Network stress testing utilities and connection demos |
| [Tic Tac Toe - P2P](https://tylerkneffler.github.io/WebEffectsLibrary/conn_ticktacktoe/)      | Peer-to-peer multiplayer Tic-Tac-Toe                  |

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

https://tylerkneffler.github.io/WebEffectsLibrary/
