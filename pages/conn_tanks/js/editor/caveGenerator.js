export function generateCave(options = {}) {
  const cols = clampInteger(options.cols, 12, 96, 48);
  const rows = clampInteger(options.rows, 8, 64, 27);
  const fill = clamp(Number(options.fill ?? 0.45), 0.25, 0.7);
  const iterations = clampInteger(options.iterations, 1, 10, 5);
  const seed = normalizeSeed(options.seed ?? Date.now());
  const random = createRandom(seed);
  let solid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => (
      row === 0 || row === rows - 1 || col === 0 || col === cols - 1 || random() < fill
    ))
  );

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    solid = solid.map((line, row) => line.map((value, col) => {
      let neighbors = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (!offsetX && !offsetY) continue;
          const y = row + offsetY;
          const x = col + offsetX;
          neighbors += y < 0 || y >= rows || x < 0 || x >= cols || solid[y][x] ? 1 : 0;
        }
      }
      return neighbors >= 5 ? true : neighbors <= 3 ? false : value;
    }));
  }

  keepLargestOpenRegion(solid);
  enforceSolidBorder(solid);
  const cells = solid.map(line => line.map(value => value ? '1' : '0').join(''));

  return {
    cols,
    rows,
    seed,
    fill,
    iterations,
    cells,
    mesh: buildColliderMesh(solid),
    spawnPoints: findSpawnPoints(solid, 4)
  };
}

export function buildColliderMesh(source) {
  const solid = Array.isArray(source?.[0])
    ? source
    : (source ?? []).map(line => [...line].map(value => value === '1'));
  const rows = solid.length;
  const cols = solid[0]?.length ?? 0;
  const used = Array.from({ length: rows }, () => Array(cols).fill(false));
  const mesh = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!solid[row][col] || used[row][col]) continue;
      let width = 1;
      while (col + width < cols && solid[row][col + width] && !used[row][col + width]) width += 1;
      let height = 1;
      while (row + height < rows) {
        const canExtend = Array.from({ length: width }, (_, offset) => col + offset)
          .every(x => solid[row + height][x] && !used[row + height][x]);
        if (!canExtend) break;
        height += 1;
      }
      for (let y = row; y < row + height; y += 1) {
        for (let x = col; x < col + width; x += 1) used[y][x] = true;
      }
      mesh.push({
        start: { x: col / cols, y: row / rows },
        end: { x: (col + width) / cols, y: (row + height) / rows }
      });
    }
  }
  return mesh;
}

export function createCaveTextureCanvas(data, tileSize = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = data.cols * tileSize;
  canvas.height = data.rows * tileSize;
  const context = canvas.getContext('2d');
  const texture = data.texture ?? {};
  const floorColor = texture.floorColor ?? '#152219';
  const wallColor = texture.wallColor ?? '#344638';
  const edgeColor = texture.edgeColor ?? '#6f8a72';
  const random = createRandom(normalizeSeed(data.seed) ^ 0x9e3779b9);

  context.fillStyle = floorColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < data.rows; row += 1) {
    for (let col = 0; col < data.cols; col += 1) {
      const x = col * tileSize;
      const y = row * tileSize;
      if (data.cells[row]?.[col] === '1') {
        context.fillStyle = shadeColor(wallColor, (random() - 0.5) * 14);
        context.fillRect(x, y, tileSize, tileSize);
        context.strokeStyle = edgeColor;
        context.globalAlpha = 0.4;
        if (data.cells[row - 1]?.[col] !== '1') strokeEdge(context, x, y, x + tileSize, y);
        if (data.cells[row + 1]?.[col] !== '1') strokeEdge(context, x, y + tileSize, x + tileSize, y + tileSize);
        if (data.cells[row]?.[col - 1] !== '1') strokeEdge(context, x, y, x, y + tileSize);
        if (data.cells[row]?.[col + 1] !== '1') strokeEdge(context, x + tileSize, y, x + tileSize, y + tileSize);
        context.globalAlpha = 1;
      } else if (random() < 0.22) {
        context.fillStyle = `rgba(150, 190, 155, ${0.03 + random() * 0.05})`;
        const size = 1 + Math.floor(random() * 2);
        context.fillRect(x + Math.floor(random() * tileSize), y + Math.floor(random() * tileSize), size, size);
      }
    }
  }
  return canvas;
}

function keepLargestOpenRegion(solid) {
  const rows = solid.length;
  const cols = solid[0]?.length ?? 0;
  const visited = new Set();
  let largest = [];
  const key = (row, col) => row * cols + col;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (solid[row][col] || visited.has(key(row, col))) continue;
      const region = [];
      const queue = [[row, col]];
      visited.add(key(row, col));
      for (let index = 0; index < queue.length; index += 1) {
        const [y, x] = queue[index];
        region.push([y, x]);
        for (const [offsetY, offsetX] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nextY = y + offsetY;
          const nextX = x + offsetX;
          const nextKey = key(nextY, nextX);
          if (nextY < 0 || nextY >= rows || nextX < 0 || nextX >= cols
            || solid[nextY][nextX] || visited.has(nextKey)) continue;
          visited.add(nextKey);
          queue.push([nextY, nextX]);
        }
      }
      if (region.length > largest.length) largest = region;
    }
  }

  const keep = new Set(largest.map(([row, col]) => key(row, col)));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) solid[row][col] = !keep.has(key(row, col));
  }
}

function enforceSolidBorder(solid) {
  const rows = solid.length;
  const cols = solid[0]?.length ?? 0;
  for (let col = 0; col < cols; col += 1) solid[0][col] = solid[rows - 1][col] = true;
  for (let row = 0; row < rows; row += 1) solid[row][0] = solid[row][cols - 1] = true;
}

function findSpawnPoints(solid, count) {
  const rows = solid.length;
  const cols = solid[0]?.length ?? 0;
  const open = [];
  for (let row = 1; row < rows - 1; row += 1) {
    for (let col = 1; col < cols - 1; col += 1) {
      if (!solid[row][col]) open.push({ x: (col + 0.5) / cols, y: (row + 0.5) / rows });
    }
  }
  if (!open.length) return [];
  const selected = [open[Math.floor(open.length / 2)]];
  while (selected.length < count && selected.length < open.length) {
    let best = null;
    let bestDistance = -1;
    for (const point of open) {
      const distance = Math.min(...selected.map(other => Math.hypot(point.x - other.x, point.y - other.y)));
      if (distance > bestDistance) { best = point; bestDistance = distance; }
    }
    selected.push(best);
  }
  return selected;
}

function strokeEdge(context, startX, startY, endX, endY) {
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
}

function shadeColor(hex, amount) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '344638';
  const channel = offset => Math.round(clamp(parseInt(value.slice(offset, offset + 2), 16) + amount, 0, 255));
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}

function createRandom(seed) {
  let state = normalizeSeed(seed) || 1;
  return () => {
    state |= 0;
    state = state + 0x6d2b79f5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function normalizeSeed(seed) {
  if (Number.isFinite(Number(seed))) return Number(seed) >>> 0;
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
