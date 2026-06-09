import { initPanelToggle } from '../../../shared/settings.js';
import { SoundPlayer } from './SoundPlayer.js';

/* ════════════════════════════════════════════════════════════════════════════
   main.js — UI controller for Maze Search Algorithms
   ════════════════════════════════════════════════════════════════════════════ */

/* ── State ─────────────────────────────────────────────────────────────────── */
let maze     = null;
let renderer = null;
let animId   = null;
const soundPlayer = new SoundPlayer();

let animState        = 'IDLE';   // IDLE | RUNNING | PAUSED | DONE
let animPhase        = 'visited'; // 'visited' | 'path' | 'complete'
let animVisited      = [];
let animPath         = [];
let animVisitedCount = 0;
let animPathCount    = 0;
let animSpeed        = 5;
let currentAlgKey    = 'ASTAR';
let animCompletedAt  = 0;
let lastSoundIndex   = -1;

const PATH_COLOR_DRAWING  = '#ffd43b';
const PATH_COLOR_COMPLETE = '#00e5ff';
const COMPLETE_HOLD_MS    = 1400;

const batchRunner = new BatchRunner();

/* ── DOM refs ──────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const canvas          = $('mazeCanvas');
const mazeTypeSelect  = $('mazeType');
const colsSlider      = $('colsSlider');
const rowsSlider      = $('rowsSlider');
const colsValEl       = $('colsVal');
const rowsValEl       = $('rowsVal');
const btnGenerate     = $('btnGenerate');
const algSelect       = $('algSelect');
const speedSlider     = $('speedSlider');
const speedValEl      = $('speedVal');
const btnRun          = $('btnRun');
const btnStop         = $('btnStop');
const btnReset        = $('btnReset');
const runStatusEl     = $('runStatus');
const singleStatsEl   = $('singleStats');
const statVisitedEl   = $('statVisited');
const statPathEl      = $('statPath');
const statTimeEl      = $('statTime');
const statComplexEl   = $('statComplexity');
const statOptimalEl   = $('statOptimal');
const statExitInfoEl  = $('statExitInfo');
const batchAlgListEl  = $('batchAlgList');
const batchIterEl     = $('batchIter');
const batchPreviewModeEl = $('batchPreviewMode');
const batchSizeSlider = $('batchSizeSlider');
const batchSizeValEl  = $('batchSizeVal');
const btnBatch        = $('btnBatch');
const batchProgEl     = $('batchProgress');
const batchProgText   = $('batchProgressText');
const batchProgBar    = $('batchProgressBar');
const batchResultsEl  = $('batchResults');
const batchMetaEl     = $('batchMeta');
const batchTableEl    = $('batchTable');
const batchChartEl    = $('batchChart');
const btnCloseBatch   = $('btnCloseBatch');
const btnSave         = $('btnSave');
const saveToastEl     = $('saveToast');
const raceOverlayEl   = $('raceOverlay');
const raceGridEl      = $('raceGrid');
const raceTitleEl     = $('raceTitle');
const btnSkipRace     = $('btnSkipRace');
// dungeon-specific controls
const dungeonOptsEl      = $('dungeonOpts');
const dungeonOptsTitle   = $('dungeonOptsTitle');
const dungRoomRowsEl     = $('dungRoomRows');
const dungCaveRowsEl     = $('dungCaveRows');
const dungDrunkRowsEl    = $('dungDrunkRows');
const dungSolidRowEl     = $('dungSolidRow');
const dungMinRoomSlider  = $('dungMinRoom');
const dungMinRoomVal     = $('dungMinRoomVal');
const dungMaxRoomSlider  = $('dungMaxRoom');
const dungMaxRoomVal     = $('dungMaxRoomVal');
const dungExtraSlider    = $('dungExtraPaths');
const dungExtraVal       = $('dungExtraPathsVal');
const dungCaveFillSlider = $('dungCaveFill');
const dungCaveFillVal    = $('dungCaveFillVal');
const dungCaveItersSlider= $('dungCaveIters');
const dungCaveItersVal   = $('dungCaveItersVal');
const dungDrunkFillSlider= $('dungDrunkFill');
const dungDrunkFillVal   = $('dungDrunkFillVal');
const dungDrunkWalkSlider= $('dungDrunkWalkers');
const dungDrunkWalkVal   = $('dungDrunkWalkersVal');
const dungSolidWallsCb   = $('dungSolidWalls');
const dungSolidWallsLbl  = $('dungSolidWallsLabel');

/* ── Init ──────────────────────────────────────────────────────────────────── */
function init() {
    resizeCanvas();
    renderer = new Renderer(canvas);

    // GPU / CPU badge
    const badge = $('rendererBadge');
    if (badge) {
        if (renderer.isGPU) {
            badge.textContent = 'WebGL2 GPU';
            badge.classList.add('gpu');
        } else {
            badge.textContent = 'Canvas 2D CPU';
            badge.classList.add('cpu');
        }
    }

    buildSingleAlgList();
    loadSettings();
    syncSingleAlgSelection();
    generateMaze();
    buildBatchAlgList();

    // resize
    window.addEventListener('resize', () => {
        resizeCanvas();
        renderer.resize();
        redraw();
    });

    // maze controls
    colsSlider.addEventListener('input', () => { colsValEl.textContent = colsSlider.value; });
    rowsSlider.addEventListener('input', () => { rowsValEl.textContent = rowsSlider.value; });
    btnGenerate.addEventListener('click', () => { stopAnim(); generateMaze(); });
    mazeTypeSelect.addEventListener('change', updateDungeonVisibility);
    dungMinRoomSlider.addEventListener('input',  () => { dungMinRoomVal.textContent   = dungMinRoomSlider.value; });
    dungMaxRoomSlider.addEventListener('input',  () => { dungMaxRoomVal.textContent   = dungMaxRoomSlider.value; });
    dungExtraSlider.addEventListener('input',    () => { dungExtraVal.textContent     = dungExtraSlider.value; });
    dungCaveFillSlider.addEventListener('input', () => { dungCaveFillVal.textContent  = dungCaveFillSlider.value; });
    dungCaveItersSlider.addEventListener('input',() => { dungCaveItersVal.textContent = dungCaveItersSlider.value; });
    dungDrunkFillSlider.addEventListener('input',() => { dungDrunkFillVal.textContent = dungDrunkFillSlider.value; });
    dungDrunkWalkSlider.addEventListener('input',() => { dungDrunkWalkVal.textContent = dungDrunkWalkSlider.value; });
    dungSolidWallsCb.addEventListener('change',  updateDungeonSolidLabel);
    updateDungeonVisibility();

    // single-run controls
    algSelect.addEventListener('change', () => { currentAlgKey = algSelect.value; });
    speedSlider.addEventListener('input', () => {
        animSpeed = +speedSlider.value;
        speedValEl.textContent = animSpeed;
    });
    btnRun.addEventListener('click',   startRun);
    btnStop.addEventListener('click',  togglePause);
    btnReset.addEventListener('click', () => { stopAnim(); redraw(); });

    // batch controls
    batchSizeSlider.addEventListener('input', () => {
        batchSizeValEl.textContent = batchSizeSlider.value;
    });
    btnBatch.addEventListener('click', startBatch);
    btnCloseBatch.addEventListener('click', () => batchResultsEl.classList.add('hidden'));
    btnSave.addEventListener('click', saveSettings);

    initPanelToggle();
}

