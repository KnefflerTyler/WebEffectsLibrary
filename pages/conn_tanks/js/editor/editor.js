const textarea = document.getElementById('level-json');
const status = document.getElementById('editor-status');
const summaryName = document.getElementById('summary-name');
const summarySpawns = document.getElementById('summary-spawns');
const summaryObjects = document.getElementById('summary-objects');
const summaryColliders = document.getElementById('summary-colliders');
const spawnList = document.getElementById('spawn-list');
const objectList = document.getElementById('object-list');
const canvas = document.getElementById('level-canvas');
const context = canvas.getContext('2d');
const borderColor = document.getElementById('border-color');
const fillColor = document.getElementById('fill-color');
const borderAlpha = document.getElementById('border-alpha');
const fillAlpha = document.getElementById('fill-alpha');
const borderAlphaValue = document.getElementById('border-alpha-value');
const fillAlphaValue = document.getElementById('fill-alpha-value');
const deleteButton = document.getElementById('delete-collider');

const starterLevel = {
  id: 'new-level',
  name: 'New Level',
  spawns: [],
  objects: []
};

let activeTool = 'select';
let selectedId = null;
let draft = null;

function setLevel(level, { clearSelection = false } = {}) {
  if (clearSelection) selectedId = null;
  textarea.value = JSON.stringify(level, null, 2);
  updateEditor();
}

function getLevel() {
  return JSON.parse(textarea.value || '{}');
}

function getObjects(level = getLevel()) {
  return Array.isArray(level.objects) ? level.objects : [];
}

function getSelected(level = getLevel()) {
  return getObjects(level).find(object => object.type === 'collider' && object.id === selectedId) ?? null;
}

function setStatus(message) {
  status.textContent = message;
}

function updateEditor() {
  updateSummary();
  updateStyleControls();
  drawLevel();
}

function updateSummary() {
  try {
    const level = getLevel();
    const spawns = Array.isArray(level.spawns) ? level.spawns : [];
    const objects = getObjects(level);
    const colliders = objects.filter(object => object.type === 'collider');
    if (selectedId && !colliders.some(collider => collider.id === selectedId)) selectedId = null;
    summaryName.textContent = level.name || level.id || '-';
    summarySpawns.textContent = String(spawns.length);
    summaryObjects.textContent = String(objects.length);
    summaryColliders.textContent = String(colliders.length);
    spawnList.replaceChildren(...spawns.map((spawn, index) => {
      const item = document.createElement('li');
      item.textContent = `${spawn.id || `spawn-${index + 1}`} (${spawn.x ?? 0}, ${spawn.y ?? 0})`;
      return item;
    }));
    objectList.replaceChildren(...objects.map((object, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'summary-object';
      button.textContent = `${object.id || `object-${index + 1}`} [${object.shape || object.type || 'unknown'}]`;
      if (object.id === selectedId) button.classList.add('selected');
      button.addEventListener('click', () => selectObject(object));
      item.append(button);
      return item;
    }));
    setStatus(activeTool === 'select' ? 'Ready' : `Drag on the level to draw a ${activeTool} collider`);
  } catch (error) {
    summaryName.textContent = '-';
    summarySpawns.textContent = '0';
    summaryObjects.textContent = '0';
    summaryColliders.textContent = '0';
    spawnList.replaceChildren();
    objectList.replaceChildren();
    setStatus(error.message);
  }
}

function selectObject(object) {
  selectedId = object?.type === 'collider' ? object.id : null;
  updateEditor();
}

function setTool(tool) {
  activeTool = tool;
  draft = null;
  for (const button of document.querySelectorAll('.tool-button')) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  updateSummary();
  drawLevel();
}

function updateStyleControls() {
  let selected = null;
  try { selected = getSelected(); } catch { /* Invalid JSON is reported in the status. */ }
  if (selected) {
    borderColor.value = selected.borderColor ?? '#69e394';
    fillColor.value = selected.fillColor ?? '#2d9e5b';
    borderAlpha.value = selected.borderAlpha ?? 1;
    fillAlpha.value = selected.fillAlpha ?? 0.25;
  }
  borderAlphaValue.value = `${Math.round(Number(borderAlpha.value) * 100)}%`;
  fillAlphaValue.value = `${Math.round(Number(fillAlpha.value) * 100)}%`;
  deleteButton.disabled = !selected;
  fillColor.disabled = selected?.shape === 'line';
  fillAlpha.disabled = selected?.shape === 'line';
}

