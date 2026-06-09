'use strict';

/**
 * Maze — supports nine generation strategies.
 * Each cell: { row, col, walls: {N,S,E,W}, solid: bool }
 * Start = center cell (or nearest non-solid).  Exit = random edge / far room.
 *
 * Types:
 *   'perfect'    — Recursive-backtracking DFS. Long winding corridors, one solution.
 *   'prim'       — Randomised Prim's. Dense branchy texture, still perfect.
 *   'imperfect'  — DFS + ~18 % extra wall removals → multiple solutions / loops.
 *   'braided'    — DFS then ALL dead-ends opened → no dead ends at all.
 *   'dungeon'    — MST-connected rooms; everything else optionally solid or DFS-maze.
 *   'open'       — Starts with all walls, removes ~55 % randomly → sparse open field.
 *   'bsp'        — Binary Space Partitioning: recursive splits, room per leaf, L corridors.
 *   'cave'       — Cellular Automata: random fill + smoothing = organic cave.
 *   'drunk'      — Drunkard's Walk: multiple random walkers carve winding tunnels.
 */
class Maze {
    constructor(cols, rows, type = 'perfect', opts = {}) {
        this.cols  = cols;
        this.rows  = rows;
        this.type  = type;
        this.opts  = opts;   // dungeon-specific options passed through
        this.cells = [];
        this.start = null;
        this.exit  = null;
        this.rooms = [];   // populated by dungeon type only
        this.generate();
    }

    /* ════════════════════════════════════════════════════════════════════
       Public
    ════════════════════════════════════════════════════════════════════ */

    generate() {
        this._buildGrid();
        switch (this.type) {
            case 'prim':      this._genPrim();      break;
            case 'imperfect': this._genImperfect(); break;
            case 'braided':   this._genBraided();   break;
            case 'dungeon':   this._genDungeon();   break;
            case 'open':      this._genOpen();      break;
            case 'bsp':       this._genBSP();       break;
            case 'cave':      this._genCave();      break;
            case 'drunk':     this._genDrunk();     break;
            default:          this._genDFS();       break;   // 'perfect'
        }
        this._assignStartExit();
        this._cleanup();
    }

    /** Returns passable neighbours of `cell`. Used by search algorithms. */
    getNeighbors({ row: r, col: c, walls }) {
        const out = [];
        if (!walls.N && r > 0             && !this.cells[r-1][c].solid) out.push(this.cells[r-1][c]);
        if (!walls.S && r < this.rows - 1 && !this.cells[r+1][c].solid) out.push(this.cells[r+1][c]);
        if (!walls.W && c > 0             && !this.cells[r][c-1].solid) out.push(this.cells[r][c-1]);
        if (!walls.E && c < this.cols - 1 && !this.cells[r][c+1].solid) out.push(this.cells[r][c+1]);
        return out;
    }

    /* ════════════════════════════════════════════════════════════════════
       Grid helpers
    ════════════════════════════════════════════════════════════════════ */

    _buildGrid() {
        this.cells = [];
        this.rooms = [];
        for (let r = 0; r < this.rows; r++) {
            this.cells[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.cells[r][c] = {
                    row: r, col: c,
                    walls: { N: true, S: true, E: true, W: true },
                    solid: false,
                    _vis: false
                };
            }
        }
    }

    _cleanup() {
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                delete this.cells[r][c]._vis;
    }

    _knock(a, b) {
        const dr = b.row - a.row, dc = b.col - a.col;
        if      (dr === -1) { a.walls.N = false; b.walls.S = false; }
        else if (dr ===  1) { a.walls.S = false; b.walls.N = false; }
        else if (dc === -1) { a.walls.W = false; b.walls.E = false; }
        else                { a.walls.E = false; b.walls.W = false; }
    }

    _unvisited({ row: r, col: c }) {
        const out = [];
        if (r > 0             && !this.cells[r-1][c]._vis) out.push(this.cells[r-1][c]);
        if (r < this.rows - 1 && !this.cells[r+1][c]._vis) out.push(this.cells[r+1][c]);
        if (c > 0             && !this.cells[r][c-1]._vis) out.push(this.cells[r][c-1]);
        if (c < this.cols - 1 && !this.cells[r][c+1]._vis) out.push(this.cells[r][c+1]);
        return out;
    }

