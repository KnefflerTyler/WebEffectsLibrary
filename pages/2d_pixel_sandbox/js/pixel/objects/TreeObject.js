import { PlantGrowthHelper } from '../helpers/PlantGrowthHelper.js';
import { MATERIAL } from '../Pixel.js';

export class TreeObject {
  constructor({
    x,
    y,
    layer = 'foreground',
    energy = 16,
    growthInterval = 4,
    rootInterval = 8,
    maxEnergy = 255,
    maxHeight = 18,
    maxCrownRadius = 7,
    maxRootRadius = 30,
  }) {
    this.type = 'tree';
    this.x = x;
    this.y = y;
    this.layer = layer;
    this.maxEnergy = Math.max(1, maxEnergy);
    this.energy = Math.min(this.maxEnergy, Math.max(0, energy));
    this.growthInterval = Math.max(1, Math.floor(growthInterval));
    this.rootInterval = Math.max(1, Math.floor(rootInterval));
    this.maxHeight = Math.max(1, Math.floor(maxHeight));
    this.maxCrownRadius = Math.max(1, Math.floor(maxCrownRadius));
    this.maxRootRadius = Math.max(1, Math.floor(maxRootRadius));
    this.stalledUpdates = 0;
    this.placed = false;
    this.destroyed = false;
  }

  place() {
    this.placed = true;
  }

  ownsSeed(layer, x, y) {
    return !this.destroyed && this.layer === layer && this.x === x && this.y === y;
  }

  update(world) {
    if (!this.placed) this.place(world);
    if ((world.tick + world.index(this.x, this.y)) % this.growthInterval !== 0) return;
    world.withLayer(this.layer, () => this.grow(world));
  }

  grow(world) {
    if (!world.inBounds(this.x, this.y)) {
      this.destroyed = true;
      return;
    }

    const anchor = world.index(this.x, this.y);
    const anchorMaterial = world.cells[anchor];
    if (anchorMaterial !== MATERIAL.SEED && anchorMaterial !== MATERIAL.WOOD) {
      this.destroyed = true;
      return;
    }

    const rootRadius = Math.min(this.maxRootRadius, 10 + Math.floor(this.energy / 10));
    const moisture = PlantGrowthHelper.consumeMoistureNearPlant(world, this.x, this.y, rootRadius);
    this.energy = moisture > 0
      ? Math.min(this.maxEnergy, this.energy + moisture)
      : Math.max(0, this.energy - 1);

    if (anchorMaterial === MATERIAL.SEED) {
      world.data[anchor] = this.energy;
      world.markRenderDirty(anchor);
    }

    let grew = false;
    if (this.energy >= 4 && (world.tick + anchor) % this.rootInterval === 0) {
      grew = PlantGrowthHelper.tryGrowRootNetwork(world, this.x, this.y, this.energy);
    }
    if (!grew && this.energy >= 18) {
      grew = PlantGrowthHelper.tryGrowTree(world, this.x, this.y, this.energy, {
        maxHeight: this.maxHeight,
        maxCrownRadius: this.maxCrownRadius,
      });
    }

    this.stalledUpdates = grew ? 0 : this.stalledUpdates + 1;
    if (this.energy >= this.maxEnergy && this.stalledUpdates >= 32) {
      if (anchorMaterial === MATERIAL.SEED) world.setCell(anchor, MATERIAL.WOOD);
      this.destroyed = true;
    }
  }
}