function applyStylesToSelected() {
  const level = getLevel();
  const selected = getSelected(level);
  borderAlphaValue.value = `${Math.round(Number(borderAlpha.value) * 100)}%`;
  fillAlphaValue.value = `${Math.round(Number(fillAlpha.value) * 100)}%`;
  if (!selected) return;
  selected.borderColor = borderColor.value;
  selected.fillColor = fillColor.value;
  selected.borderAlpha = Number(borderAlpha.value);
  selected.fillAlpha = Number(fillAlpha.value);
  setLevel(level);
}

function drawLevel() {
  resizeCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.clearRect(0, 0, width, height);
  drawGrid(width, height);

  try {
    const level = getLevel();
    for (const object of getObjects(level)) {
      if (object.type === 'collider') drawCollider(object, object.id === selectedId);
      else if (object.type === 'sprite') drawSpritePlaceholder(object);
    }
    for (const spawn of Array.isArray(level.spawns) ? level.spawns : []) drawSpawn(spawn);
    if (draft) drawCollider(draft, true);
  } catch { /* Keep the drawing surface available while JSON is being edited. */ }
}

function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawGrid(width, height) {
  context.save();
  context.strokeStyle = 'rgba(126, 165, 132, 0.12)';
  context.lineWidth = 1;
  for (let index = 1; index < 10; index += 1) {
    const x = width * index / 10;
    const y = height * index / 10;
    context.beginPath();
    context.moveTo(x, 0); context.lineTo(x, height);
    context.moveTo(0, y); context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function drawCollider(collider, selected = false) {
  const start = toCanvasPoint(collider.start);
  const end = toCanvasPoint(collider.end);
  context.save();
  context.strokeStyle = withAlpha(collider.borderColor ?? '#69e394', collider.borderAlpha ?? 1);
  context.fillStyle = withAlpha(collider.fillColor ?? '#2d9e5b', collider.fillAlpha ?? 0.25);
  context.lineWidth = selected ? 3 : 2;
  if (selected) context.setLineDash([7, 4]);
  context.beginPath();
  if (collider.shape === 'line') {
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  } else if (collider.shape === 'ellipse') {
    context.ellipse(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      Math.abs(end.x - start.x) / 2,
      Math.abs(end.y - start.y) / 2,
      0, 0, Math.PI * 2
    );
  } else {
    context.rect(start.x, start.y, end.x - start.x, end.y - start.y);
  }
  if (collider.shape !== 'line') context.fill();
  context.stroke();
  context.restore();
}

function drawSpritePlaceholder(sprite) {
  const center = toCanvasPoint(sprite);
  context.save();
  context.strokeStyle = 'rgba(130, 178, 255, .65)';
  context.fillStyle = 'rgba(80, 120, 190, .12)';
  const width = Math.max(12, Number(sprite.width) || 48);
  const height = Math.max(12, Number(sprite.height) || 48);
  context.fillRect(center.x - width / 2, center.y - height / 2, width, height);
  context.strokeRect(center.x - width / 2, center.y - height / 2, width, height);
  context.restore();
}

function drawSpawn(spawn) {
  const point = toCanvasPoint(spawn);
  context.save();
  context.translate(point.x, point.y);
  context.rotate(Number(spawn.rotation) || 0);
  context.fillStyle = '#f4c86b';
  context.beginPath();
  context.moveTo(0, -9); context.lineTo(6, 7); context.lineTo(0, 4); context.lineTo(-6, 7);
  context.closePath();
  context.fill();
  context.restore();
}

function toCanvasPoint(point = {}) {
  return {
    x: (Number(point.x) || 0) * canvas.clientWidth,
    y: (Number(point.y) || 0) * canvas.clientHeight
  };
}

function fromPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: clamp01((event.clientX - bounds.left) / bounds.width),
    y: clamp01((event.clientY - bounds.top) / bounds.height)
  };
}

