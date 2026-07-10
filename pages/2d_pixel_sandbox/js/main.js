import { CELL_FLAGS, MATERIAL, MATERIAL_BY_NAME, PixelWorld } from './PixelWorld.js';
import { PixelRenderer } from './PixelRenderer.js';
import { TentObject } from './pixel/objects/TentObject.js';

const WORLD_WIDTH = 330;
const WORLD_HEIGHT = 204;
const SAVE_DIRECTORY = 'assets/save';

const canvas = document.getElementById('world');
const toolbar = document.getElementById('toolbar');
const toolbarToggle = document.getElementById('toolbar-toggle');
const brushInput = document.getElementById('brush-size');
const brushLayerInput = document.getElementById('brush-layer');
const brushStaticInput = document.getElementById('brush-static');
const brushNoGravityInput = document.getElementById('brush-no-gravity');
const clothColorInput = document.getElementById('cloth-color');
const speedInput = document.getElementById('sim-speed');
const brushValue = document.getElementById('brush-value');
const speedValue = document.getElementById('speed-value');
const pauseBtn = document.getElementById('pause');
const stepBtn = document.getElementById('step');
const resetBtn = document.getElementById('reset');
const tentBtn = document.getElementById('tent');
const clearBtn = document.getElementById('clear');
const sceneSelect = document.getElementById('scene-select');
const pixelCount = document.getElementById('pixel-count');
const fireCount = document.getElementById('fire-count');
const waterCount = document.getElementById('water-count');
const materialButtons = [...document.querySelectorAll('.material')];
const paintModeButtons = [...document.querySelectorAll('.paint-mode')];
const layerVisibilityInputs = [...document.querySelectorAll('.layer-visibility')];

const world = new PixelWorld(WORLD_WIDTH, WORLD_HEIGHT);
const renderer = await PixelRenderer.create(canvas, world);

let material = MATERIAL.WATER;
let brushSize = Number(brushInput.value);
let simSpeed = Number(speedInput.value);
let paused = false;
let drawing = false;
let drawPoint = null;
let strokeRadius = 0;
let frame = 0;
let paintMode = 'brush';

function setToolbarOpen(open) {
  toolbar.classList.toggle('open', open);
  toolbar.setAttribute('aria-hidden', String(!open));
  toolbarToggle.setAttribute('aria-expanded', String(open));
  toolbarToggle.textContent = open ? '>' : '<';
  toolbarToggle.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
}

toolbarToggle.addEventListener('click', () => setToolbarOpen(!toolbar.classList.contains('open')));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && toolbar.classList.contains('open')) {
    setToolbarOpen(false);
    toolbarToggle.focus();
  }
});

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

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function getPaintOptions() {
  return material === MATERIAL.CLOTH ? { color: hexToRgb(clothColorInput.value) } : {};
}

function paintAt(clientX, clientY, radius = brushSize) {
  const point = canvasToWorld(clientX, clientY);
  world.paintCircle(point.x, point.y, Math.round(radius), material, getBrushFlags(), getPaintOptions(), brushLayerInput.value);
  render(true);
}

function paintCurrentStroke() {
  if (!drawPoint) return;
  paintAt(drawPoint.clientX, drawPoint.clientY, Math.min(strokeRadius, brushSize));
}

function fillAt(clientX, clientY) {
  const point = canvasToWorld(clientX, clientY);
  world.fillConnected(point.x, point.y, material, getBrushFlags(), getPaintOptions(), brushLayerInput.value);
  render(true);
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

function findSurfaceY(x) {
  for (let y = 0; y < world.height; y++) {
    const pixel = world.getPixelAtIndex(world.index(x, y));
    if (world.cells[world.index(x, y)] !== MATERIAL.SPACE && !pixel.gas) return Math.max(0, y - 1);
  }
  return world.height - 42;
}

function placeTent() {
  const x = Math.floor(world.width * 0.46);
  const y = findSurfaceY(x);
  world.addObject(new TentObject({
    x,
    y,
    clothColor: hexToRgb(clothColorInput.value),
  }));
  render(true);
}

async function loadSelectedScene() {
  const sceneUrl = `${SAVE_DIRECTORY}/${sceneSelect.value}`;
  try {
    world.loadSave(await loadSceneWithTemplates(sceneUrl));
  } catch (error) {
    console.warn(`Pixel sandbox scene "${sceneSelect.value}" failed to load; using generated seed.`, error);
    world.seed();
  }
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadSceneWithTemplates(sceneUrl) {
  const scene = await loadJson(sceneUrl);
  const baseUrl = new URL(sceneUrl, window.location.href);
  scene.templates = await resolveTemplateReferences(scene.templates ?? [], baseUrl, new Set());
  return scene;
}

async function resolveTemplateReferences(references, baseUrl, loading) {
  if (!Array.isArray(references)) throw new Error('Save templates must be an array.');

  return Promise.all(references.map(async (reference) => {
    const file = typeof reference === 'string' ? reference : (reference.file ?? reference.path ?? reference.name);
    if (!file) return reference;

    const templateUrl = new URL(file, baseUrl);
    if (loading.has(templateUrl.href)) throw new Error(`Circular save template reference "${file}".`);

    loading.add(templateUrl.href);
    const template = await loadJson(templateUrl.href);
    const nestedTemplates = await resolveTemplateReferences(template.templates ?? [], templateUrl, loading);
    loading.delete(templateUrl.href);

    const resolved = typeof reference === 'string' ? { file } : { ...reference };
    return {
      ...resolved,
      template: {
        ...template,
        templates: nestedTemplates,
      },
    };
  }));
}

materialButtons.forEach((button) => {
  button.addEventListener('click', () => {
    material = MATERIAL_BY_NAME[button.dataset.material];
    materialButtons.forEach((item) => item.classList.toggle('active', item === button));
  });
});

paintModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    paintMode = button.dataset.paintMode;
    paintModeButtons.forEach((item) => item.classList.toggle('active', item === button));
  });
});

layerVisibilityInputs.forEach((input) => {
  input.addEventListener('change', () => {
    renderer.setLayerVisibility(input.value, input.checked);
    render();
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

tentBtn.addEventListener('click', placeTent);

resetBtn.addEventListener('click', () => {
  loadSelectedScene().then(() => render(true));
});

sceneSelect.addEventListener('change', () => {
  loadSelectedScene().then(() => render(true));
});

clearBtn.addEventListener('click', () => {
  world.clear();
  render(true);
});

canvas.addEventListener('pointerdown', (event) => {
  if (toolbar.classList.contains('open')) setToolbarOpen(false);
  if (paintMode === 'bucket') {
    fillAt(event.clientX, event.clientY);
    return;
  }
  drawing = true;
  drawPoint = { clientX: event.clientX, clientY: event.clientY };
  strokeRadius = 0;
  canvas.setPointerCapture(event.pointerId);
  if (paintMode === 'pencil') paintAt(event.clientX, event.clientY, 0);
  else paintCurrentStroke();
});

canvas.addEventListener('pointermove', (event) => {
  if (!drawing) return;
  drawPoint = { clientX: event.clientX, clientY: event.clientY };
  if (paintMode === 'pencil') paintAt(event.clientX, event.clientY, 0);
  else paintCurrentStroke();
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
  if (drawing && paintMode === 'brush') {
    strokeRadius = Math.min(brushSize, strokeRadius + 0.55);
    paintCurrentStroke();
  }
  if (!paused) runSteps(simSpeed);
  render();
  requestAnimationFrame(loop);
}

await loadSelectedScene();
render(true);
requestAnimationFrame(loop);
