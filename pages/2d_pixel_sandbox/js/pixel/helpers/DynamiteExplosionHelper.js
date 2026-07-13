import { MATERIAL } from '../Pixel.js';

const BLAST_RADIUS = 10;

export function explodeDynamite(world, source, x, y, chainDepth = 0) {
  const sourceLayer = world.activeLayerName;
  const affectedLayers = sourceLayer === 'backdrop'
    ? ['backdrop']
    : [sourceLayer, world.otherLayerName(sourceLayer)];

  for (const layer of affectedLayers) {
    world.withLayer(layer, () => explodeLayer(world, x, y, sourceLayer, source, chainDepth));
  }

  world.withLayer(sourceLayer, () => {
    if (world.cells[source] === MATERIAL.DYNAMITE) {
      world.setCell(source, MATERIAL.SPACE, 0, { force: true, flags: 0 });
      world.touched[source] = world.tick;
    }
  });
}

function explodeLayer(world, cx, cy, sourceLayer, source, chainDepth) {
  const radiusSquared = BLAST_RADIUS * BLAST_RADIUS;

  for (let y = cy - BLAST_RADIUS; y <= cy + BLAST_RADIUS; y++) {
    for (let x = cx - BLAST_RADIUS; x <= cx + BLAST_RADIUS; x++) {
      if (!world.inBounds(x, y)) continue;
      const dx = x - cx;
      const dy = y - cy;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radiusSquared) continue;

      const i = world.index(x, y);
      const pixel = world.getPixelAtIndex(i);
      if (pixel.id === MATERIAL.SPACE) continue;
      if (pixel.id === MATERIAL.DYNAMITE) {
        if (world.activeLayerName === sourceLayer && i === source) continue;
        if (chainDepth < 8) explodeDynamite(world, i, x, y, chainDepth + 1);
        continue;
      }

      const pressure = 1 - Math.sqrt(distanceSquared) / BLAST_RADIUS;
      const destructionChance = Math.min(1, 0.28 + pressure - pixel.blastResistance);
      if (Math.random() >= destructionChance) {
        world.temperature[i] = Math.min(65535, world.temperature[i] + Math.round(900 * pressure));
        world.keepActive(i);
        continue;
      }

      const residueRoll = Math.random();
      const residue = pressure > 0.38 && residueRoll < 0.24
        ? MATERIAL.FIRE
        : (residueRoll < 0.5 ? MATERIAL.SMOKE : MATERIAL.SPACE);
      world.setCell(i, residue, residue === MATERIAL.FIRE ? 32 : 14, {
        force: true,
        flags: 0,
        temperature: residue === MATERIAL.FIRE ? 1100 : 500,
      });
      world.touched[i] = world.tick;
    }
  }
}
