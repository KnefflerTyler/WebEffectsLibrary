import { CELL_FLAGS, MATERIAL, MATERIAL_BY_NAME, PixelWorld } from './PixelWorld.js';
import { PixelRenderer } from './PixelRenderer.js';

const WORLD_WIDTH = 660;
const WORLD_HEIGHT = 408;
const DEFAULT_SAVE_URL = 'assets/save/default-simulation.json';

const canvas = document.getElementById('world');
const brushInput = document.getElementById('brush-size');
const brushStaticInput = document.getElementById('brush-static');
const brushNoGravityInput = document.getElementById('brush-no-gravity');
const speedInput = document.getElementById('sim-speed');
const brushValue = document.getElementById('brush-value');
const speedValue = document.getElementById('speed-value');
const pauseBtn = document.getElementById('pause');
const stepBtn = document.getElementById('step');
const resetBtn = document.getElementById('reset');
const clearBtn = document.getElementById('clear');
const pixelCount = document.getElementById('pixel-count');
const fireCount = document.getElementById('fire-count');
const waterCount = document.getElementById('water-count');
const materialButtons = [...document.querySelectorAll('.material')];

const world = new PixelWorld(WORLD_WIDTH, WORLD_HEIGHT);
const renderer = new PixelRenderer(canvas, world);

let material = MATERIAL.WATER;
let brushSize = Number(brushInput.value);
let simSpeed = Number(speedInput.value);
let paused = false;
let drawing = false;
let drawPoint = null;
let strokeRadius = 0;
let frame = 0;

function canvasToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((clientX - rect.left) / rect.width * world.width),
    y: Math.floor((clientY - rect.top) / rect.height * world.height),
  };
}

function updateStats(stats) {
  pixelCount.textContent = stats.pixels.toLocaleString();
  fireCount.textContent = stats.fires.toLocaleString();
  waterCount.textContent = stats.waters.toLocaleString();
}

function render(forceStats = false) {
  const stats = renderer.render();
  if (forceStats || frame % 8 === 0) updateStats(stats);
}

function paintAt(clientX, clientY, radius = brushSize) {
  const point = canvasToWorld(clientX, clientY);
  world.paintCircle(point.x, point.y, Math.round(radius), material, getBrushFlags());
  render(true);
}

function paintCurrentStroke() {
  if (!drawPoint) return;
  paintAt(drawPoint.clientX, drawPoint.clientY, Math.min(strokeRadius, brushSize));
}

function runSteps(count) {
  for (let i = 0; i < count; i++) world.step();
}

function getBrushFlags() {
  let flags = 0;
  if (brushStaticInput.checked) flags |= CELL_FLAGS.STATIC;
  if (brushNoGravityInput.checked) flags |= CELL_FLAGS.NO_GRAVITY;
  return flags;
}

async function loadDefaultWorld() {
  try {
    const response = await fetch(DEFAULT_SAVE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    world.loadSave(await response.json());
  } catch (error) {
    console.warn('Default pixel sandbox save failed to load; using generated seed.', error);
    world.seed();
  }
}

materialButtons.forEach((button) => {
  button.addEventListener('click', () => {
    material = MATERIAL_BY_NAME[button.dataset.material];
    materialButtons.forEach((item) => item.classList.toggle('active', item === button));
  });
});

brushInput.addEventListener('input', () => {
  brushSize = Number(brushInput.value);
  strokeRadius = Math.min(strokeRadius, brushSize);
  brushValue.textContent = brushSize;
});

speedInput.addEventListener('input', () => {
  simSpeed = Number(speedInput.value);
  speedValue.textContent = simSpeed;
});

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
});

stepBtn.addEventListener('click', () => {
  runSteps(1);
  render(true);
});

resetBtn.addEventListener('click', () => {
  loadDefaultWorld().then(() => render(true));
});

clearBtn.addEventListener('click', () => {
  world.clear();
  render(true);
});

canvas.addEventListener('pointerdown', (event) => {
  drawing = true;
  drawPoint = { clientX: event.clientX, clientY: event.clientY };
  strokeRadius = 0;
  canvas.setPointerCapture(event.pointerId);
  paintCurrentStroke();
});

canvas.addEventListener('pointermove', (event) => {
  if (!drawing) return;
  drawPoint = { clientX: event.clientX, clientY: event.clientY };
  paintCurrentStroke();
});

canvas.addEventListener('pointerup', () => {
  drawing = false;
  drawPoint = null;
});

canvas.addEventListener('pointercancel', () => {
  drawing = false;
  drawPoint = null;
});

function loop() {
  frame++;
  if (drawing) {
    strokeRadius = Math.min(brushSize, strokeRadius + 0.55);
    paintCurrentStroke();
  }
  if (!paused) runSteps(simSpeed);
  render();
  requestAnimationFrame(loop);
}

await loadDefaultWorld();
render(true);
requestAnimationFrame(loop);
