import { CampfireObject } from './CampfireObject.js';
import { FishingRodObject } from './FishingRodObject.js';
import { CloudObject } from './sky/CloudObject.js';
import { MoonObject } from './sky/MoonObject.js';
import { StarObject } from './sky/StarObject.js';
import { SunObject } from './sky/SunObject.js';
import { TentObject } from './TentObject.js';
import { TreeObject } from './TreeObject.js';

export const PIXEL_OBJECTS = Object.freeze({
  campfire: CampfireObject,
  fishingRod: FishingRodObject,
  tent: TentObject,
  cloud: CloudObject,
  moon: MoonObject,
  star: StarObject,
  sun: SunObject,
  tree: TreeObject,
});

export function loadPixelObjects(world, references = []) {
  if (!Array.isArray(references)) throw new Error('Save objects must be an array.');

  for (const reference of references) {
    const type = reference?.type;
    const ObjectType = PIXEL_OBJECTS[type];
    if (!ObjectType) throw new Error(`Unknown pixel object "${type}".`);
    world.addObject(new ObjectType(reference.options ?? {}));
  }
}
