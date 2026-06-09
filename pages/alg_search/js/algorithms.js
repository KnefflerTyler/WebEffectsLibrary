'use strict';

/* ── Algorithm metadata ──────────────────────────────────────────────────── */
const ALG_INFO = {
    BFS: {
        key:        'BFS',
        name:       'BFS',
        fullName:   'Breadth-First Search',
        complexity: 'O(V + E)',
        optimal:    true,
        exitInfo:   'No - explores uniformly and only stops when it reaches the exit.',
        color:      '#4a9eff',
        desc:       'Explores all neighbours level-by-level. Guarantees the shortest path on unweighted graphs.'
    },
    DFS: {
        key:        'DFS',
        name:       'DFS',
        fullName:   'Depth-First Search',
        complexity: 'O(V + E)',
        optimal:    false,
        exitInfo:   'No - dives blindly until it stumbles onto the exit or backtracks.',
        color:      '#ff6b6b',
        desc:       'Explores as deep as possible along each branch before backtracking. Path is not guaranteed to be shortest.'
    },
    ASTAR: {
        key:        'ASTAR',
        name:       'A*',
        fullName:   'A* Search',
        complexity: 'O(E log V)',
        optimal:    true,
        exitInfo:   'Yes - uses the exit location directly in its heuristic.',
        color:      '#51cf66',
        desc:       'Uses a heuristic (Manhattan distance) to guide search toward the exit. Optimal with an admissible heuristic.'
    },
    DIJKSTRA: {
        key:        'DIJKSTRA',
        name:       'Dijkstra',
        fullName:   "Dijkstra's Algorithm",
        complexity: 'O((V + E) log V)',
        optimal:    true,
        exitInfo:   'No - expands by cost only and stops once the exit is removed from the frontier.',
        color:      '#ffd43b',
        desc:       'Finds shortest path by always expanding the lowest-cost frontier. Equivalent to BFS on unweighted mazes.'
    },
    GREEDY: {
        key:        'GREEDY',
        name:       'Greedy',
        fullName:   'Greedy Best-First',
        complexity: 'O(b^d)',
        optimal:    false,
        exitInfo:   'Yes - always chases the cell that looks closest to the exit.',
        color:      '#ff922b',
        desc:       'Always moves toward the cell closest (by heuristic) to the exit. Fast but may find a longer path.'
    },
    BIBFS: {
        key:        'BIBFS',
        name:       'Bi-BFS',
        fullName:   'Bidirectional BFS',
        complexity: 'O(b^(d/2))',
        optimal:    true,
        exitInfo:   'Yes - starts a second search from the exit and meets in the middle.',
        color:      '#cc5de8',
        desc:       'Runs BFS simultaneously from start and exit, meeting in the middle. Explores roughly half as many cells.'
    },
    WALL_LEFT: {
        key:        'WALL_LEFT',
        name:       'Wall Hug L',
        fullName:   'Left-Hand Wall Follower',
        complexity: 'O(k)',
        optimal:    false,
        exitInfo:   'No - it only uses local wall contact and does not aim toward the exit.',
        color:      '#f06595',
        desc:       'Keeps the left hand on the wall and follows it until the exit appears. Can loop or take long detours in loopy mazes.'
    },
    RANDOM_MOUSE: {
        key:        'RANDOM_MOUSE',
        name:       'Random',
        fullName:   'Random Mouse',
        complexity: 'O(k)',
        optimal:    false,
        exitInfo:   'No - chooses locally at random with no knowledge of the exit direction.',
        color:      '#845ef7',
        desc:       'Picks a random corridor at each junction and keeps wandering until the exit is reached. Very simple and very inefficient.'
    },
    TREMAUX: {
        key:        'TREMAUX',
        name:       'Tremaux',
        fullName:   "Tremaux's Algorithm",
        complexity: 'O(E)',
        optimal:    false,
        exitInfo:   'No - relies on corridor marks rather than any exit location hint.',
        color:      '#20c997',
        desc:       'Marks traversed corridors and prefers unvisited branches before backtracking. Complete, but not shortest-path optimal.'
    },
    PLEDGE: {
        key:        'PLEDGE',
        name:       'Pledge',
        fullName:   'Pledge Algorithm',
        complexity: 'O(k)',
        optimal:    false,
        exitInfo:   'Partly - keeps a preferred heading toward the exit, then wall-follows around obstacles.',
        color:      '#339af0',
        desc:       'Keeps a preferred heading, then temporarily wall-follows around obstacles until its turn balance returns to zero.'
    },
    DEAD_END_FILL: {
        key:        'DEAD_END_FILL',
        name:       'Dead-End Fill',
        fullName:   'Dead-End Filling',
        complexity: 'O(V + E)',
        optimal:    false,
        exitInfo:   'Indirectly - it does not chase the exit, but preserves start and exit while pruning dead ends.',
        color:      '#ff8c42',
        desc:       'Prunes every cul-de-sac that is not the start or exit, then traces a route through the surviving corridor network.'
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
        case 'WALL_LEFT':    return _withBFSFallback(algWallFollowerLeft, maze, start, exit);
        case 'RANDOM_MOUSE': return _withBFSFallback(algRandomMouse, maze, start, exit);
        case 'TREMAUX':      return _withBFSFallback(algTremaux, maze, start, exit);
        case 'PLEDGE':       return _withBFSFallback(algPledge, maze, start, exit);
        case 'DEAD_END_FILL':return algDeadEndFill(maze, start, exit);
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

/* ── Left/Right Wall Follower ───────────────────────────────────────────── */
function algWallFollowerLeft(maze, start, exit) {
    return _algWallFollower(maze, start, exit, 'left');
}

function algRandomMouse(maze, start, exit) {
    if (start === exit) return { visited: [start], path: [start] };

    const visited = [];
    const seen = new Set();
    const cameFrom = new Map([[start, null]]);
    const stateSeen = new Set();
    let current = start;
    let previous = null;
    const stepLimit = Math.max(maze.rows * maze.cols * 10, 96);

    for (let step = 0; step < stepLimit; step++) {
        if (!seen.has(current)) {
            seen.add(current);
            visited.push(current);
        }
        if (current === exit) {
            return { visited, path: _reconstruct(cameFrom, exit) };
        }

        const stateKey = `${current.row},${current.col}|${previous ? `${previous.row},${previous.col}` : 'none'}`;
        if (stateSeen.has(stateKey)) break;
        stateSeen.add(stateKey);

        const neighbors = maze.getNeighbors(current);
        if (neighbors.length === 0) break;

        let choices = neighbors.filter(cell => cell !== previous);
        if (choices.length === 0) choices = neighbors;

        const next = choices[Math.floor(Math.random() * choices.length)];
        if (!cameFrom.has(next)) cameFrom.set(next, current);
        previous = current;
        current = next;
    }

    return { visited, path: [] };
}

function _algWallFollower(maze, start, exit, hand) {
    if (start === exit) return { visited: [start], path: [start] };

    const visited = [];
    const seen = new Set();
    const cameFrom = new Map([[start, null]]);
    const stateSeen = new Set();
    let current = start;
    let facing = _initialFacing(maze, start, exit);
    const stepLimit = Math.max(maze.rows * maze.cols * 8, 64);

    for (let step = 0; step < stepLimit; step++) {
        if (!seen.has(current)) {
            seen.add(current);
            visited.push(current);
        }
        if (current === exit) {
            return { visited, path: _reconstruct(cameFrom, exit) };
        }

        const stateKey = `${current.row},${current.col},${facing}`;
        if (stateSeen.has(stateKey)) break;
        stateSeen.add(stateKey);

        const nextMove = _pickWallMove(maze, current, facing, hand);
        if (!nextMove) break;

        if (!cameFrom.has(nextMove.cell)) cameFrom.set(nextMove.cell, current);
        current = nextMove.cell;
        facing = nextMove.dir;
    }

    return { visited, path: [] };
}

/* ── Tremaux ────────────────────────────────────────────────────────────── */
function algTremaux(maze, start, exit) {
    if (start === exit) return { visited: [start], path: [start] };

    const visited = [];
    const seen = new Set();
    const cameFrom = new Map([[start, null]]);
    const edgeMarks = new Map();
    const stack = [start];
    const stepLimit = Math.max(maze.rows * maze.cols * 12, 128);
    let steps = 0;

    while (stack.length > 0 && steps < stepLimit) {
        steps++;
        const current = stack[stack.length - 1];

        if (!seen.has(current)) {
            seen.add(current);
            visited.push(current);
        }
        if (current === exit) {
            return { visited, path: _reconstruct(cameFrom, exit) };
        }

        const previous = stack.length > 1 ? stack[stack.length - 2] : null;
        const neighbors = maze.getNeighbors(current);
        const next = _chooseTremauxNeighbor(neighbors, current, previous, edgeMarks);

        if (!next) {
            stack.pop();
            continue;
        }

        _markEdge(edgeMarks, current, next);
        if (!cameFrom.has(next)) cameFrom.set(next, current);
        stack.push(next);
    }

    return { visited, path: [] };
}

/* ── Pledge ─────────────────────────────────────────────────────────────── */
function algPledge(maze, start, exit) {
    if (start === exit) return { visited: [start], path: [start] };

    const visited = [];
    const seen = new Set();
    const cameFrom = new Map([[start, null]]);
    const stateSeen = new Set();
    const preferredHeading = _initialFacing(maze, start, exit);
    let current = start;
    let facing = preferredHeading;
    let turnBalance = 0;
    const stepLimit = Math.max(maze.rows * maze.cols * 12, 128);

    for (let step = 0; step < stepLimit; step++) {
        if (!seen.has(current)) {
            seen.add(current);
            visited.push(current);
        }
        if (current === exit) {
            return { visited, path: _reconstruct(cameFrom, exit) };
        }

        const stateKey = `${current.row},${current.col},${facing},${turnBalance}`;
        if (stateSeen.has(stateKey)) break;
        stateSeen.add(stateKey);

        let nextMove = null;

        if (turnBalance === 0) {
            const straightCell = _step(maze, current, preferredHeading);
            if (straightCell) {
                nextMove = { cell: straightCell, dir: preferredHeading, turnDelta: _turnDelta(facing, preferredHeading) };
            }
        }

        if (!nextMove) {
            const wallMove = _pickWallMove(maze, current, facing, 'right');
            if (!wallMove) break;
            nextMove = {
                cell: wallMove.cell,
                dir: wallMove.dir,
                turnDelta: _turnDelta(facing, wallMove.dir)
            };
        }

        if (!cameFrom.has(nextMove.cell)) cameFrom.set(nextMove.cell, current);
        current = nextMove.cell;
        facing = nextMove.dir;
        turnBalance += nextMove.turnDelta;

        if (facing === preferredHeading && turnBalance === 0) {
            turnBalance = 0;
        }
    }

    return { visited, path: [] };
}

/* ── Dead-End Filling ───────────────────────────────────────────────────── */
function algDeadEndFill(maze, start, exit) {
    if (start === exit) return { visited: [start], path: [start] };

    const graph = _buildNeighborGraph(maze);
    const active = new Set(graph.keys());
    const degree = new Map();
    const visited = [];
    const seen = new Set();
    const queue = [];

    for (const [cell, neighbors] of graph) {
        degree.set(cell, neighbors.length);
        if (cell !== start && cell !== exit && neighbors.length <= 1) {
            queue.push(cell);
        }
    }

    while (queue.length > 0) {
        const cell = queue.shift();
        if (!active.has(cell) || cell === start || cell === exit) continue;
        if ((degree.get(cell) ?? 0) > 1) continue;

        active.delete(cell);
        _pushVisited(visited, seen, cell);

        for (const neighbor of graph.get(cell) ?? []) {
            if (!active.has(neighbor)) continue;
            degree.set(neighbor, (degree.get(neighbor) ?? 0) - 1);
            if (neighbor !== start && neighbor !== exit && (degree.get(neighbor) ?? 0) <= 1) {
                queue.push(neighbor);
            }
        }
    }

    if (!active.has(start) || !active.has(exit)) {
        return { visited, path: [] };
    }

    const pathQueue = [start];
    const cameFrom = new Map([[start, null]]);

    while (pathQueue.length > 0) {
        const current = pathQueue.shift();
        _pushVisited(visited, seen, current);
        if (current === exit) break;

        for (const neighbor of graph.get(current) ?? []) {
            if (!active.has(neighbor) || cameFrom.has(neighbor)) continue;
            cameFrom.set(neighbor, current);
            pathQueue.push(neighbor);
        }
    }

    return { visited, path: _reconstruct(cameFrom, exit) };
}


/* ── Helpers ─────────────────────────────────────────────────────────────── */
function _h(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function _withBFSFallback(algorithm, maze, start, exit) {
    const result = algorithm(maze, start, exit);
    if (result.path.length > 0 || start === exit) return result;

    const fallback = algBFS(maze, start, exit);
    const mergedVisited = [...result.visited];
    const seen = new Set(result.visited);
    for (const cell of fallback.visited) {
        if (!seen.has(cell)) {
            seen.add(cell);
            mergedVisited.push(cell);
        }
    }
    return { visited: mergedVisited, path: fallback.path };
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

const DIRS = ['N', 'E', 'S', 'W'];
const DIR_OFFSETS = {
    N: { row: -1, col: 0 },
    E: { row: 0, col: 1 },
    S: { row: 1, col: 0 },
    W: { row: 0, col: -1 }
};

function _initialFacing(maze, start, exit) {
    const preferred = [];
    if (exit.row < start.row) preferred.push('N');
    if (exit.col > start.col) preferred.push('E');
    if (exit.row > start.row) preferred.push('S');
    if (exit.col < start.col) preferred.push('W');

    for (const dir of preferred) {
        const next = _step(maze, start, dir);
        if (next) return dir;
    }
    for (const dir of DIRS) {
        const next = _step(maze, start, dir);
        if (next) return dir;
    }
    return 'N';
}

function _pickWallMove(maze, current, facing, hand) {
    const dirOrder = hand === 'left'
        ? [_turnLeft(facing), facing, _turnRight(facing), _turnBack(facing)]
        : [_turnRight(facing), facing, _turnLeft(facing), _turnBack(facing)];

    for (const dir of dirOrder) {
        const cell = _step(maze, current, dir);
        if (cell) return { cell, dir };
    }
    return null;
}

function _step(maze, cell, dir) {
    if (cell.walls[dir]) return null;

    const nextRow = cell.row + DIR_OFFSETS[dir].row;
    const nextCol = cell.col + DIR_OFFSETS[dir].col;
    if (nextRow < 0 || nextRow >= maze.rows || nextCol < 0 || nextCol >= maze.cols) return null;

    const next = maze.cells[nextRow][nextCol];
    return next.solid ? null : next;
}

function _turnLeft(dir) {
    return DIRS[(DIRS.indexOf(dir) + 3) % 4];
}

function _turnRight(dir) {
    return DIRS[(DIRS.indexOf(dir) + 1) % 4];
}

function _turnBack(dir) {
    return DIRS[(DIRS.indexOf(dir) + 2) % 4];
}

function _chooseTremauxNeighbor(neighbors, current, previous, edgeMarks) {
    const options = neighbors.map(cell => ({
        cell,
        marks: _edgeMarkCount(edgeMarks, current, cell)
    }));

    const unmarked = options.filter(option => option.marks === 0 && option.cell !== previous);
    if (unmarked.length > 0) return _sortByHeuristic(unmarked).at(0).cell;

    const onceMarked = options.filter(option => option.marks === 1 && option.cell !== previous);
    if (onceMarked.length > 0) return _sortByHeuristic(onceMarked).at(0).cell;

    if (previous) return previous;

    const fallback = options.filter(option => option.marks < 2);
    return fallback.length > 0 ? _sortByHeuristic(fallback).at(0).cell : null;
}

function _sortByHeuristic(options) {
    return options.sort((a, b) => {
        if (a.marks !== b.marks) return a.marks - b.marks;
        if (a.cell.row !== b.cell.row) return a.cell.row - b.cell.row;
        return a.cell.col - b.cell.col;
    });
}

function _markEdge(edgeMarks, a, b) {
    const key = _edgeKey(a, b);
    edgeMarks.set(key, (edgeMarks.get(key) ?? 0) + 1);
}

function _edgeMarkCount(edgeMarks, a, b) {
    return edgeMarks.get(_edgeKey(a, b)) ?? 0;
}

function _edgeKey(a, b) {
    const left = `${a.row},${a.col}`;
    const right = `${b.row},${b.col}`;
    return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function _turnDelta(from, to) {
    const diff = (DIRS.indexOf(to) - DIRS.indexOf(from) + 4) % 4;
    if (diff === 3) return -1;
    return diff;
}

function _buildNeighborGraph(maze) {
    const graph = new Map();
    for (const row of maze.cells) {
        for (const cell of row) {
            if (cell.solid) continue;
            graph.set(cell, maze.getNeighbors(cell));
        }
    }
    return graph;
}

function _pushVisited(visited, seen, cell) {
    if (seen.has(cell)) return;
    seen.add(cell);
    visited.push(cell);
}
