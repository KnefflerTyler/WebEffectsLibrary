import { explodeDynamite } from '../helpers/DynamiteExplosionHelper.js';
import { MATERIAL, Pixel } from '../Pixel.js';

const FUSE_TICKS = 60;

export class FusePixel extends Pixel {
  constructor() {
    super({
      id: MATERIAL.FUSE,
      name: 'fuse',
      color: [112, 83, 48],
      weight: 54,
      swapBuffer: 8,
      displaceable: true,
      burnLifeMin: FUSE_TICKS,
      burnLifeMax: FUSE_TICKS,
      burns: true,
      waterproof: false,
      reactsWhileStatic: true,
      igniteTemperature: 170,
      heatOutput: 120,
      acceptsDisplacementFrom: new Set([
        MATERIAL.WATER,
        MATERIAL.FIRE,
        MATERIAL.SMOKE,
        MATERIAL.STEAM,
        MATERIAL.ASH,
      ]),
    });
  }

  getInitialData(value = 0) {
    return value;
  }

  renderColor(tone, fuse) {
    if (fuse > 0) {
      const flash = fuse < 12 || fuse % 8 < 3;
      return flash ? [255, 173, 42] : [154, 89, 34];
    }

    const fiber = tone % 11 < 4 ? 18 : 0;
    return [this.color[0] + fiber, this.color[1] + fiber, this.color[2] + fiber];
  }

  update(world, i, x, y, isStatic = false) {
    let fuse = world.data[i];

    if (fuse === 0 && this.shouldIgnite(world, i, x, y)) {
      fuse = FUSE_TICKS;
      world.data[i] = fuse;
      world.temperature[i] = Math.max(world.temperature[i], this.igniteTemperature);
      world.markRenderDirty(i);
    }

    if (fuse > 0) {
      if (fuse > 10 && world.hasNeighborWhere(x, y, (pixel) => pixel.extinguishPower > 0)) {
        world.data[i] = 0;
        world.temperature[i] = this.temperature;
        world.emitIntoNeighbor(x, y, MATERIAL.STEAM, 12, 0.35);
        world.markRenderDirty(i);
        return;
      }

      world.data[i] = fuse - 1;
      if (world.data[i] === 0) {
        this.lightConnectedFuses(world, i, x, y);
        const detonated = this.detonatePayloads(world, i, x, y);
        world.setCell(i, detonated ? MATERIAL.FIRE : MATERIAL.SMOKE, detonated ? 22 : 12, {
          force: true,
          flags: 0,
          temperature: detonated ? 900 : 460,
        });
        world.touched[i] = world.tick;
        return;
      }

      if (world.data[i] < 16 && world.data[i] % 4 === 0) {
        world.emitIntoNeighbor(x, y, MATERIAL.SMOKE, 10, 0.42);
      }
      world.keepActive(i);
      return;
    }

    if (isStatic || world.hasNoGravity(i)) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (world.tryDisplaceInto(i, x, y + 1, 1)) return;
    if (Math.random() < 0.16) world.tryDisplaceInto(i, x + dir, y + 1, 1);
  }

  shouldIgnite(world, i, x, y) {
    return world.temperature[i] >= this.igniteTemperature
      || world.hasNeighborWhereAcrossLayers(x, y, (pixel) => (
        pixel.id !== MATERIAL.FUSE && (pixel.burns || pixel.heatOutput >= 120)
      ));
  }

  lightConnectedFuses(world, source, x, y) {
    const sourceLayer = world.activeLayerName;
    const layers = sourceLayer === 'backdrop'
      ? ['backdrop']
      : [sourceLayer, world.otherLayerName(sourceLayer)];

    for (const layer of layers) {
      world.withLayer(layer, () => {
        for (let yy = -1; yy <= 1; yy++) {
          for (let xx = -1; xx <= 1; xx++) {
            const nx = x + xx;
            const ny = y + yy;
            if (!world.inBounds(nx, ny)) continue;
            const index = world.index(nx, ny);
            if (layer === sourceLayer && index === source) continue;
            if (world.cells[index] !== MATERIAL.FUSE || world.data[index] > 0) continue;
            world.data[index] = FUSE_TICKS;
            world.temperature[index] = Math.max(world.temperature[index], this.igniteTemperature);
            world.touched[index] = world.tick;
            world.keepActive(index);
            world.markRenderDirty(index);
          }
        }
      });
    }
  }

  detonatePayloads(world, source, x, y) {
    const sourceLayer = world.activeLayerName;
    const layers = sourceLayer === 'backdrop'
      ? ['backdrop']
      : [sourceLayer, world.otherLayerName(sourceLayer)];
    let detonated = false;

    for (const layer of layers) {
      world.withLayer(layer, () => {
        for (let yy = -1; yy <= 1; yy++) {
          for (let xx = -1; xx <= 1; xx++) {
            if (xx === 0 && yy === 0 && layer === sourceLayer) continue;
            const nx = x + xx;
            const ny = y + yy;
            if (!world.inBounds(nx, ny)) continue;
            const index = world.index(nx, ny);
            if (world.cells[index] !== MATERIAL.DYNAMITE) continue;
            explodeDynamite(world, index, nx, ny);
            detonated = true;
          }
        }
      });
    }

    world.withLayer(sourceLayer, () => {
      if (world.cells[source] === MATERIAL.FUSE) world.markRenderDirty(source);
    });
    return detonated;
  }
}
