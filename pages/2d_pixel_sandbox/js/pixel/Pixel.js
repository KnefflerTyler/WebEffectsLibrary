export const MATERIAL = Object.freeze({
  SPACE: 0,
  AIR: 14,
  WATER: 1,
  WOOD: 2,
  DIRT: 3,
  FIRE: 4,
  SMOKE: 5,
  STEAM: 6,
  WET_WOOD: 7,
  MUD: 8,
  ASH: 9,
  SEED: 10,
  LEAF: 11,
  ROOT: 12,
  OXYGEN: 13,
  ATMOSPHERE: 14,
  NITROGEN: 15,
});

export class Pixel {
  constructor({
    id,
    name,
    color,
    weight = 0,
    buoyancy = 0,
    swapBuffer = 1,
    displaceable = false,
    flammability = 0,
    burns = false,
    gas = false,
    gasSpread = 0,
    oxygen = 0,
    extinguishPower = 0,
    scorchable = false,
    acceptsDisplacementFrom = null,
    wetTo = null,
    mixesWithWaterTo = null,
    scorchTo = MATERIAL.SPACE,
    plantMoisture = 0,
    plantMoistureDrain = 0,
    plantConsumesTo = null,
    plantGrowThrough = false,
    rootGrowThrough = false,
  }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.weight = weight;
    this.buoyancy = buoyancy;
    this.density = weight - buoyancy;
    this.swapBuffer = swapBuffer;
    this.displaceable = displaceable;
    this.flammability = flammability;
    this.burns = burns;
    this.gas = gas;
    this.gasSpread = gasSpread;
    this.oxygen = oxygen;
    this.extinguishPower = extinguishPower;
    this.scorchable = scorchable;
    this.acceptsDisplacementFrom = acceptsDisplacementFrom;
    this.wetTo = wetTo;
    this.mixesWithWaterTo = mixesWithWaterTo;
    this.scorchTo = scorchTo;
    this.plantMoisture = plantMoisture;
    this.plantMoistureDrain = plantMoistureDrain;
    this.plantConsumesTo = plantConsumesTo;
    this.plantGrowThrough = plantGrowThrough;
    this.rootGrowThrough = rootGrowThrough;
  }

  canBeDisplacedBy(sourcePixel) {
    return this.displaceable
      && (this.acceptsDisplacementFrom === null || this.acceptsDisplacementFrom.has(sourcePixel.id));
  }

  getInitialData(value = 0) {
    return value;
  }

  update() {}

  renderColor(tone) {
    if (this.id === MATERIAL.SPACE) return this.color;
    const wobble = (tone % 23) - 11;
    return [
      this.color[0] + wobble,
      this.color[1] + wobble,
      this.color[2] + wobble,
    ];
  }
}