/* ── Canvas sizing ─────────────────────────────────────────────────────────── */
function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
}

/* ── Maze generation ───────────────────────────────────────────────────────── */
const DUNGEON_TYPES = new Set(['dungeon', 'bsp', 'cave', 'drunk']);

function updateDungeonVisibility() {
    const t = mazeTypeSelect.value;
    const isDung = DUNGEON_TYPES.has(t);
    dungeonOptsEl.classList.toggle('hidden', !isDung);
    if (!isDung) return;

    const isRoom  = t === 'dungeon' || t === 'bsp';
    const isCave  = t === 'cave';
    const isDrunk = t === 'drunk';
    const hasSolid = isRoom || isDrunk;

    dungRoomRowsEl.classList.toggle('hidden', !isRoom);
    dungCaveRowsEl.classList.toggle('hidden', !isCave);
    dungDrunkRowsEl.classList.toggle('hidden', !isDrunk);
    dungSolidRowEl.classList.toggle('hidden', !hasSolid);

    const titles = { dungeon: 'Dungeon Settings', bsp: 'BSP Settings', cave: 'Cave Settings', drunk: "Drunkard's Walk Settings" };
    dungeonOptsTitle.textContent = titles[t] || 'Dungeon Settings';
}

function updateDungeonSolidLabel() {
    dungSolidWallsLbl.textContent = dungSolidWallsCb.checked
        ? 'non-room cells are impassable'
        : 'non-room cells form a maze';
}