function withAlpha(hex, alpha) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff';
  const red = parseInt(value.slice(1, 3), 16);
  const green = parseInt(value.slice(3, 5), 16);
  const blue = parseInt(value.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp01(alpha)})`;
}

function hitTest(point) {
  const objects = getObjects().filter(object => object.type === 'collider');
  const threshold = 8 / Math.max(canvas.clientWidth, canvas.clientHeight);
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const collider = objects[index];
    const left = Math.min(collider.start.x, collider.end.x);
    const right = Math.max(collider.start.x, collider.end.x);
    const top = Math.min(collider.start.y, collider.end.y);
    const bottom = Math.max(collider.start.y, collider.end.y);
    if (collider.shape === 'line') {
      if (distanceToSegment(point, collider.start, collider.end) <= threshold) return collider;
    } else if (collider.shape === 'ellipse') {
      const radiusX = (right - left) / 2 || threshold;
      const radiusY = (bottom - top) / 2 || threshold;
      const x = (point.x - (left + right) / 2) / radiusX;
      const y = (point.y - (top + bottom) / 2) / radiusY;
      if (x * x + y * y <= 1) return collider;
    } else if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
      return collider;
    }
  }
  return null;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (start.x + dx * amount), point.y - (start.y + dy * amount));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

async function loadDefault() {
  const response = await fetch('../assets/data/level/default.level.json');
  if (!response.ok) throw new Error('Unable to load default level');
  setLevel(await response.json(), { clearSelection: true });
  setStatus('Loaded default level');
}

for (const button of document.querySelectorAll('.tool-button')) {
  button.addEventListener('click', () => setTool(button.dataset.tool));
}

canvas.addEventListener('pointerdown', event => {
  const point = fromPointer(event);
  if (activeTool === 'select') {
    selectObject(hitTest(point));
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  draft = {
    type: 'collider',
    shape: activeTool,
    start: point,
    end: point,
    borderColor: borderColor.value,
    fillColor: fillColor.value,
    borderAlpha: Number(borderAlpha.value),
    fillAlpha: Number(fillAlpha.value)
  };
  drawLevel();
});

canvas.addEventListener('pointermove', event => {
  if (!draft || !canvas.hasPointerCapture(event.pointerId)) return;
  draft.end = fromPointer(event);
  drawLevel();
});

canvas.addEventListener('pointerup', event => {
  if (!draft) return;
  draft.end = fromPointer(event);
  const size = Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y);
  if (size >= 0.005) {
    const level = getLevel();
    level.objects = getObjects(level);
    let count = level.objects.filter(object => object.type === 'collider').length + 1;
    while (level.objects.some(object => object.id === `collider-${count}`)) count += 1;
    draft.id = `collider-${count}`;
    draft.name = `${draft.shape[0].toUpperCase()}${draft.shape.slice(1)} Collider`;
    draft.collider = { enabled: true, isTrigger: false, layer: 'level' };
    level.objects.push(draft);
    selectedId = draft.id;
    draft = null;
    setLevel(level);
    setTool('select');
  } else {
    draft = null;
    drawLevel();
  }
});

canvas.addEventListener('pointercancel', () => {
  draft = null;
  drawLevel();
});

document.getElementById('load-default').addEventListener('click', () => {
  loadDefault().catch(error => setStatus(error.message));
});

document.getElementById('import-level').addEventListener('change', event => {
  const [file] = event.target.files;
  if (!file) return;
  file.text()
    .then(text => setLevel(JSON.parse(text), { clearSelection: true }))
    .then(() => setStatus(`Imported ${file.name}`))
    .catch(error => setStatus(error.message));
});

document.getElementById('add-spawn').addEventListener('click', () => {
  const level = getLevel();
  level.spawns = Array.isArray(level.spawns) ? level.spawns : [];
  level.spawns.push({ id: `spawn-${level.spawns.length + 1}`, x: 0.5, y: 0.5, rotation: 0 });
  setLevel(level);
});

document.getElementById('add-sprite').addEventListener('click', () => {
  const level = getLevel();
  level.objects = getObjects(level);
  level.objects.push({
    type: 'sprite', id: `sprite-${level.objects.length + 1}`, name: 'Sprite',
    x: 0.5, y: 0.5, width: 48, height: 48,
    image: '../../images/slime_idle1.png', sheetCols: 2, sheetRows: 7
  });
  setLevel(level);
});

deleteButton.addEventListener('click', () => {
  const level = getLevel();
  level.objects = getObjects(level).filter(object => object.id !== selectedId);
  selectedId = null;
  setLevel(level);
});

for (const input of [borderColor, fillColor, borderAlpha, fillAlpha]) {
  input.addEventListener('input', applyStylesToSelected);
}

document.getElementById('format-json').addEventListener('click', () => setLevel(getLevel()));

document.getElementById('export-level').addEventListener('click', () => {
  const level = getLevel();
  const blob = new Blob([JSON.stringify(level, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${level.id || 'level'}.level.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus('Exported level JSON');
});

textarea.addEventListener('input', updateEditor);
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') setTool('select');
  if ((event.key === 'Delete' || event.key === 'Backspace')
    && selectedId && document.activeElement !== textarea) deleteButton.click();
});
new ResizeObserver(drawLevel).observe(document.getElementById('level-stage'));
setLevel(starterLevel);
