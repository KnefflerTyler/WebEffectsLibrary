'use strict';

/**
 * BatchRunner — spawns one Web Worker per algorithm so all algorithms run
 * in parallel across CPU cores (true multi-threaded processing).
 */
class BatchRunner {
    /**
     * @param {string[]}  algKeys    – algorithm keys to test
     * @param {number}    iterations – maze iterations per algorithm
     * @param {number}    mazeSize   – grid size (square)
     * @param {Function}  onProgress – (done, total) progress callback
     * @returns {Promise<object>}    – results keyed by algKey
     */
    run(algKeys, iterations, mazeSize, onProgress) {
        // Track per-algorithm progress so we can report an overall average
        const progress = {};
        for (const k of algKeys) progress[k] = 0;

        const reportProgress = () => {
            const avg = Object.values(progress).reduce((a, b) => a + b, 0) / algKeys.length;
            onProgress(Math.round(avg), iterations);
        };

        return Promise.all(
            algKeys.map(algKey => new Promise((resolve, reject) => {
                const worker = new Worker('js/worker.js');

                worker.onmessage = (e) => {
                    const { type, done, visited, pathLen, time } = e.data;
                    if (type === 'progress') {
                        progress[algKey] = done;
                        reportProgress();
                    } else if (type === 'done') {
                        worker.terminate();
                        resolve({ algKey, visited, pathLen, time });
                    }
                };

                worker.onerror = (err) => {
                    worker.terminate();
                    reject(err);
                };

                worker.postMessage({ algKey, iterations, mazeSize });
            }))
        ).then(perAlg => this._aggregate(perAlg));
    }

    /* ── Aggregation ────────────────────────────────────────────────────── */
    _aggregate(perAlg) {
        const results = {};
        for (const { algKey, visited, pathLen, time } of perAlg) {
            const n = visited.length;
            if (n === 0) continue;
            const avgOf = arr => arr.reduce((a, b) => a + b, 0) / n;
            results[algKey] = {
                avgVisited:  Math.round(avgOf(visited)),
                avgPathLen:  +avgOf(pathLen).toFixed(1),
                avgTime:     +avgOf(time).toFixed(4),
                minVisited:  Math.min(...visited),
                maxVisited:  Math.max(...visited),
                minPath:     Math.min(...pathLen),
                maxPath:     Math.max(...pathLen),
                successRate: Math.round(pathLen.filter(l => l > 0).length / n * 100),
            };
        }
        return results;
    }
}


