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
  CHARCOAL: 16,
  GRASS: 17,
  CLOTH: 18,
  PLASMA: 19,
  STAR: 20,
  PLASTIC: 21,
  METAL: 22,
  ROCK: 23,
  FLOWER: 24,
  DYNAMITE: 25,
  FUSE: 26,
});

export class Pixel {
  constructor({
    id,
    name,
    color,
    usesCustomColor = false,
    weight = 0,
    buoyancy = 0,
    swapBuffer = 1,
    displaceable = false,
    flammability = 0,
    burnLifeMin = 18,
    burnLifeMax = 42,
    burnDurationScale = 1,
    burnoutChance = 0.018,
    fireHeatOutputScale = 1,
    fireHeatAbsorption = 1,
    burnsTo = null,
    burnsToChance = 1,
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
    waterproof = false,
    reactsWhileStatic = false,
    opacity = null,
    emissive = 0,
    temperature = 20,
    igniteTemperature = null,
    heatOutput = 0,
    blastResistance = 0,
  }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.usesCustomColor = usesCustomColor;
    this.weight = weight;
    this.buoyancy = buoyancy;
    this.density = weight - buoyancy;
    this.swapBuffer = swapBuffer;
    this.displaceable = displaceable;
    this.flammability = flammability;
    this.burnLifeMin = burnLifeMin;
    this.burnLifeMax = burnLifeMax;
    this.burnDurationScale = Math.max(1, burnDurationScale);
    this.burnoutChance = burnoutChance;
    this.fireHeatOutputScale = Math.max(0.05, fireHeatOutputScale);
    this.fireHeatAbsorption = Math.max(0.05, fireHeatAbsorption);
    this.burnsTo = burnsTo;
    this.burnsToChance = burnsToChance;
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
    this.waterproof = waterproof;
    this.reactsWhileStatic = reactsWhileStatic;
    this.opacity = opacity ?? this.inferOpacity(name, gas, burns);
    this.emissive = Math.min(1, Math.max(0, emissive));
    this.temperature = temperature;
    this.igniteTemperature = igniteTemperature ?? (flammability > 0 ? 180 : Infinity);
    this.heatOutput = heatOutput;
    this.blastResistance = Math.min(1, Math.max(0, blastResistance));
  }

  inferOpacity(name, gas, burns) {
    if (this.id === MATERIAL.SPACE || this.id === MATERIAL.AIR) return 0;
    if (name === 'oxygen' || name === 'nitrogen') return 0.08;
    if (name === 'steam') return 0.32;
    if (name === 'smoke') return 0.45;
    if (name === 'water') return 0.48;
    if (name === 'plasma') return 0.82;
    if (name === 'fire' || burns) return 0.90;
    if (gas) return 0.30;
    return 1;
  }

  canBeDisplacedBy(sourcePixel) {
    return this.displaceable
      && (this.acceptsDisplacementFrom === null || this.acceptsDisplacementFrom.has(sourcePixel.id));
  }

  getInitialData(value = 0) {
    return value;
  }

  getBurnLife() {
    const min = Math.max(1, this.burnLifeMin);
    const max = Math.max(min, this.burnLifeMax);
    return Math.round((min + Math.floor(Math.random() * (max - min + 1))) * this.burnDurationScale);
  }

  update() {}

  renderColor(tone, value = 0, tint = this.color) {
    if (this.id === MATERIAL.SPACE) return this.color;
    const wobble = (tone % 23) - 11;
    return [
      tint[0] + wobble,
      tint[1] + wobble,
      tint[2] + wobble,
    ];
  }
}
