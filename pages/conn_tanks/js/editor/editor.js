const textarea = document.getElementById('level-json');
const status = document.getElementById('editor-status');
const summaryName = document.getElementById('summary-name');
const summarySpawns = document.getElementById('summary-spawns');
const summaryObjects = document.getElementById('summary-objects');
const spawnList = document.getElementById('spawn-list');
const objectList = document.getElementById('object-list');

const starterLevel = {
  id: 'new-level',
  name: 'New Level',
  spawns: [],
  objects: []
};

function setLevel(level) {
  textarea.value = JSON.stringify(level, null, 2);
  updateSummary();
}

function getLevel() {
  return JSON.parse(textarea.value || '{}');
}

function setStatus(message) {
  status.textContent = message;
}

function updateSummary() {
  try {
    const level = getLevel();
    const spawns = Array.isArray(level.spawns) ? level.spawns : [];
    const objects = Array.isArray(level.objects) ? level.objects : [];
    summaryName.textContent = level.name || level.id || '-';
    summarySpawns.textContent = String(spawns.length);
    summaryObjects.textContent = String(objects.length);
    spawnList.replaceChildren(...spawns.map((spawn, index) => {
      const item = document.createElement('li');
      item.textContent = `${spawn.id || `spawn-${index + 1}`} (${spawn.x ?? 0}, ${spawn.y ?? 0})`;
      return item;
    }));
    objectList.replaceChildren(...objects.map((object, index) => {
      const item = document.createElement('li');
      item.textContent = `${object.id || `object-${index + 1}`} [${object.type || 'unknown'}]`;
      return item;
    }));
    setStatus('Ready');
  } catch (error) {
    summaryName.textContent = '-';
    summarySpawns.textContent = '0';
    summaryObjects.textContent = '0';
    spawnList.replaceChildren();
    objectList.replaceChildren();
    setStatus(error.message);
  }
}

async function loadDefault() {
  const response = await fetch('../assets/data/level/default.level.json');
  if (!response.ok) throw new Error('Unable to load default level');
  setLevel(await response.json());
  setStatus('Loaded default level');
}

document.getElementById('load-default').addEventListener('click', () => {
  loadDefault().catch(error => setStatus(error.message));
});

document.getElementById('import-level').addEventListener('change', event => {
  const [file] = event.target.files;
  if (!file) return;
  file.text()
    .then(text => setLevel(JSON.parse(text)))
    .then(() => setStatus(`Imported ${file.name}`))
    .catch(error => setStatus(error.message));
});

document.getElementById('add-spawn').addEventListener('click', () => {
  const level = getLevel();
  level.spawns = Array.isArray(level.spawns) ? level.spawns : [];
  level.spawns.push({
    id: `spawn-${level.spawns.length + 1}`,
    x: 0.5,
    y: 0.5,
    rotation: 0
  });
  setLevel(level);
});

document.getElementById('add-sprite').addEventListener('click', () => {
  const level = getLevel();
  level.objects = Array.isArray(level.objects) ? level.objects : [];
  level.objects.push({
    type: 'sprite',
    id: `sprite-${level.objects.length + 1}`,
    name: 'Sprite',
    x: 0.5,
    y: 0.5,
    width: 48,
    height: 48,
    image: '../../images/slime_idle1.png',
    sheetCols: 2,
    sheetRows: 7
  });
  setLevel(level);
});

document.getElementById('format-json').addEventListener('click', () => {
  setLevel(getLevel());
});

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

textarea.addEventListener('input', updateSummary);
setLevel(starterLevel);