function dungeonOpts() {
    const t = mazeTypeSelect.value;
    if (t === 'cave') {
        return {
            caveFill:  +dungCaveFillSlider.value / 100,
            caveIters: +dungCaveItersSlider.value,
        };
    }
    if (t === 'drunk') {
        return {
            drunkFill:    +dungDrunkFillSlider.value / 100,
            drunkWalkers: +dungDrunkWalkSlider.value,
            solidWalls:   dungSolidWallsCb.checked,
        };
    }
    // dungeon + bsp
    return {
        minRoom:    +dungMinRoomSlider.value,
        maxRoom:    +dungMaxRoomSlider.value,
        extraPaths: +dungExtraSlider.value,
        solidWalls: dungSolidWallsCb.checked,
    };
}

function generateMaze() {
    const cols  = +colsSlider.value;
    const rows  = +rowsSlider.value;
    const type  = mazeTypeSelect.value;
    maze = new Maze(cols, rows, type, DUNGEON_TYPES.has(type) ? dungeonOpts() : {});
    renderer.setMaze(maze);
    resetAnimState();
    singleStatsEl.classList.add('hidden');
    setStatus('');
    redraw();
}

function buildSingleAlgList() {
    algSelect.innerHTML = '';

    for (const [key, info] of Object.entries(ALG_INFO)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${info.name} - ${info.fullName}`;
        algSelect.appendChild(option);
    }
}

function syncSingleAlgSelection() {
    if (!ALG_INFO[currentAlgKey]) currentAlgKey = 'ASTAR';
    algSelect.value = currentAlgKey;
}

function redraw() {
    if (!maze) return;
    const pathColor = animPhase === 'complete' ? PATH_COLOR_COMPLETE : PATH_COLOR_DRAWING;
    renderer.draw(
        animVisited, animVisitedCount,
        animPath,    animPathCount,
        ALG_INFO[currentAlgKey]?.color ?? '#4a9eff',
        pathColor
    );
}

/* ── Single Run ────────────────────────────────────────────────────────────── */
function startRun() {
    if (animState === 'RUNNING') return;
    stopAnim();

    currentAlgKey = algSelect.value;
    animSpeed     = +speedSlider.value;

    const t0     = performance.now();
    const result = runAlgorithm(currentAlgKey, maze, maze.start, maze.exit);
    const dt     = performance.now() - t0;

    animVisited      = result.visited;
    animPath         = result.path;
    animVisitedCount = 0;
    animPathCount    = 0;
    animPhase        = 'visited';
    animState        = 'RUNNING';
    lastSoundIndex   = -1;

    // Populate stats panel immediately (computed values, not animation frame)
    const info = ALG_INFO[currentAlgKey];
    statVisitedEl.textContent  = result.visited.length;
    statPathEl.textContent     = result.path.length > 0 ? result.path.length : '—';
    statTimeEl.textContent     = dt.toFixed(3) + ' ms';
    statComplexEl.textContent  = info.complexity;
    statOptimalEl.textContent  = info.optimal ? '✓ Yes' : '✗ No';
    statOptimalEl.className    = info.optimal ? 'stat-optimal-yes' : 'stat-optimal-no';
    statExitInfoEl.textContent = info.exitInfo;
    singleStatsEl.classList.remove('hidden');

    setStatus('Exploring…', 'exploring');
    setBtnState('running');
    animId = requestAnimationFrame(animFrame);
}

function animFrame() {
    if (animState !== 'RUNNING') return;

    if (animPhase === 'visited') {
        const prevVisited = animVisitedCount;
        animVisitedCount = Math.min(animVisitedCount + animSpeed, animVisited.length);
        playVisitedSound(prevVisited, animVisitedCount);
        const pct = Math.round(animVisitedCount / Math.max(1, animVisited.length) * 100);
        setStatus(`Exploring… ${pct}%`, 'exploring');

        if (animVisitedCount >= animVisited.length) {
            if (animPath.length === 0) {
                animState = 'DONE';
                setStatus('No path found!', 'nofound');
                setBtnState('done');
            } else {
                // Path appears all at once, then hold in complete colour
                animPhase       = 'complete';
                animPathCount   = animPath.length;
                animCompletedAt = performance.now();
                playPathCompleteSound();
                setStatus(`\u2713 Path complete \u2014 ${animPath.length} steps`, 'complete');
            }
        }
    } else if (animPhase === 'complete') {
        if (performance.now() - animCompletedAt >= COMPLETE_HOLD_MS) {
            animState = 'DONE';
            setBtnState('done');
        }
    }

    redraw();
    if (animState === 'RUNNING') animId = requestAnimationFrame(animFrame);
}

function togglePause() {
    if (animState === 'RUNNING') {
        animState = 'PAUSED';
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        btnStop.textContent = '▶ Resume';
    } else if (animState === 'PAUSED') {
        animState = 'RUNNING';
        btnStop.textContent = '⏸ Pause';
        animId = requestAnimationFrame(animFrame);
    }
}

function stopAnim() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    resetAnimState();
    setBtnState('idle');
}

function resetAnimState() {
    animState        = 'IDLE';
    animPhase        = 'visited';
    animVisited      = [];
    animPath         = [];
    animVisitedCount = 0;
    animPathCount    = 0;
    animCompletedAt  = 0;
    lastSoundIndex   = -1;
}

function getSearchStepDelayMs() {
    // Convert visual speed slider into an approximate per-step delay for audio adaptation.
    return Math.max(2, Math.round(240 / Math.max(1, animSpeed)));
}

function playVisitedSound(previousCount, nextCount) {
    if (!maze || nextCount <= previousCount || animVisited.length === 0) return;

    const sampleIndex = Math.max(0, nextCount - 1);
    if (sampleIndex === lastSoundIndex) return;
    lastSoundIndex = sampleIndex;

    const cell = animVisited[sampleIndex];
    if (!cell) return;

    const value = cell.row * maze.cols + cell.col + 1;
    const maxValue = Math.max(1, maze.cols * maze.rows);
    soundPlayer.playHeight(value, 1, maxValue, {
        stepDelayMs: getSearchStepDelayMs(),
    }).catch(() => {});
}

function playPathCompleteSound() {
    if (!maze || animPath.length === 0) return;

    const maxValue = Math.max(1, maze.cols * maze.rows);
    const midpoint = animPath[Math.floor(animPath.length / 2)] || animPath[0];
    const end = animPath[animPath.length - 1];

    const firstValue = midpoint.row * maze.cols + midpoint.col + 1;
    const secondValue = end.row * maze.cols + end.col + 1;

    soundPlayer.playHeight(firstValue, 1, maxValue, { stepDelayMs: 14 }).catch(() => {});
    window.setTimeout(() => {
        soundPlayer.playHeight(secondValue, 1, maxValue, { stepDelayMs: 14 }).catch(() => {});
    }, 50);
}

function setBtnState(state) {
    btnRun.disabled  = (state === 'running' || state === 'paused');
    btnStop.disabled = (state === 'idle' || state === 'done');
    if (state !== 'paused') btnStop.textContent = '⏸ Pause';
}

function setStatus(msg, cls = '') {
    runStatusEl.textContent = msg;
    runStatusEl.className   = 'run-status' + (cls ? ' ' + cls : '');
}

/* ── Batch Run ─────────────────────────────────────────────────────────────── */
function buildBatchAlgList() {
    batchAlgListEl.innerHTML = '';
    for (const [key, info] of Object.entries(ALG_INFO)) {
        const lbl = document.createElement('label');
        lbl.className = 'alg-check';
        lbl.innerHTML = `
            <input type="checkbox" value="${key}" checked>
            <span class="alg-dot" style="background:${info.color}"></span>
            <span>${info.name} <span style="color:var(--dim);font-size:0.72rem">— ${info.fullName}</span></span>
        `;
        batchAlgListEl.appendChild(lbl);
    }
}

async function startBatch() {
    const checked = [
        ...batchAlgListEl.querySelectorAll('input[type=checkbox]:checked')
    ].map(el => el.value);

    if (checked.length === 0) {
        alert('Select at least one algorithm to test.');
        return;
    }

    const iterations = Math.max(1, Math.min(1000, parseInt(batchIterEl.value) || 100));
    const size       = +batchSizeSlider.value;

    // ── 1. Sampled race preview ───────────────────────────────────────────
    await runBatchPreview(checked, iterations, size);

    // ── 2. Headless batch iterations ──────────────────────────────────────
    btnBatch.disabled    = true;
    btnBatch.textContent = 'Running…';
    batchProgEl.classList.remove('hidden');
    batchProgText.textContent  = `0 / ${iterations}`;
    batchProgBar.style.width   = '0%';

    let results;
    try {
        results = await batchRunner.run(checked, iterations, size, (done, total) => {
            batchProgText.textContent = `${done} / ${total}`;
            batchProgBar.style.width  = (done / total * 100).toFixed(1) + '%';
        });
    } finally {
        batchProgEl.classList.add('hidden');
        btnBatch.disabled    = false;
        btnBatch.textContent = '⚡ Run Batch';
    }

    showBatchResults(results, checked, iterations, size);
}

/* ── Batch preview ─────────────────────────────────────────────────────────── */
function runBatchPreview(algKeys, iterations, size) {
    const sampleCount = _batchPreviewCount(iterations, batchPreviewModeEl.value);
    if (sampleCount <= 0) return Promise.resolve();

    return new Promise(resolve => {
        let index = 0;

        const runNext = () => {
            if (index >= sampleCount) {
                raceOverlayEl.classList.add('hidden');
                resolve();
                return;
            }

            runRaceIteration(algKeys, size, index, sampleCount).then(() => {
                index++;
                runNext();
            });
        };

        runNext();
    });
}

/* ── Race preview ──────────────────────────────────────────────────────────── */
function runRaceIteration(algKeys, size, iterationIndex, iterationCount) {
    return new Promise(resolve => {
        // Build a shared maze for the race
        const raceMaze = new Maze(size, size);

        // Pre-compute all results
        const results = algKeys.map(key => ({
            key,
            info:    ALG_INFO[key],
            result:  runAlgorithm(key, raceMaze, raceMaze.start, raceMaze.exit),
        }));

        const maxVisited = Math.max(...results.map(r => r.result.visited.length));

        // Determine grid columns (max 3 per row, balanced)
        const n     = algKeys.length;
        const cols  = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 3;
        const TILE  = Math.max(120, Math.min(260, Math.floor((window.innerWidth * 0.9 - cols * 12) / cols)));

        raceTitleEl.textContent = iterationCount > 1
            ? `Batch Preview ${iterationIndex + 1}/${iterationCount} — ${size}×${size} maze`
            : `Algorithm Race — ${size}×${size} maze`;
        raceGridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        raceGridEl.innerHTML = '';

        // Build tile canvases
        const tiles = results.map(({ key, info, result }) => {
            const tile = document.createElement('div');
            tile.className = 'race-tile';

            const header = document.createElement('div');
            header.className = 'race-tile-header';
            header.innerHTML = `
                <span class="race-tile-dot" style="background:${info.color}"></span>
                <span>${info.name} — ${info.fullName}</span>
                <span class="race-tile-stat" id="race-stat-${key}">0 / ${result.visited.length}</span>
            `;

            const cv = document.createElement('canvas');
            cv.width  = TILE;
            cv.height = Math.round(TILE * (size / size)); // square
            cv.style.aspectRatio = '1';

            tile.appendChild(header);
            tile.appendChild(cv);
            raceGridEl.appendChild(tile);

            const r = new Renderer(cv);
            r.setMaze(raceMaze);

            return { key, info, result, renderer: r, statEl: header.querySelector(`#race-stat-${key}`) };
        });

        raceOverlayEl.classList.remove('hidden');

        // Animate — all canvases step together
        const RACE_SPEED = Math.max(1, Math.ceil(maxVisited / 180)); // ~3 s for explored phase
        let visitedCount = 0;
        let raceRafId    = null;
        let skipped      = false;

        function finish() {
            // Draw fully completed state for all tiles
            tiles.forEach(({ result, renderer, info, statEl }) => {
                renderer.draw(
                    result.visited, result.visited.length,
                    result.path,    result.path.length,
                    info.color, '#00e5ff'
                );
                statEl.textContent = `${result.visited.length} visited · path ${result.path.length || '—'}`;
            });
        }

        function skipRace() {
            if (skipped) return;
            skipped = true;
            if (raceRafId) cancelAnimationFrame(raceRafId);
            finish();
            // Hold briefly then close
            setTimeout(() => {
                resolve();
            }, 600);
        }

        btnSkipRace.onclick = skipRace;

        function raceFrame() {
            visitedCount = Math.min(visitedCount + RACE_SPEED, maxVisited);

            let allPathDone = true;
            tiles.forEach(({ result, renderer, info, statEl }) => {
                const vc = Math.min(visitedCount, result.visited.length);
                // Once visited done for this alg, show full path immediately
                const pc = vc >= result.visited.length ? result.path.length : 0;
                if (pc < result.path.length) allPathDone = false;

                renderer.draw(
                    result.visited, vc,
                    result.path,    pc,
                    info.color,
                    pc > 0 ? '#00e5ff' : '#ffd43b'
                );
                statEl.textContent = vc < result.visited.length
                    ? `${vc} / ${result.visited.length}`
                    : `done · path ${result.path.length || '—'}`;
            });

            if (visitedCount >= maxVisited) {
                finish();
                // Hold 1.8 s then auto-close
                setTimeout(() => {
                    if (!skipped) {
                        skipped = true;
                        resolve();
                    }
                }, 1800);
                return;
            }

            raceRafId = requestAnimationFrame(raceFrame);
        }

        raceRafId = requestAnimationFrame(raceFrame);
    });
}

