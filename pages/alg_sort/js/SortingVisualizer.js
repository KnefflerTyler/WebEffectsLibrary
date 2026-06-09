'use strict';

import { initPanelToggle } from '../../../shared/settings.js';
import { BarChartRenderer } from './BarChartRenderer.js';
import { SortingAlgorithms } from './SortingAlgorithms.js';
import { SoundPlayer } from './SoundPlayer.js';

const $ = id => document.getElementById(id);

export class SortingVisualizer {
    constructor() {
        this.settingsStorageKey = 'alg_sort_settings_v1';
        this.canvas = $('sortCanvas');
        this.sizeSlider = $('sizeSlider');
        this.sizeVal = $('sizeVal');
        this.patternSelect = $('patternSelect');
        this.btnRandomize = $('btnRandomize');
        this.algSelect = $('algSelect');
        this.speedSlider = $('speedSlider');
        this.speedVal = $('speedVal');
        this.btnRun = $('btnRun');
        this.btnPause = $('btnPause');
        this.btnReset = $('btnReset');
        this.btnSaveSettings = $('btnSaveSettings');
        this.runStatusEl = $('runStatus');
        this.statComparisonsEl = $('statComparisons');
        this.statSwapsEl = $('statSwaps');
        this.statPassesEl = $('statPasses');
        this.statStepsEl = $('statSteps');

        this.renderer = new BarChartRenderer(this.canvas);
        this.soundPlayer = new SoundPlayer();

        this.sourceValues = [];
        this.values = [];
        this.sortedMask = [];
        this.currentIndex = null;
        this.comparisonIndex = null;
        this.currentSteps = [];
        this.currentStepIndex = 0;
        this.timerId = null;
        this.runToken = 0;
        this.running = false;
        this.paused = false;
        this.comparisons = 0;
        this.swaps = 0;
        this.passes = 0;
    }

