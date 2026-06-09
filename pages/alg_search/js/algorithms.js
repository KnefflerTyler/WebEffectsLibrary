'use strict';

/* ── Algorithm metadata ──────────────────────────────────────────────────── */
const ALG_INFO = {
    BFS: {
        key:        'BFS',
        name:       'BFS',
        fullName:   'Breadth-First Search',
        complexity: 'O(V + E)',
        optimal:    true,
        color:      '#4a9eff',
        desc:       'Explores all neighbours level-by-level. Guarantees the shortest path on unweighted graphs.'
    },
    DFS: {
        key:        'DFS',
        name:       'DFS',
        fullName:   'Depth-First Search',
        complexity: 'O(V + E)',
        optimal:    false,
        color:      '#ff6b6b',
        desc:       'Explores as deep as possible along each branch before backtracking. Path is not guaranteed to be shortest.'
    },
    ASTAR: {
        key:        'ASTAR',
        name:       'A*',
        fullName:   'A* Search',
        complexity: 'O(E log V)',
        optimal:    true,
        color:      '#51cf66',
        desc:       'Uses a heuristic (Manhattan distance) to guide search toward the exit. Optimal with an admissible heuristic.'
    },
    DIJKSTRA: {
        key:        'DIJKSTRA',
        name:       'Dijkstra',
        fullName:   "Dijkstra's Algorithm",
        complexity: 'O((V + E) log V)',
        optimal:    true,
        color:      '#ffd43b',
        desc:       'Finds shortest path by always expanding the lowest-cost frontier. Equivalent to BFS on unweighted mazes.'
    },
    GREEDY: {
        key:        'GREEDY',
        name:       'Greedy',
        fullName:   'Greedy Best-First',
        complexity: 'O(b^d)',
        optimal:    false,
        color:      '#ff922b',
        desc:       'Always moves toward the cell closest (by heuristic) to the exit. Fast but may find a longer path.'
    },
    BIBFS: {
        key:        'BIBFS',
        name:       'Bi-BFS',
        fullName:   'Bidirectional BFS',
        complexity: 'O(b^(d/2))',
        optimal:    true,
        color:      '#cc5de8',
        desc:       'Runs BFS simultaneously from start and exit, meeting in the middle. Explores roughly half as many cells.'
    },
};

/* ── Dispatcher ──────────────────────────────────────────────────────────── */
function runAlgorithm(key, maze, start, exit) {
    switch (key) {
        case 'BFS':      return algBFS(maze, start, exit);
        case 'DFS':      return algDFS(maze, start, exit);
        case 'ASTAR':    return algAStar(maze, start, exit);
        case 'DIJKSTRA': return algDijkstra(maze, start, exit);
        case 'GREEDY':   return algGreedy(maze, start, exit);
        case 'BIBFS':    return algBiBFS(maze, start, exit);
        default: throw new Error('Unknown algorithm: ' + key);
    }
}

/* ── BFS ─────────────────────────────────────────────────────────────────── */
function algBFS(maze, start, exit) {
    const visited  = [];
    const queue    = [start];
    const cameFrom = new Map([[start, null]]);

    while (queue.length > 0) {
        const cur = queue.shift();
        visited.push(cur);
        if (cur === exit) break;
        for (const nb of maze.getNeighbors(cur)) {
            if (!cameFrom.has(nb)) {
                cameFrom.set(nb, cur);
                queue.push(nb);
            }
        }
    }
    return { visited, path: _reconstruct(cameFrom, exit) };
}

/* ── DFS ─────────────────────────────────────────────────────────────────── */
function algDFS(maze, start, exit) {
    const visited  = [];
    const seen     = new Set([start]);
    const stack    = [start];
    const cameFrom = new Map([[start, null]]);

    while (stack.length > 0) {
        const cur = stack.pop();
        visited.push(cur);
        if (cur === exit) break;
        for (const nb of maze.getNeighbors(cur)) {
            if (!seen.has(nb)) {
                seen.add(nb);
                cameFrom.set(nb, cur);
                stack.push(nb);
            }
        }
    }
    return { visited, path: _reconstruct(cameFrom, exit) };
}

/* ── A* ──────────────────────────────────────────────────────────────────── */
function algAStar(maze, start, exit) {
    const visited  = [];
    const open     = new MinHeap();
    const cameFrom = new Map([[start, null]]);
    const gScore   = new Map([[start, 0]]);
    const closed   = new Set();

    open.push({ node: start, f: _h(start, exit) });

    while (!open.isEmpty()) {
        const { node: cur } = open.pop();
        if (closed.has(cur)) continue;
        closed.add(cur);
        visited.push(cur);
        if (cur === exit) break;

        const g = gScore.get(cur);
        for (const nb of maze.getNeighbors(cur)) {
            if (closed.has(nb)) continue;
            const ng = g + 1;
            if (ng < (gScore.get(nb) ?? Infinity)) {
                gScore.set(nb, ng);
                cameFrom.set(nb, cur);
                open.push({ node: nb, f: ng + _h(nb, exit) });
            }
        }
    }
    return { visited, path: _reconstruct(cameFrom, exit) };
}

