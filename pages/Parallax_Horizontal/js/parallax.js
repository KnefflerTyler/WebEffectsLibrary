const DEFAULT_IMG_1 = 'assets/images/bg1.svg';
const DEFAULT_IMG_2 = 'assets/images/bg2.svg';

const scene         = document.querySelector('.parallax-scene');
const layerCards    = document.getElementById('layerCards');
const settingsBtn   = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const addLayerBtn   = document.getElementById('addLayerBtn');

// ── Layer state array ────────────────────────────────────────
const layers = [
  { el: document.getElementById('layer1'), preview: document.getElementById('preview1'), speed: 0.50, offset: 0, blobUrl: null, defaultUrl: DEFAULT_IMG_1 },
  { el: document.getElementById('layer2'), preview: document.getElementById('preview2'), speed: 1.20, offset: 0, blobUrl: null, defaultUrl: DEFAULT_IMG_2 },
];

// ── Helpers ──────────────────────────────────────────────────
function applyLayer(layer, url) {
  layer.el.style.backgroundImage      = `url("${url}")`;
  layer.preview.style.backgroundImage = `url("${url}")`;
}

function revokeBlobIfNeeded(url) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

// ── Init ─────────────────────────────────────────────────────
applyLayer(layers[0], DEFAULT_IMG_1);
applyLayer(layers[1], DEFAULT_IMG_2);

// ── RAF animation loop ───────────────────────────────────────
function animate() {
  for (const layer of layers) {
    layer.offset += layer.speed;
    layer.el.style.backgroundPositionX = `-${layer.offset.toFixed(2)}px`;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ── Settings panel toggle ────────────────────────────────────
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = settingsPanel.classList.toggle('open');
  settingsBtn.classList.toggle('active', isOpen);
});

document.addEventListener('click', (e) => {
  if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
    settingsPanel.classList.remove('open');
    settingsBtn.classList.remove('active');
  }
});

// ── Wire static layer controls ───────────────────────────────
function wireStaticLayer(index, speedId, speedValId, fileInputId, resetId) {
  const layer = layers[index];

  document.getElementById(speedId).addEventListener('input', (e) => {
    layer.speed = parseFloat(e.target.value);
    document.getElementById(speedValId).textContent = layer.speed.toFixed(2) + ' px/f';
  });

  document.getElementById(fileInputId).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    revokeBlobIfNeeded(layer.blobUrl);
    layer.blobUrl = URL.createObjectURL(file);
    applyLayer(layer, layer.blobUrl);
  });

  document.getElementById(resetId).addEventListener('click', () => {
    revokeBlobIfNeeded(layer.blobUrl);
    layer.blobUrl = null;
    applyLayer(layer, layer.defaultUrl);
    document.getElementById(fileInputId).value = '';
  });
}

wireStaticLayer(0, 'speed1', 'speedVal1', 'fileInput1', 'reset1');
wireStaticLayer(1, 'speed2', 'speedVal2', 'fileInput2', 'reset2');

// ── Dynamic layer creation ────────────────────────────────────
let nextLayerNum = 3;

function createDynamicLayerCard(layer, num) {
  const uid  = `dyn${num}`;
  const card = document.createElement('div');
  card.className = 'layer-card';

  card.innerHTML = `
    <div class="layer-card-title">
      <span>Layer ${num} — Custom</span>
      <button class="remove-layer-btn" title="Remove layer">✕</button>
    </div>
    <div class="layer-preview" id="preview_${uid}"></div>
    <div class="speed-row">
      <span class="speed-label">Speed</span>
      <input type="range" id="speed_${uid}" min="0" max="3" step="0.05" value="0.5" aria-label="Layer ${num} speed">
      <span class="speed-value" id="speedVal_${uid}">0.50 px/f</span>
    </div>
    <div class="upload-wrapper">
      <label class="upload-label" for="fileInput_${uid}">↑ Upload Image</label>
      <input type="file" class="upload-input" id="fileInput_${uid}" accept="image/*">
    </div>
  `;

  layer.preview = card.querySelector(`#preview_${uid}`);

  card.querySelector(`#speed_${uid}`).addEventListener('input', (e) => {
    layer.speed = parseFloat(e.target.value);
    card.querySelector(`#speedVal_${uid}`).textContent = layer.speed.toFixed(2) + ' px/f';
  });

  card.querySelector(`#fileInput_${uid}`).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    revokeBlobIfNeeded(layer.blobUrl);
    layer.blobUrl = URL.createObjectURL(file);
    applyLayer(layer, layer.blobUrl);
  });

  card.querySelector('.remove-layer-btn').addEventListener('click', () => {
    revokeBlobIfNeeded(layer.blobUrl);
    scene.removeChild(layer.el);
    card.remove();
    layers.splice(layers.indexOf(layer), 1);
  });

  return card;
}

addLayerBtn.addEventListener('click', () => {
  const el = document.createElement('div');
  el.className = 'parallax-layer';
  scene.appendChild(el);

  const layer = { el, preview: null, speed: 0.50, offset: 0, blobUrl: null, defaultUrl: null };
  layers.push(layer);

  const card = createDynamicLayerCard(layer, nextLayerNum++);
  layerCards.appendChild(card);
});
