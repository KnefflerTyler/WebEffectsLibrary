import { AirPixel } from './pixels/AirPixel.js';
import { AshPixel } from './pixels/AshPixel.js';
import { CharcoalPixel } from './pixels/CharcoalPixel.js';
import { ClothPixel } from './pixels/ClothPixel.js';
import { DirtPixel } from './pixels/DirtPixel.js';
import { FirePixel } from './pixels/FirePixel.js';
import { GrassPixel } from './pixels/GrassPixel.js';
import { LeafPixel } from './pixels/LeafPixel.js';
import { MudPixel } from './pixels/MudPixel.js';
import { NitrogenPixel } from './pixels/NitrogenPixel.js';
import { OxygenPixel } from './pixels/OxygenPixel.js';
import { PlasmaPixel } from './pixels/PlasmaPixel.js';
import { PlasticPixel } from './pixels/PlasticPixel.js';
import { MetalPixel } from './pixels/MetalPixel.js';
import { FlowerPixel } from './pixels/FlowerPixel.js';
import { RockPixel } from './pixels/RockPixel.js';
import { RootPixel } from './pixels/RootPixel.js';
import { SpacePixel } from './pixels/SpacePixel.js';
import { StarPixel } from './pixels/StarPixel.js';
import { TreeSeedPixel } from './pixels/TreeSeedPixel.js';
import { SmokePixel } from './pixels/SmokePixel.js';
import { SteamPixel } from './pixels/SteamPixel.js';
import { WaterPixel } from './pixels/WaterPixel.js';
import { WetWoodPixel } from './pixels/WetWoodPixel.js';
import { WoodPixel } from './pixels/WoodPixel.js';

export { MATERIAL } from './Pixel.js';

const PIXEL_LIST = [
  new SpacePixel(),
  new WaterPixel(),
  new WoodPixel(),
  new DirtPixel(),
  new GrassPixel(),
  new FirePixel(),
  new SmokePixel(),
  new SteamPixel(),
  new WetWoodPixel(),
  new MudPixel(),
  new AshPixel(),
  new TreeSeedPixel(),
  new LeafPixel(),
  new RootPixel(),
  new OxygenPixel(),
  new AirPixel(),
  new NitrogenPixel(),
  new CharcoalPixel(),
  new ClothPixel(),
  new PlasmaPixel(),
  new StarPixel(),
  new PlasticPixel(),
  new MetalPixel(),
  new RockPixel(),
  new FlowerPixel(),
];

export const PIXELS = Object.freeze(PIXEL_LIST);

export const PIXEL_BY_ID = Object.freeze(PIXEL_LIST.reduce((pixels, pixel) => {
  pixels[pixel.id] = pixel;
  return pixels;
}, []));

export const MATERIAL_BY_NAME = Object.freeze(PIXEL_LIST.reduce((materials, pixel) => {
  materials[pixel.name] = pixel.id;
  if (pixel.name === 'air') materials.atmosphere = pixel.id;
  return materials;
}, {}));
