import { DaySkyTerrainGenerator } from './DaySkyTerrainGenerator.js';
import { GrownTreesTerrainGenerator } from './GrownTreesTerrainGenerator.js';
import { NightSkyTerrainGenerator } from './NightSkyTerrainGenerator.js';
import { RollingGroundTerrainGenerator } from './RollingGroundTerrainGenerator.js';

export const TERRAIN_GENERATORS = Object.freeze({
  'day-sky': DaySkyTerrainGenerator,
  'grown-trees': GrownTreesTerrainGenerator,
  'night-sky': NightSkyTerrainGenerator,
  'rolling-ground': RollingGroundTerrainGenerator,
});

export function runTerrainGenerators(world, references = []) {
  if (!Array.isArray(references)) throw new Error('Save generators must be an array.');

  for (const reference of references) {
    const name = typeof reference === 'string' ? reference : reference?.name;
    const options = typeof reference === 'string' ? {} : (reference?.options ?? {});
    const generator = TERRAIN_GENERATORS[name];
    if (!generator) throw new Error(`Unknown terrain generator "${name}".`);
    generator.generate(world, options);
  }
}