    init() {
        this.populateAlgorithms();
        this.loadSettings();
        this.updateSpeedLabel();
        this.randomizeArray();
        this.render();
        this.bindEvents();
        initPanelToggle();
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.render();
        });

        this.sizeSlider.addEventListener('input', () => {
            this.sizeVal.textContent = this.sizeSlider.value;
            if (!this.running) {
                this.randomizeArray();
                this.render();
            }
        });

        this.patternSelect.addEventListener('change', () => {
            if (!this.running) {
                this.randomizeArray();
                this.render();
            }
        });

        this.btnRandomize.addEventListener('click', () => {
            this.stopRun();
            this.randomizeArray();
            this.render();
        });

        this.algSelect.addEventListener('change', () => {
            this.stopRun();
            this.render();
        });

        this.speedSlider.addEventListener('input', () => this.updateSpeedLabel());
        this.btnRun.addEventListener('click', () => this.startRun());
        this.btnPause.addEventListener('click', () => this.togglePause());
        this.btnReset.addEventListener('click', () => {
            this.stopRun();
            this.resetToSource();
            this.render();
        });
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());
    }

    populateAlgorithms() {
        this.algSelect.innerHTML = '';
        for (const { key, name } of SortingAlgorithms.options()) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = name;
            this.algSelect.appendChild(option);
        }
        this.algSelect.value = 'bubble';
    }

    updateSpeedLabel() {
        this.speedVal.textContent = String(this.speedSlider.value);
    }

    getStepDelayMs() {
        const minSpeed = Number(this.speedSlider.min) || 10;
        const maxSpeed = Number(this.speedSlider.max) || 400;
        const speed = Number(this.speedSlider.value) || minSpeed;

        const minDelayMs = 2;
        const maxDelayMs = 220;
        const span = Math.max(1, maxSpeed - minSpeed);
        const t = Math.min(1, Math.max(0, (speed - minSpeed) / span));

        return Math.round(maxDelayMs - t * (maxDelayMs - minDelayMs));
    }

    resetStats() {
        this.comparisons = 0;
        this.swaps = 0;
        this.passes = 0;
        this.currentStepIndex = 0;
        this.currentSteps = [];
        this.currentIndex = null;
        this.comparisonIndex = null;
        this.sortedMask = new Array(this.values.length).fill(false);
        this.updateStats();
    }

    updateStats() {
        this.statComparisonsEl.textContent = String(this.comparisons);
        this.statSwapsEl.textContent = String(this.swaps);
        this.statPassesEl.textContent = String(this.passes);
        this.statStepsEl.textContent = String(this.currentStepIndex);
    }

    randomizeArray() {
        const count = +this.sizeSlider.value;
        this.sizeVal.textContent = String(count);
        this.sourceValues = this.buildArray(count, this.patternSelect.value);
        this.resetToSource();
        this.resetStats();
        this.setStatus('Array ready');
    }

    resetToSource() {
        this.values = this.sourceValues.slice();
        this.sortedMask = new Array(this.values.length).fill(false);
        this.currentIndex = null;
        this.comparisonIndex = null;
        this.currentStepIndex = 0;
        this.updateStats();
    }

    buildArray(count, pattern) {
        const result = Array.from({ length: count }, (_, i) => i + 1);

        switch (pattern) {
            case 'reversed':
                result.reverse();
                break;
            case 'nearly':
                this.shuffle(result, Math.max(1, Math.floor(count * 0.18)));
                result.sort((a, b) => a - b);
                for (let i = 0; i < Math.max(2, Math.floor(count * 0.12)); i++) {
                    const a = this.rand(count);
                    const b = this.rand(count);
                    [result[a], result[b]] = [result[b], result[a]];
                }
                break;
            case 'few': {
                const buckets = 7;
                for (let i = 0; i < count; i++) {
                    result[i] = 1 + Math.floor((i / count) * buckets);
                }
                this.shuffle(result, count);
                break;
            }
            default:
                this.shuffle(result, count);
                break;
        }

        return result;
    }

    shuffle(arr, passes = arr.length) {
        for (let i = 0; i < passes; i++) {
            const a = this.rand(arr.length);
            const b = this.rand(arr.length);
            [arr[a], arr[b]] = [arr[b], arr[a]];
        }
    }

    rand(max) {
        return Math.floor(Math.random() * max);
    }

    startRun() {
        if (this.running && this.paused) {
            this.togglePause();
            return;
        }

        this.stopRun();
        this.resetToSource();

        const algorithmKey = this.algSelect.value;
        const algorithmName = SortingAlgorithms.nameFor(algorithmKey);
        const workingValues = this.values.slice();
        this.currentSteps = SortingAlgorithms.run(algorithmKey, workingValues);
        this.currentStepIndex = 0;
        this.running = true;
        this.paused = false;
        this.runToken += 1;

        this.btnRun.disabled = true;
        this.btnPause.disabled = false;
        this.btnPause.textContent = '⏸ Pause';
        this.setStatus(`Running ${algorithmName}`);
        this.tick(this.runToken);
    }

    stopRun() {
        this.running = false;
        this.paused = false;
        if (this.timerId !== null) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        this.btnRun.disabled = false;
        this.btnPause.disabled = true;
        this.btnPause.textContent = '⏸ Pause';
    }

    togglePause() {
        if (!this.running) return;
        this.paused = !this.paused;
        this.btnPause.textContent = this.paused ? '▶ Resume' : '⏸ Pause';
        this.setStatus(this.paused ? 'Paused' : 'Running');
        if (!this.paused) this.tick(this.runToken);
    }

    tick(token) {
        if (!this.running || token !== this.runToken) return;
        if (this.paused) return;

        if (this.currentStepIndex >= this.currentSteps.length) {
            this.finishRun();
            return;
        }

        const step = this.currentSteps[this.currentStepIndex++];
        this.applyStep(step);
        this.playStepSound(step);
        this.updateStats();
        this.render(step);

        this.timerId = setTimeout(() => this.tick(token), this.getStepDelayMs());
    }

    finishRun() {
        this.running = false;
        this.paused = false;
        this.timerId = null;
        this.btnRun.disabled = false;
        this.btnPause.disabled = true;
        this.btnPause.textContent = '⏸ Pause';
        this.currentIndex = null;
        this.comparisonIndex = null;
        this.sortedMask.fill(true);
        this.setStatus('Sorted');
        this.render();
    }

    applyStep(step) {
        this.currentIndex = null;
        this.comparisonIndex = null;

        switch (step.type) {
            case 'compare':
                this.comparisons += 1;
                [this.currentIndex, this.comparisonIndex] = step.indices;
                this.setStatus(step.label || 'Comparing values');
                break;
            case 'swap': {
                this.swaps += 1;
                const [a, b] = step.indices;
                [this.values[a], this.values[b]] = [this.values[b], this.values[a]];
                [this.currentIndex, this.comparisonIndex] = step.indices;
                this.setStatus(step.label || 'Swapping values');
                break;
            }
            case 'write':
                this.swaps += 1;
                this.currentIndex = step.index;
                this.values[step.index] = step.value;
                this.setStatus(step.label || 'Writing value');
                break;
            case 'markSortedIndex':
                this.sortedMask[step.index] = true;
                this.passes += 1;
                this.setStatus(step.label || 'Locking position');
                break;
            case 'markSortedRange':
                for (let i = step.from; i <= step.to; i++) this.sortedMask[i] = true;
                this.passes += 1;
                this.setStatus(step.label || 'Range sorted');
                break;
            case 'pass':
                this.passes += 1;
                this.setStatus(step.label || 'Pass complete');
                break;
            default:
                this.setStatus(step.label || 'Sorting');
                break;
        }
    }

    setStatus(text, mode = '') {
        this.runStatusEl.textContent = text;
        this.runStatusEl.className = 'run-status';
        if (mode) this.runStatusEl.classList.add(mode);
        else if (text === 'Paused') this.runStatusEl.classList.add('paused');
        else if (text === 'Sorted') this.runStatusEl.classList.add('done');
        else if (this.running) this.runStatusEl.classList.add('running');
    }

    render(step = null) {
        this.renderer.render(this.values, {
            algorithmName: SortingAlgorithms.nameFor(this.algSelect.value),
            sortedMask: this.sortedMask,
            currentIndex: this.currentIndex,
            comparisonIndex: this.comparisonIndex,
            stepType: step?.type ?? null,
        });
    }

    playStepSound(step) {
        const stepDelayMs = this.getStepDelayMs();
        const maxValue = Math.max(...this.values);
        const currentValue = this.currentIndex != null ? this.values[this.currentIndex] : null;
        const comparisonValue = this.comparisonIndex != null ? this.values[this.comparisonIndex] : null;

        if (currentValue != null) {
            this.soundPlayer.playHeight(currentValue, 1, maxValue, { stepDelayMs }).catch(() => {});
        }

        const canPlayComparisonTone = stepDelayMs >= 7;
        if (canPlayComparisonTone && comparisonValue != null && this.comparisonIndex !== this.currentIndex) {
            const compareDelayMs = Math.max(0, Math.min(8, Math.round(stepDelayMs * 0.25)));
            window.setTimeout(() => {
                this.soundPlayer.playHeight(comparisonValue, 1, maxValue, { stepDelayMs }).catch(() => {});
            }, compareDelayMs);
        }
    }

    saveSettings() {
        try {
            const payload = {
                size: Number(this.sizeSlider.value),
                pattern: this.patternSelect.value,
                algorithm: this.algSelect.value,
                speed: Number(this.speedSlider.value),
            };
            window.sessionStorage.setItem(this.settingsStorageKey, JSON.stringify(payload));
            this.setStatus('Settings saved for this session');
        } catch {
            this.setStatus('Unable to save settings in this browser');
        }
    }

    loadSettings() {
        try {
            const raw = window.sessionStorage.getItem(this.settingsStorageKey);
            if (!raw) return;

            const saved = JSON.parse(raw);

            if (Number.isFinite(saved.size)) {
                const min = Number(this.sizeSlider.min) || 1;
                const max = Number(this.sizeSlider.max) || 999;
                this.sizeSlider.value = String(Math.min(max, Math.max(min, Math.round(saved.size))));
                this.sizeVal.textContent = this.sizeSlider.value;
            }

            if (
                typeof saved.pattern === 'string'
                && [...this.patternSelect.options].some(option => option.value === saved.pattern)
            ) {
                this.patternSelect.value = saved.pattern;
            }

            if (
                typeof saved.algorithm === 'string'
                && [...this.algSelect.options].some(option => option.value === saved.algorithm)
            ) {
                this.algSelect.value = saved.algorithm;
            }

            if (Number.isFinite(saved.speed)) {
                const min = Number(this.speedSlider.min) || 1;
                const max = Number(this.speedSlider.max) || 999;
                this.speedSlider.value = String(Math.min(max, Math.max(min, Math.round(saved.speed))));
                this.speedVal.textContent = this.speedSlider.value;
            }
        } catch {
            // Ignore malformed or inaccessible session storage.
        }
    }
}
