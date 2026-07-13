import { CELL_FLAGS, MATERIAL, MATERIAL_BY_NAME, PixelWorld } from './PixelWorld.js';
import { PixelRenderer } from './PixelRenderer.js';
import { PIXEL_BY_ID } from './pixel/pixelRegistry.js';
import { TentObject } from './pixel/objects/TentObject.js';
import { EditorWindowManager } from './EditorWindowManager.js';
import { StampTool } from './StampTool.js';

const WORLD_WIDTH = 330;
const WORLD_HEIGHT = 204;
const SAVE_DIRECTORY = 'assets/save';

const canvas = document.getElementById('world');
new EditorWindowManager(document.getElementById('editor-windows'));
const stampPreviewCanvas = document.getElementById('stamp-preview');
const stampControls = document.getElementById('stamp-controls');
const stampSelect = document.getElementById('stamp-select');
const brushInput = document.getElementById('brush-size');
const brushLayerInputs = [...document.querySelectorAll('.brush-layer-selection')];
const brushStaticInput = document.getElementById('brush-static');
const brushNoGravityInput = document.getElementById('brush-no-gravity');
const pixelInspectorToggle = document.getElementById('pixel-inspector-toggle');
const pixelInspector = document.getElementById('pixel-inspector');
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
const foregroundOpacityInput = document.getElementById('foreground-opacity');
const backgroundOpacityInput = document.getElementById('background-opacity');
const backdropOpacityInput = document.getElementById('backdrop-opacity');
const foregroundOpacityValue = document.getElementById('foreground-opacity-value');
const backgroundOpacityValue = document.getElementById('background-opacity-value');
const backdropOpacityValue = document.getElementById('backdrop-opacity-value');
const backgroundDarkeningInput = document.getElementById('background-darkening');
const backdropDarkeningInput = document.getElementById('backdrop-darkening');
const backgroundDarkeningValue = document.getElementById('background-darkening-value');
const backdropDarkeningValue = document.getElementById('backdrop-darkening-value');

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
let pixelInspectorEnabled = true;
const stampTool = new StampTool({
  world,
  previewCanvas: stampPreviewCanvas,
  select: stampSelect,
  getLayers: getBrushLayers,
  getClothColor: () => hexToRgb(clothColorInput.value),
});

function canvasToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((clientX - rect.left) / rect.width * world.width),
    y: Math.floor((clientY - rect.top) / rect.height * world.height),
  };
}

function getVisiblePixelName(x, y) {
  if (!world.inBounds(x, y)) return null;
  const index = world.index(x, y);
  const visibleLayers = ['foreground', 'background', 'backdrop'];

  for (const name of visibleLayers) {
    if (!renderer.layerVisibility[name]) continue;
    const type = world.layers[name].cells[index];
    if (type === MATERIAL.SPACE || type === MATERIAL.AIR) continue;
    return PIXEL_BY_ID[type]?.name ?? null;
  }

  for (const name of visibleLayers) {
    if (!renderer.layerVisibility[name]) continue;
    const type = world.layers[name].cells[index];
    return PIXEL_BY_ID[type]?.name ?? null;
  }

  return null;
}

function formatPixelName(name) {
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function hidePixelInspector() {
  pixelInspector.setAttribute('aria-hidden', 'true');
}

function updatePixelInspector(event) {
  if (!pixelInspectorEnabled) return;
  const point = canvasToWorld(event.clientX, event.clientY);
  const name = getVisiblePixelName(point.x, point.y);
  if (!name) {
    hidePixelInspector();
    return;
  }

  pixelInspector.textContent = formatPixelName(name);
  pixelInspector.style.left = `${Math.min(event.clientX, window.innerWidth - 170)}px`;
  pixelInspector.style.top = `${Math.min(event.clientY, window.innerHeight - 48)}px`;
  pixelInspector.setAttribute('aria-hidden', 'false');
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

function getBrushLayers() {
  return brushLayerInputs.filter((input) => input.checked).map((input) => input.value);
}

function paintAt(clientX, clientY, radius = brushSize) {
  const point = canvasToWorld(clientX, clientY);
  for (const layer of getBrushLayers()) {
    world.paintCircle(point.x, point.y, Math.round(radius), material, getBrushFlags(), getPaintOptions(), layer);
  }
  render(true);
}

function paintCurrentStroke() {
  if (!drawPoint) return;
  paintAt(drawPoint.clientX, drawPoint.clientY, Math.min(strokeRadius, brushSize));
}

function fillAt(clientX, clientY) {
  const point = canvasToWorld(clientX, clientY);
  for (const layer of getBrushLayers()) {
    world.fillConnected(point.x, point.y, material, getBrushFlags(), getPaintOptions(), layer);
  }
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
    const branchLoading = new Set(loading);
    if (branchLoading.has(templateUrl.href)) throw new Error(`Circular save template reference "${file}".`);

    branchLoading.add(templateUrl.href);
    const template = await loadJson(templateUrl.href);
    const nestedTemplates = await resolveTemplateReferences(template.templates ?? [], templateUrl, branchLoading);

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
    const stamping = paintMode === 'stamp';
    stampControls.hidden = !stamping;
    stampTool.setEnabled(stamping);
  });
});

brushLayerInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (getBrushLayers().length === 0) input.checked = true;
  });
});

clothColorInput.addEventListener('input', () => {
  if (paintMode === 'stamp' && stampSelect.value === 'object:tent') stampTool.selectAsset();
});

pixelInspectorToggle.addEventListener('click', () => {
  pixelInspectorEnabled = !pixelInspectorEnabled;
  pixelInspectorToggle.setAttribute('aria-pressed', String(pixelInspectorEnabled));
  pixelInspectorToggle.textContent = `Inspect pixel names: ${pixelInspectorEnabled ? 'On' : 'Off'}`;
  if (!pixelInspectorEnabled) hidePixelInspector();
});

layerVisibilityInputs.forEach((input) => {
  input.addEventListener('change', () => {
    renderer.setLayerVisibility(input.value, input.checked);
    render();
  });
});

function bindLayerOpacity(input, output, layer) {
  input.addEventListener('input', () => {
    output.textContent = `${input.value}%`;
    renderer.setLayerOpacity(layer, Number(input.value) / 100);
    render();
  });
}

bindLayerOpacity(foregroundOpacityInput, foregroundOpacityValue, 'foreground');
bindLayerOpacity(backgroundOpacityInput, backgroundOpacityValue, 'background');
bindLayerOpacity(backdropOpacityInput, backdropOpacityValue, 'backdrop');

function bindLayerDarkening(input, output, layer) {
  input.addEventListener('input', () => {
    output.textContent = `${input.value}%`;
    renderer.setLayerDarkening(layer, Number(input.value) / 100);
    render();
  });
}

bindLayerDarkening(backgroundDarkeningInput, backgroundDarkeningValue, 'background');
bindLayerDarkening(backdropDarkeningInput, backdropDarkeningValue, 'backdrop');

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
  if (paintMode === 'stamp') {
    stampTool.stampAt(canvasToWorld(event.clientX, event.clientY)).then((placed) => {
      if (placed) render(true);
    });
    return;
  }
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
  updatePixelInspector(event);
  if (paintMode === 'stamp') stampTool.updatePreview(canvasToWorld(event.clientX, event.clientY));
  if (!drawing) return;
  drawPoint = { clientX: event.clientX, clientY: event.clientY };
  if (paintMode === 'pencil') paintAt(event.clientX, event.clientY, 0);
  else paintCurrentStroke();
});

canvas.addEventListener('pointerleave', () => {
  hidePixelInspector();
  stampTool.hidePreview();
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