function _batchPreviewCount(iterations, mode) {
    if (mode === 'max') {
        if (iterations <= 8) return iterations;
        if (iterations <= 20) return 8;
        if (iterations <= 100) return 10;
        return 12;
    }

    if (iterations <= 3) return iterations;
    if (iterations <= 12) return 3;
    if (iterations <= 50) return 4;
    return 5;
}

function showBatchResults(results, algKeys, iterations, size) {
    batchResultsEl.classList.remove('hidden');

    batchMetaEl.textContent =
        `${iterations} iterations · ${size}×${size} maze · ${algKeys.map(k => ALG_INFO[k].name).join(', ')}`;

    /* ── Table ── */
    const headers = ['Algorithm', 'Complexity', 'Optimal?', 'Knows Exit?', 'Avg Visited', 'Path Range', 'Avg Path', 'Avg Time'];
    let html = `<table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>`;

    for (const k of algKeys) {
        const info = ALG_INFO[k];
        const r    = results[k];
        html += `<tr>
            <td>
              <div class="alg-name-cell">
                <span class="alg-dot" style="background:${info.color};width:10px;height:10px;border-radius:50%"></span>
                ${info.fullName}
              </div>
            </td>
            <td style="font-family:monospace;font-size:0.76rem">${info.complexity}</td>
            <td><span class="badge ${info.optimal ? 'badge-yes' : 'badge-no'}">${info.optimal ? '✓ Yes' : '✗ No'}</span></td>
            <td style="font-size:0.74rem;color:var(--dim);max-width:220px">${info.exitInfo}</td>
            <td>${r.avgVisited}</td>
            <td style="font-size:0.76rem;color:var(--dim)">${r.minPath}–${r.maxPath}</td>
            <td>${r.avgPathLen}</td>
            <td style="font-family:monospace;font-size:0.76rem">${r.avgTime} ms</td>
        </tr>`;
    }
    html += '</tbody></table>';
    batchTableEl.innerHTML = html;

    /* ── Charts ── */
    const maxVisited = Math.max(...algKeys.map(k => results[k].avgVisited));
    const maxPath    = Math.max(...algKeys.map(k => results[k].avgPathLen));
    const maxTime    = Math.max(...algKeys.map(k => results[k].avgTime));

    function section(title, getValue, max, fmt) {
        const bars = algKeys.map(k => {
            const val = getValue(results[k]);
            const pct = max > 0 ? Math.max(2, val / max * 100).toFixed(1) : 2;
            return `<div class="chart-bar-row">
                <span class="chart-alg-label">${ALG_INFO[k].name}</span>
                <div class="chart-bar-bg">
                    <div class="chart-bar-fill" style="width:${pct}%;background:${ALG_INFO[k].color}">
                        <span class="chart-bar-val">${fmt(val)}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
        return `<div class="chart-section"><h3>${title}</h3>${bars}</div>`;
    }

    batchChartEl.innerHTML =
        section('Avg Explored Cells', r => r.avgVisited, maxVisited, v => v) +
        section('Avg Path Length',    r => r.avgPathLen, maxPath,    v => v) +
        section('Avg Compute Time',   r => r.avgTime,    maxTime,    v => v + ' ms');

    // Trigger CSS transitions
    requestAnimationFrame(() => {
        batchChartEl.querySelectorAll('.chart-bar-fill').forEach(el => {
            const w = el.style.width;
            el.style.width = '0%';
            requestAnimationFrame(() => { el.style.width = w; });
        });
    });
}

/* ── Settings persistence ──────────────────────────────────────────────────── */
const SETTINGS_KEY = 'alg_search:settings';

function saveSettings() {
    const data = {
        mazeType:        mazeTypeSelect.value,
        cols:            colsSlider.value,
        rows:            rowsSlider.value,
        algSelect:       algSelect.value,
        speed:           speedSlider.value,
        batchSize:       batchSizeSlider.value,
        batchIter:       batchIterEl.value,
        batchPreviewMode: batchPreviewModeEl.value,
        dungMinRoom:     dungMinRoomSlider.value,
        dungMaxRoom:     dungMaxRoomSlider.value,
        dungExtraPaths:  dungExtraSlider.value,
        dungSolidWalls:  dungSolidWallsCb.checked,
        dungCaveFill:    dungCaveFillSlider.value,
        dungCaveIters:   dungCaveItersSlider.value,
        dungDrunkFill:   dungDrunkFillSlider.value,
        dungDrunkWalkers:dungDrunkWalkSlider.value,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    showSaveToast();
}

function loadSettings() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (_) {}
    if (!data) return;

    if (data.mazeType)  { mazeTypeSelect.value = data.mazeType; updateDungeonVisibility(); }
    if (data.cols)      { colsSlider.value = data.cols;  colsValEl.textContent  = data.cols; }
    if (data.rows)      { rowsSlider.value = data.rows;  rowsValEl.textContent  = data.rows; }
    if (data.algSelect && ALG_INFO[data.algSelect]) currentAlgKey = data.algSelect;
    if (data.speed)     { speedSlider.value = data.speed; speedValEl.textContent = data.speed; animSpeed = +data.speed; }
    if (data.batchSize) { batchSizeSlider.value = data.batchSize; batchSizeValEl.textContent = data.batchSize; }
    if (data.batchIter) batchIterEl.value = data.batchIter;
    if (data.batchPreviewMode === 'min' || data.batchPreviewMode === 'max') batchPreviewModeEl.value = data.batchPreviewMode;
    if (data.dungMinRoom     != null) { dungMinRoomSlider.value  = data.dungMinRoom;      dungMinRoomVal.textContent   = data.dungMinRoom; }
    if (data.dungMaxRoom     != null) { dungMaxRoomSlider.value  = data.dungMaxRoom;      dungMaxRoomVal.textContent   = data.dungMaxRoom; }
    if (data.dungExtraPaths  != null) { dungExtraSlider.value    = data.dungExtraPaths;   dungExtraVal.textContent     = data.dungExtraPaths; }
    if (data.dungSolidWalls  != null) { dungSolidWallsCb.checked = data.dungSolidWalls;   updateDungeonSolidLabel(); }
    if (data.dungCaveFill    != null) { dungCaveFillSlider.value  = data.dungCaveFill;    dungCaveFillVal.textContent  = data.dungCaveFill; }
    if (data.dungCaveIters   != null) { dungCaveItersSlider.value = data.dungCaveIters;   dungCaveItersVal.textContent = data.dungCaveIters; }
    if (data.dungDrunkFill   != null) { dungDrunkFillSlider.value = data.dungDrunkFill;   dungDrunkFillVal.textContent = data.dungDrunkFill; }
    if (data.dungDrunkWalkers!= null) { dungDrunkWalkSlider.value = data.dungDrunkWalkers;dungDrunkWalkVal.textContent = data.dungDrunkWalkers; }
}

let _toastTimer = null;
function showSaveToast() {
    saveToastEl.classList.remove('hidden');
    // Force reflow so the transition fires even on repeated clicks
    saveToastEl.classList.remove('show');
    void saveToastEl.offsetWidth;
    saveToastEl.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        saveToastEl.classList.remove('show');
        setTimeout(() => saveToastEl.classList.add('hidden'), 280);
    }, 1800);
}

/* ── Boot ──────────────────────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