    /** All 4-connected grid neighbours regardless of walls. */
    _gridNeighbors({ row: r, col: c }) {
        const out = [];
        if (r > 0)             out.push(this.cells[r-1][c]);
        if (r < this.rows - 1) out.push(this.cells[r+1][c]);
        if (c > 0)             out.push(this.cells[r][c-1]);
        if (c < this.cols - 1) out.push(this.cells[r][c+1]);
        return out;
    }

    _assignStartExit() {
        if (this.type === 'dungeon' && this.rooms.length > 0) {
            const cr = this.rows / 2, cc = this.cols / 2;
            const startRoom = this.rooms.reduce((best, rm) => {
                const d  = Math.abs((rm.r1+rm.r2)/2 - cr) + Math.abs((rm.c1+rm.c2)/2 - cc);
                const bd = Math.abs((best.r1+best.r2)/2 - cr) + Math.abs((best.c1+best.c2)/2 - cc);
                return d < bd ? rm : best;
            });
            this.start = this.cells[Math.floor((startRoom.r1+startRoom.r2)/2)]
                                   [Math.floor((startRoom.c1+startRoom.c2)/2)];
            const exitRoom = this.rooms.reduce((best, rm) => {
                const d  = Math.abs((rm.r1+rm.r2)/2 - this.start.row) + Math.abs((rm.c1+rm.c2)/2 - this.start.col);
                const bd = Math.abs((best.r1+best.r2)/2 - this.start.row) + Math.abs((best.c1+best.c2)/2 - this.start.col);
                return d > bd ? rm : best;
            });
            this.exit = this.cells[Math.floor((exitRoom.r1+exitRoom.r2)/2)]
                                  [Math.floor((exitRoom.c1+exitRoom.c2)/2)];
        } else if (this.type === 'bsp' && this.rooms.length > 0) {
            // BSP: same strategy as dungeon
            const cr = this.rows / 2, cc = this.cols / 2;
            const startRoom = this.rooms.reduce((best, rm) => {
                const d  = Math.abs((rm.r1+rm.r2)/2 - cr) + Math.abs((rm.c1+rm.c2)/2 - cc);
                const bd = Math.abs((best.r1+best.r2)/2 - cr) + Math.abs((best.c1+best.c2)/2 - cc);
                return d < bd ? rm : best;
            });
            this.start = this.cells[Math.floor((startRoom.r1+startRoom.r2)/2)]
                                   [Math.floor((startRoom.c1+startRoom.c2)/2)];
            const exitRoom = this.rooms.reduce((best, rm) => {
                const d  = Math.abs((rm.r1+rm.r2)/2 - this.start.row) + Math.abs((rm.c1+rm.c2)/2 - this.start.col);
                const bd = Math.abs((best.r1+best.r2)/2 - this.start.row) + Math.abs((best.c1+best.c2)/2 - this.start.col);
                return d > bd ? rm : best;
            });
            this.exit = this.cells[Math.floor((exitRoom.r1+exitRoom.r2)/2)]
                                  [Math.floor((exitRoom.c1+exitRoom.c2)/2)];
        } else if (this.type === 'cave' || this.type === 'drunk') {
            // For freeform solid maps: BFS twice to find diameter endpoints
            const [s, e] = this._bfsExtremes();
            this.start = s;
            this.exit  = e;
        } else {
            const sr = Math.floor(this.rows / 2);
            const sc = Math.floor(this.cols / 2);
            this.start = this.cells[sr][sc];
            this.exit  = this._randomEdgeCell();
        }
    }

    _randomEdgeCell() {
        const edges = [];
        for (let c = 0; c < this.cols; c++) {
            edges.push(this.cells[0][c]);
            edges.push(this.cells[this.rows - 1][c]);
        }
        for (let r = 1; r < this.rows - 1; r++) {
            edges.push(this.cells[r][0]);
            edges.push(this.cells[r][this.cols - 1]);
        }
        const choices = edges.filter(cell => cell !== this.start);
        return choices[Math.floor(Math.random() * choices.length)];
    }

    static _rnd(n) { return Math.floor(Math.random() * n); }
    static _pick(arr) { return arr[Maze._rnd(arr.length)]; }