/* ── Dijkstra ────────────────────────────────────────────────────────────── */
function algDijkstra(maze, start, exit) {
    const visited  = [];
    const pq       = new MinHeap();
    const cameFrom = new Map([[start, null]]);
    const dist     = new Map([[start, 0]]);
    const closed   = new Set();

    pq.push({ node: start, f: 0 });

    while (!pq.isEmpty()) {
        const { node: cur } = pq.pop();
        if (closed.has(cur)) continue;
        closed.add(cur);
        visited.push(cur);
        if (cur === exit) break;

        const d = dist.get(cur);
        for (const nb of maze.getNeighbors(cur)) {
            if (closed.has(nb)) continue;
            const nd = d + 1;
            if (nd < (dist.get(nb) ?? Infinity)) {
                dist.set(nb, nd);
                cameFrom.set(nb, cur);
                pq.push({ node: nb, f: nd });
            }
        }
    }
    return { visited, path: _reconstruct(cameFrom, exit) };
}

/* ── Greedy Best-First ───────────────────────────────────────────────────── */
function algGreedy(maze, start, exit) {
    const visited  = [];
    const pq       = new MinHeap();
    const cameFrom = new Map([[start, null]]);
    const seen     = new Set([start]);

    pq.push({ node: start, f: _h(start, exit) });

    while (!pq.isEmpty()) {
        const { node: cur } = pq.pop();
        visited.push(cur);
        if (cur === exit) break;
        for (const nb of maze.getNeighbors(cur)) {
            if (!seen.has(nb)) {
                seen.add(nb);
                cameFrom.set(nb, cur);
                pq.push({ node: nb, f: _h(nb, exit) });
            }
        }
    }
    return { visited, path: _reconstruct(cameFrom, exit) };
}

/* ── Bidirectional BFS ───────────────────────────────────────────────────── */
function algBiBFS(maze, start, exit) {
    if (start === exit) return { visited: [start], path: [start] };

    const visited = [];
    const fQ = [start], bQ = [exit];
    const fFrom = new Map([[start, null]]);
    const bFrom = new Map([[exit,  null]]);
    let meet = null;

    outer:
    while (fQ.length > 0 && bQ.length > 0) {
        // Expand forward
        const fc = fQ.shift();
        visited.push(fc);
        if (bFrom.has(fc)) { meet = fc; break; }
        for (const nb of maze.getNeighbors(fc)) {
            if (!fFrom.has(nb)) {
                fFrom.set(nb, fc);
                fQ.push(nb);
                if (bFrom.has(nb)) { meet = nb; break outer; }
            }
        }

        // Expand backward
        const bc = bQ.shift();
        visited.push(bc);
        if (fFrom.has(bc)) { meet = bc; break; }
        for (const nb of maze.getNeighbors(bc)) {
            if (!bFrom.has(nb)) {
                bFrom.set(nb, bc);
                bQ.push(nb);
                if (fFrom.has(nb)) { meet = nb; break outer; }
            }
        }
    }

    if (!meet) return { visited, path: [] };

    // Forward segment: start → meet
    const fPath = [];
    let n = meet;
    while (n !== null) { fPath.unshift(n); n = fFrom.get(n); }

    // Backward segment: meet → exit  (bFrom traces back toward exit)
    const bPath = [];
    n = bFrom.get(meet);
    while (n !== null) { bPath.push(n); n = bFrom.get(n); }

    return { visited, path: [...fPath, ...bPath] };
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function _h(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function _reconstruct(cameFrom, exit) {
    if (!cameFrom.has(exit)) return [];
    const path = [];
    let cur = exit;
    while (cur !== null) { path.unshift(cur); cur = cameFrom.get(cur); }
    return path;
}

/* ── Min-Heap (priority queue) ───────────────────────────────────────────── */
class MinHeap {
    constructor() { this._h = []; }

    push(item) {
        this._h.push(item);
        this._up(this._h.length - 1);
    }

    pop() {
        if (this._h.length === 1) return this._h.pop();
        const top = this._h[0];
        this._h[0] = this._h.pop();
        this._down(0);
        return top;
    }

    isEmpty() { return this._h.length === 0; }

    _up(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this._h[p].f <= this._h[i].f) break;
            [this._h[p], this._h[i]] = [this._h[i], this._h[p]];
            i = p;
        }
    }

    _down(i) {
        const n = this._h.length;
        while (true) {
            let m = i;
            const l = 2*i+1, r = 2*i+2;
            if (l < n && this._h[l].f < this._h[m].f) m = l;
            if (r < n && this._h[r].f < this._h[m].f) m = r;
            if (m === i) break;
            [this._h[m], this._h[i]] = [this._h[i], this._h[m]];
            i = m;
        }
    }
}
