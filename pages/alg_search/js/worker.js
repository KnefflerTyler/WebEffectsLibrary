'use strict';

/**
 * Batch worker — runs one algorithm for N maze iterations.
 * Spawned once per algorithm by BatchRunner so all algorithms run in parallel
 * across CPU cores (true multi-threaded processing).
 *
 * Messages in:  { algKey, iterations, mazeSize }
 * Messages out: { type:'progress', done, total }
 *               { type:'done', algKey, visited[], pathLen[], time[] }
 */

importScripts('Maze.js', 'algorithms.js');

const CHUNK = 12;

self.onmessage = function (e) {
    const { algKey, iterations, mazeSize } = e.data;

    const visited = [];
    const pathLen = [];
    const time    = [];

    for (let i = 0; i < iterations; i += CHUNK) {
        const end = Math.min(i + CHUNK, iterations);

        for (let j = i; j < end; j++) {
            const maze = new Maze(mazeSize, mazeSize);
            const t0   = performance.now();
            const res  = runAlgorithm(algKey, maze, maze.start, maze.exit);
            const dt   = performance.now() - t0;
            visited.push(res.visited.length);
            pathLen.push(res.path.length);
            time.push(dt);
        }

        self.postMessage({ type: 'progress', done: end, total: iterations });
    }

    self.postMessage({ type: 'done', algKey, visited, pathLen, time });
};