    /* ════════════════════════════════════════════════════════════════════
       1. Perfect — iterative DFS / recursive backtracker
    ════════════════════════════════════════════════════════════════════ */
    _genDFS() {
        const sr = Math.floor(this.rows / 2);
        const sc = Math.floor(this.cols / 2);
        const stack = [this.cells[sr][sc]];
        this.cells[sr][sc]._vis = true;

        while (stack.length > 0) {
            const cur  = stack[stack.length - 1];
            const nbrs = this._unvisited(cur);
            if (nbrs.length === 0) {
                stack.pop();
            } else {
                const next = Maze._pick(nbrs);
                this._knock(cur, next);
                next._vis = true;
                stack.push(next);
            }
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       2. Prim's — randomised Prim's spanning tree
          Produces a more "bushy" / evenly-distributed texture.
    ════════════════════════════════════════════════════════════════════ */
    _genPrim() {
        const sr = Math.floor(this.rows / 2);
        const sc = Math.floor(this.cols / 2);
        this.cells[sr][sc]._vis = true;

        // frontier: {cell, via} pairs — cell is unvisited, via is its visited neighbour
        const frontier = [];
        const addFrontier = cell => {
            for (const nb of this._unvisited(cell)) {
                frontier.push({ cell: nb, via: cell });
                nb._vis = true;   // mark to avoid duplicates
            }
        };

        addFrontier(this.cells[sr][sc]);

        while (frontier.length > 0) {
            const idx  = Maze._rnd(frontier.length);
            const { cell, via } = frontier.splice(idx, 1)[0];
            // Connect to a random already-in-maze neighbour
            const visited = this._gridNeighbors(cell).filter(n => {
                // n is "in maze" if all of its neighbours that were previously
                // added are now connected — simplest proxy: check if it has any
                // knocked wall, OR it is the start cell.
                return (n === this.cells[sr][sc]) ||
                       (!n.walls.N || !n.walls.S || !n.walls.E || !n.walls.W);
            });
            const parent = visited.length > 0 ? Maze._pick(visited) : via;
            this._knock(cell, parent);
            // add new frontiers from this cell (re-filter unvisited)
            for (const nb of this._gridNeighbors(cell)) {
                if (!nb._vis) {
                    nb._vis = true;
                    frontier.push({ cell: nb, via: cell });
                }
            }
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       3. Imperfect — DFS perfect maze + randomly remove extra walls
          Creates loops / multiple solutions (~18 % of interior walls).
    ════════════════════════════════════════════════════════════════════ */
    _genImperfect() {
        this._genDFS();

        const EXTRA_RATE = 0.18;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (Math.random() > EXTRA_RATE) continue;
                const cell = this.cells[r][c];
                // try to knock a random still-standing interior wall
                const candidates = [];
                if (r > 0             && cell.walls.N) candidates.push(this.cells[r-1][c]);
                if (r < this.rows - 1 && cell.walls.S) candidates.push(this.cells[r+1][c]);
                if (c > 0             && cell.walls.W) candidates.push(this.cells[r][c-1]);
                if (c < this.cols - 1 && cell.walls.E) candidates.push(this.cells[r][c+1]);
                if (candidates.length > 0) this._knock(cell, Maze._pick(candidates));
            }
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       4. Braided — DFS then eliminate ALL dead ends
          Dead end = cell with exactly 3 walls standing.
          Opens one wall toward a neighbour (prefer one that is also a dead end).
    ════════════════════════════════════════════════════════════════════ */
    _genBraided() {
        this._genDFS();

        const wallCount = cell =>
            (cell.walls.N ? 1 : 0) + (cell.walls.S ? 1 : 0) +
            (cell.walls.E ? 1 : 0) + (cell.walls.W ? 1 : 0);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.cells[r][c];
                if (wallCount(cell) < 3) continue;
                // Find neighbours behind a wall
                const walled = [];
                if (r > 0             && cell.walls.N) walled.push(this.cells[r-1][c]);
                if (r < this.rows - 1 && cell.walls.S) walled.push(this.cells[r+1][c]);
                if (c > 0             && cell.walls.W) walled.push(this.cells[r][c-1]);
                if (c < this.cols - 1 && cell.walls.E) walled.push(this.cells[r][c+1]);
                if (walled.length === 0) continue;
                // Prefer connecting to another dead end
                const deadEnds = walled.filter(n => wallCount(n) >= 3);
                this._knock(cell, Maze._pick(deadEnds.length > 0 ? deadEnds : walled));
            }
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       5. Dungeon — rooms connected by L-shaped corridors.
          All other cells remain solid (impenetrable wall).
          Start is in the center-most room; exit is in the farthest room.
    ════════════════════════════════════════════════════════════════════ */
    _genDungeon() {
        const {
            minRoom    = 3,
            maxRoom    = 8,
            extraPaths = 2,
            solidWalls = true,
        } = this.opts;

        // Mark every cell as solid wall
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                this.cells[r][c].solid = true;

        const MIN_ROOM = Math.max(2, minRoom);
        const MAX_ROOM = Math.max(MIN_ROOM + 1, Math.min(maxRoom, Math.floor(Math.min(this.cols, this.rows) / 2)));
        const ATTEMPTS = Math.floor(this.cols * this.rows / 16) + 18;
        const placed   = [];

        const overlaps = (r1, c1, r2, c2) => {
            const P = 2;
            return placed.some(p =>
                r1 - P <= p.r2 && r2 + P >= p.r1 &&
                c1 - P <= p.c2 && c2 + P >= p.c1
            );
        };

        for (let i = 0; i < ATTEMPTS; i++) {
            const rh = MIN_ROOM + Maze._rnd(MAX_ROOM - MIN_ROOM + 1);
            const rw = MIN_ROOM + Maze._rnd(MAX_ROOM - MIN_ROOM + 1);
            const r1 = 1 + Maze._rnd(this.rows - rh - 2);
            const c1 = 1 + Maze._rnd(this.cols - rw - 2);
            const r2 = r1 + rh - 1, c2 = c1 + rw - 1;
            if (overlaps(r1, c1, r2, c2)) continue;
            placed.push({ r1, c1, r2, c2 });
            for (let r = r1; r <= r2; r++) {
                for (let c = c1; c <= c2; c++) {
                    this.cells[r][c].solid = false;
                    if (r > r1) this._knock(this.cells[r][c], this.cells[r-1][c]);
                    if (c > c1) this._knock(this.cells[r][c], this.cells[r][c-1]);
                }
            }
        }
        this.rooms = placed;
        if (placed.length === 0) return;

        // MST: connect every room with minimum spanning corridors
        const connected = new Set([0]);
        while (connected.size < placed.length) {
            let bestDist = Infinity, bestFrom = -1, bestTo = -1;
            for (const ai of connected) {
                for (let bi = 0; bi < placed.length; bi++) {
                    if (connected.has(bi)) continue;
                    const d = this._roomDist(placed[ai], placed[bi]);
                    if (d < bestDist) { bestDist = d; bestFrom = ai; bestTo = bi; }
                }
            }
            if (bestFrom < 0) break;
            this._carveCorridor(placed[bestFrom], placed[bestTo]);
            connected.add(bestTo);
        }

        // Extra paths: add additional corridors between random room pairs
        const extra = Math.max(0, extraPaths);
        for (let i = 0; i < extra; i++) {
            const ai = Maze._rnd(placed.length);
            let   bi = Maze._rnd(placed.length);
            if (bi === ai) bi = (ai + 1) % placed.length;
            this._carveCorridor(placed[ai], placed[bi]);
        }

        // solidWalls=false: DFS-carve remaining solid cells into a maze
        if (!solidWalls) {
            // un-solid everything, then DFS from every still-unvisited non-room cell
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++)
                    this.cells[r][c].solid = false;

            // mark carved cells as visited
            for (const { r1, c1, r2, c2 } of placed)
                for (let r = r1; r <= r2; r++)
                    for (let c = c1; c <= c2; c++)
                        this.cells[r][c]._vis = true;

            // mark corridor cells as visited
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++) {
                    const cell = this.cells[r][c];
                    if (!cell._vis && (!cell.walls.N || !cell.walls.S || !cell.walls.E || !cell.walls.W))
                        cell._vis = true;
                }

            // DFS to fill remaining unvisited cells
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.cells[r][c]._vis) continue;
                    const stack = [this.cells[r][c]];
                    this.cells[r][c]._vis = true;
                    while (stack.length > 0) {
                        const cur  = stack[stack.length - 1];
                        const nbrs = this._unvisited(cur);
                        if (nbrs.length === 0) { stack.pop(); }
                        else {
                            const next = Maze._pick(nbrs);
                            this._knock(cur, next);
                            next._vis = true;
                            stack.push(next);
                        }
                    }
                }
            }
        }
    }

    _roomDist(a, b) {
        return Math.abs((a.r1+a.r2)/2 - (b.r1+b.r2)/2) +
               Math.abs((a.c1+a.c2)/2 - (b.c1+b.c2)/2);
    }

    /** Carve a 1-cell-wide horizontal run, knocking walls between consecutive cells. */
    _carveHLine(r, cA, cB) {
        const [lo, hi] = cA <= cB ? [cA, cB] : [cB, cA];
        for (let c = lo; c <= hi; c++) {
            this.cells[r][c].solid = false;
            if (c > lo) this._knock(this.cells[r][c], this.cells[r][c-1]);
        }
    }

    /** Carve a 1-cell-wide vertical run, knocking walls between consecutive cells. */
    _carveVLine(c, rA, rB) {
        const [lo, hi] = rA <= rB ? [rA, rB] : [rB, rA];
        for (let r = lo; r <= hi; r++) {
            this.cells[r][c].solid = false;
            if (r > lo) this._knock(this.cells[r][c], this.cells[r-1][c]);
        }
    }

    /** Carve an L-shaped corridor between the centres of two rooms. */
    _carveCorridor(roomA, roomB) {
        const r1 = Math.floor((roomA.r1 + roomA.r2) / 2);
        const c1 = Math.floor((roomA.c1 + roomA.c2) / 2);
        const r2 = Math.floor((roomB.r1 + roomB.r2) / 2);
        const c2 = Math.floor((roomB.c1 + roomB.c2) / 2);
        if (Math.random() < 0.5) {
            this._carveHLine(r1, c1, c2);
            this._carveVLine(c2, r1, r2);
        } else {
            this._carveVLine(c1, r1, r2);
            this._carveHLine(r2, c1, c2);
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       6. Open / Sparse — remove ~55 % of all interior walls randomly.
          Very few walls remain; feels like an open cavern field.
    ════════════════════════════════════════════════════════════════════ */
    _genOpen() {
        const REMOVE_RATE = 0.55;
        // Enumerate every unique interior wall (E wall of each cell == W wall of right
        // neighbour; S wall == N wall of below — only iterate each once).
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (c < this.cols - 1 && Math.random() < REMOVE_RATE)
                    this._knock(this.cells[r][c], this.cells[r][c+1]);
                if (r < this.rows - 1 && Math.random() < REMOVE_RATE)
                    this._knock(this.cells[r][c], this.cells[r+1][c]);
            }
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       7. BSP Dungeon — Binary Space Partitioning
          Algorithm:
            1. Maintain a list of "partitions" (rectangular regions).
            2. Repeatedly split the largest partition either horizontally
               or vertically at a random interior position.
            3. Stop when all partitions are below a threshold.
            4. Place a randomly-sized room in each leaf partition.
            5. Walk up the partition tree connecting sibling room centres
               with L-shaped corridors.
          Result: well-distributed rooms with guaranteed full connectivity,
          no overlapping rooms. Classic roguelike feel.
    ════════════════════════════════════════════════════════════════════ */
    _genBSP() {
        const {
            minRoom    = 3,
            maxRoom    = 8,
            extraPaths = 1,
            solidWalls = true,
        } = this.opts;

        // Mark everything solid
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                this.cells[r][c].solid = true;

        const MIN_PART = Math.max(minRoom + 2, 5);

        // Recursive BSP: returns the list of leaf rooms
        const split = (r1, c1, r2, c2, depth) => {
            const h = r2 - r1, w = c2 - c1;
            // Leaf: partition is too small to split further
            if ((h < MIN_PART * 2 && w < MIN_PART * 2) || depth > 8) {
                // Place a room inside this partition (with 1-cell border)
                const rh  = Math.max(minRoom, Math.min(maxRoom, minRoom + Maze._rnd(Math.max(1, h - minRoom - 1))));
                const rw  = Math.max(minRoom, Math.min(maxRoom, minRoom + Maze._rnd(Math.max(1, w - minRoom - 1))));
                const pr1 = r1 + 1 + Maze._rnd(Math.max(1, h - rh - 1));
                const pc1 = c1 + 1 + Maze._rnd(Math.max(1, w - rw - 1));
                const pr2 = Math.min(r2 - 1, pr1 + rh - 1);
                const pc2 = Math.min(c2 - 1, pc1 + rw - 1);
                if (pr2 <= pr1 || pc2 <= pc1) return [];
                // Carve room
                for (let r = pr1; r <= pr2; r++)
                    for (let c = pc1; c <= pc2; c++) {
                        this.cells[r][c].solid = false;
                        if (r > pr1) this._knock(this.cells[r][c], this.cells[r-1][c]);
                        if (c > pc1) this._knock(this.cells[r][c], this.cells[r][c-1]);
                    }
                return [{ r1: pr1, c1: pc1, r2: pr2, c2: pc2 }];
            }

            // Choose split direction: prefer to split the longer axis
            const splitH = (h >= w) ? (h >= MIN_PART * 2) : (w < MIN_PART * 2);
            let roomsA, roomsB, connectA, connectB;

            if (splitH) {
                const split = r1 + MIN_PART + Maze._rnd(Math.max(1, h - MIN_PART * 2));
                roomsA = split(r1, c1, split,  c2, depth + 1);
                roomsB = split(split, c1, r2,  c2, depth + 1);
            } else {
                const split = c1 + MIN_PART + Maze._rnd(Math.max(1, w - MIN_PART * 2));
                roomsA = split(r1, c1, r2, split,  depth + 1);
                roomsB = split(r1, split, r2, c2,  depth + 1);
            }

            // Connect a room from each side
            if (roomsA.length > 0 && roomsB.length > 0) {
                const ra = Maze._pick(roomsA);
                const rb = Maze._pick(roomsB);
                this._carveCorridor(ra, rb);
            }
            return [...roomsA, ...roomsB];
        };

        // Use a wrapper because the inner function shadows the outer name
        const doSplit = (r1, c1, r2, c2, depth) => {
            const h = r2 - r1, w = c2 - c1;
            if ((h < MIN_PART * 2 && w < MIN_PART * 2) || depth > 8) {
                const rh  = Math.max(minRoom, Math.min(maxRoom, minRoom + Maze._rnd(Math.max(1, h - minRoom - 1))));
                const rw  = Math.max(minRoom, Math.min(maxRoom, minRoom + Maze._rnd(Math.max(1, w - minRoom - 1))));
                const pr1 = r1 + 1 + Maze._rnd(Math.max(1, h - rh - 1));
                const pc1 = c1 + 1 + Maze._rnd(Math.max(1, w - rw - 1));
                const pr2 = Math.min(r2 - 1, pr1 + rh - 1);
                const pc2 = Math.min(c2 - 1, pc1 + rw - 1);
                if (pr2 <= pr1 || pc2 <= pc1) return [];
                for (let r = pr1; r <= pr2; r++)
                    for (let c = pc1; c <= pc2; c++) {
                        this.cells[r][c].solid = false;
                        if (r > pr1) this._knock(this.cells[r][c], this.cells[r-1][c]);
                        if (c > pc1) this._knock(this.cells[r][c], this.cells[r][c-1]);
                    }
                return [{ r1: pr1, c1: pc1, r2: pr2, c2: pc2 }];
            }
            const splitH = (h >= w) ? (h >= MIN_PART * 2) : (w < MIN_PART * 2);
            let roomsA, roomsB;
            if (splitH) {
                const sp = r1 + MIN_PART + Maze._rnd(Math.max(1, h - MIN_PART * 2));
                roomsA = doSplit(r1, c1, sp, c2, depth + 1);
                roomsB = doSplit(sp, c1, r2, c2, depth + 1);
            } else {
                const sp = c1 + MIN_PART + Maze._rnd(Math.max(1, w - MIN_PART * 2));
                roomsA = doSplit(r1, c1, r2, sp, depth + 1);
                roomsB = doSplit(r1, sp, r2, c2, depth + 1);
            }
            if (roomsA.length > 0 && roomsB.length > 0)
                this._carveCorridor(Maze._pick(roomsA), Maze._pick(roomsB));
            return [...roomsA, ...roomsB];
        };

        this.rooms = doSplit(0, 0, this.rows, this.cols, 0);

        // Extra random connections
        for (let i = 0; i < Math.max(0, extraPaths); i++) {
            if (this.rooms.length < 2) break;
            const ai = Maze._rnd(this.rooms.length);
            let   bi = Maze._rnd(this.rooms.length - 1);
            if (bi >= ai) bi++;
            this._carveCorridor(this.rooms[ai], this.rooms[bi]);
        }

        if (!solidWalls) {
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++)
                    this.cells[r][c].solid = false;
            this._dfsConnectUnvisited();
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       8. Cave — Cellular Automata
          Algorithm (standard "cave" ruleset):
            1. Randomly fill the grid: each cell becomes a wall with
               probability `fillRate` (default 45 %).
            2. Run `iterations` (default 5) of smoothing:
                 - Count the cell's 8 Moore neighbours that are solid.
                 - Cell becomes solid if count >= 5 (birth/survival).
                 - Cell becomes open  if count <= 3 (underpopulated).
                 - Otherwise state unchanged.
            3. Flood-fill the largest connected open region; mark the
               rest solid (eliminates disconnected pockets).
            4. Open the shared wall between every pair of adjacent
               open cells so algorithms can traverse them.
          Result: organic cave with smooth curved walls, no rooms or
          corridors, guaranteed connected open space.
    ════════════════════════════════════════════════════════════════════ */
    _genCave() {
        const {
            caveFill   = 0.45,
            caveIters  = 5,
        } = this.opts;

        // Step 1: random fill (border is always solid)
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                this.cells[r][c].solid = (r === 0 || r === this.rows-1 ||
                                           c === 0 || c === this.cols-1 ||
                                           Math.random() < caveFill);

        // Step 2: smooth
        const solidAt = (r, c) =>
            (r < 0 || r >= this.rows || c < 0 || c >= this.cols)
                ? 1 : (this.cells[r][c].solid ? 1 : 0);

        for (let iter = 0; iter < caveIters; iter++) {
            const next = [];
            for (let r = 0; r < this.rows; r++) {
                next[r] = [];
                for (let c = 0; c < this.cols; c++) {
                    let n = 0;
                    for (let dr = -1; dr <= 1; dr++)
                        for (let dc = -1; dc <= 1; dc++)
                            if (dr !== 0 || dc !== 0) n += solidAt(r+dr, c+dc);
                    next[r][c] = n >= 5 ? true : (n <= 3 ? false : this.cells[r][c].solid);
                }
            }
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++)
                    this.cells[r][c].solid = next[r][c];
        }

        // Step 3: keep only the largest open connected region
        this._keepLargestOpen();

        // Step 4: open walls between adjacent open cells
        this._openWallsBetweenOpen();
    }

    /* ════════════════════════════════════════════════════════════════════
       9. Drunkard's Walk
          Algorithm (multi-walker variant):
            1. Mark all cells solid.
            2. Place `walkers` (default 3) walkers at random positions.
            3. Each step, each walker moves to a random 4-connected
               neighbour (clamped to interior), marking cells open and
               knocking the wall between the walker's old and new cell.
            4. Stop when `targetFill` fraction of cells are open.
          Result: winding organic tunnel networks. More walkers = more
          branchy; fewer walkers = longer single corridors.
    ════════════════════════════════════════════════════════════════════ */
    _genDrunk() {
        const {
            drunkFill    = 0.38,
            drunkWalkers = 3,
        } = this.opts;

        // All solid to start
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                this.cells[r][c].solid = true;

        const totalOpen  = Math.floor(this.rows * this.cols * Math.max(0.1, Math.min(0.8, drunkFill)));
        let   openCount  = 0;

        const carve = (r, c) => {
            if (this.cells[r][c].solid) { this.cells[r][c].solid = false; openCount++; }
        };

        // Initialise walkers at spread-out positions
        const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
        const walkers = [];
        for (let i = 0; i < Math.max(1, drunkWalkers); i++) {
            const wr = 1 + Maze._rnd(this.rows - 2);
            const wc = 1 + Maze._rnd(this.cols - 2);
            walkers.push([wr, wc]);
            carve(wr, wc);
        }

        let iters = 0;
        const maxIters = this.rows * this.cols * 40;

        while (openCount < totalOpen && iters++ < maxIters) {
            for (const w of walkers) {
                if (openCount >= totalOpen) break;
                const [dr, dc] = Maze._pick(DIRS);
                const nr = Math.max(1, Math.min(this.rows - 2, w[0] + dr));
                const nc = Math.max(1, Math.min(this.cols - 2, w[1] + dc));
                const prev = this.cells[w[0]][w[1]];
                w[0] = nr; w[1] = nc;
                carve(nr, nc);
                this._knock(prev, this.cells[nr][nc]);
            }
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       Shared solid-map helpers
    ════════════════════════════════════════════════════════════════════ */

    /** Keep only the largest flood-fill connected open region; make rest solid. */
    _keepLargestOpen() {
        const visited = new Set();
        let bestRegion = [];

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.cells[r][c];
                if (cell.solid || visited.has(cell)) continue;
                const region = [];
                const q = [cell];
                visited.add(cell);
                while (q.length > 0) {
                    const cur = q.shift();
                    region.push(cur);
                    for (const nb of this._gridNeighbors(cur)) {
                        if (!nb.solid && !visited.has(nb)) {
                            visited.add(nb);
                            q.push(nb);
                        }
                    }
                }
                if (region.length > bestRegion.length) bestRegion = region;
            }
        }

        const keep = new Set(bestRegion);
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (!keep.has(this.cells[r][c])) this.cells[r][c].solid = true;
    }

    /** Open the shared wall between every pair of 4-adjacent open cells. */
    _openWallsBetweenOpen() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.cells[r][c].solid) continue;
                if (r < this.rows - 1 && !this.cells[r+1][c].solid)
                    this._knock(this.cells[r][c], this.cells[r+1][c]);
                if (c < this.cols - 1 && !this.cells[r][c+1].solid)
                    this._knock(this.cells[r][c], this.cells[r][c+1]);
            }
        }
    }

    /**
     * BFS twice to find the two cells in the open region that are
     * farthest apart (graph diameter heuristic).  Used for start/exit.
     */
    _bfsExtremes() {
        // Collect all open cells
        const open = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (!this.cells[r][c].solid) open.push(this.cells[r][c]);

        if (open.length === 0) {
            const mid = this.cells[Math.floor(this.rows/2)][Math.floor(this.cols/2)];
            return [mid, mid];
        }

        const bfsFar = (src) => {
            const dist = new Map([[src, 0]]);
            const q    = [src];
            let   far  = src;
            while (q.length > 0) {
                const cur = q.shift();
                for (const nb of this.getNeighbors(cur)) {
                    if (!dist.has(nb)) {
                        dist.set(nb, dist.get(cur) + 1);
                        q.push(nb);
                        if (dist.get(nb) > dist.get(far)) far = nb;
                    }
                }
            }
            return far;
        };

        const s = bfsFar(open[0]);
        const e = bfsFar(s);
        return [s, e];
    }

    /** DFS to connect all unvisited non-solid cells (used by BSP solidWalls=false). */
    _dfsConnectUnvisited() {
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++) {
                const cell = this.cells[r][c];
                if (cell.solid || cell._vis) continue;
                // check if it already has an open wall (i.e. carved already)
                if (!cell.walls.N || !cell.walls.S || !cell.walls.E || !cell.walls.W)
                    cell._vis = true;
            }
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.cells[r][c]._vis) continue;
                const stack = [this.cells[r][c]];
                this.cells[r][c]._vis = true;
                while (stack.length > 0) {
                    const cur  = stack[stack.length - 1];
                    const nbrs = this._unvisited(cur).filter(n => !n.solid);
                    if (nbrs.length === 0) { stack.pop(); }
                    else {
                        const next = Maze._pick(nbrs);
                        this._knock(cur, next);
                        next._vis = true;
                        stack.push(next);
                    }
                }
            }
        }
    }
}
