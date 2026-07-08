import Sprite from '../sprites/sprite.js';

const projectileDataUrl = new URL('../../../assets/data/projectile/projectile.json', import.meta.url);
let projectileData = null;
let projectileImage = null;

export async function loadProjectileData(source = projectileDataUrl) {
  const url = source instanceof URL ? source : new URL(source, projectileDataUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load projectile data: ${url.href}`);
  projectileData = normalizeProjectileData(await response.json(), url);
  projectileImage = null;
  return projectileData;
}

export function setProjectileData(data, source = projectileDataUrl) {
  projectileData = normalizeProjectileData(data, source instanceof URL ? source : new URL(source, projectileDataUrl));
  projectileImage = null;
  return projectileData;
}

export function getProjectileData() {
  if (!projectileData) throw new Error('Projectile data has not been loaded.');
  return projectileData;
}

function normalizeProjectileData(data, sourceUrl) {
  return {
    sourceUrl,
    speed: {
      default: data.speed?.default ?? 1,
      scaler: data.speed?.scaler ?? 1
    },
    size: {
      default: data.size?.default ?? 1,
      scaler: data.size?.scaler ?? 10
    },
    ttl: {
      default: data.ttl?.default ?? 1,
      scaler: data.ttl?.scaler ?? 1
    },
    reload: {
      default: data.reload?.default ?? 1.5,
      scaler: data.reload?.scaler ?? 1
    },
    damage: Math.max(0, Number(data.damage) || 34),
    levelDamage: Math.max(0, Number(data.levelDamage) || 1),
    explosion: {
      damage: Math.max(0, Number(data.explosion?.damage) || 8.5),
      radius: Math.max(0, Number(data.explosion?.radius) || 0.0175),
      duration: Math.max(0.01, Number(data.explosion?.duration) || 0.35)
    },
    image: {
      type: data.image?.type ?? 'generatedCircle',
      src: data.image?.src ?? null,
      width: data.image?.width ?? 16,
      height: data.image?.height ?? 16,
      radius: data.image?.radius ?? 5,
      color: data.image?.color ?? '#f8f35f'
    }
  };
}

export function getProjectileImage(data = getProjectileData()) {
  if (projectileImage) return projectileImage;

  if (data.image.src) {
    projectileImage = new Image();
    projectileImage.src = new URL(data.image.src, data.sourceUrl).href;
    return projectileImage;
  }

  const canvas = document.createElement('canvas');
  canvas.width = data.image.width;
  canvas.height = data.image.height;
  const context = canvas.getContext('2d');
  context.fillStyle = data.image.color;
  context.beginPath();
  context.arc(
    data.image.width / 2,
    data.image.height / 2,
    data.image.radius,
    0,
    Math.PI * 2
  );
  context.fill();

  projectileImage = new Image();
  projectileImage.src = canvas.toDataURL();
  return projectileImage;
}

export class Projectile extends Sprite {
  constructor(options = {}) {
    const data = getProjectileData();
    const rotation = options.rotation ?? 0;
    const size = options.size ?? data.size.default;
    const collideProjectiles = options.collideProjectiles ?? true;
    super({
      ...options,
      image: options.image ?? getProjectileImage(data),
      width: options.width ?? size * data.size.scaler,
      height: options.height ?? size * data.size.scaler,
      rotation,
      collider: options.collider ?? {
        enabled: true,
        isTrigger: true,
        layer: 'projectile',
        collidesWith: ['player', 'level', 'mine', ...(collideProjectiles ? ['projectile'] : [])],
        width: 0.012 * size,
        height: 0.012 * size
      }
    });

    this.ownerId = options.ownerId ?? '';
    this.volleyId = options.volleyId ?? '';
    this.ownerImmune = options.ownerImmune ?? false;
    this.ownerCollisionArmed = false;
    this.collideProjectiles = collideProjectiles;
    this.cardBehaviors = options.cardBehaviors ?? [];
    this.behaviorState = new Map();
    this.hitPlayerId = null;
    this.hitLevelObjectId = null;
    this.hit = false;
    this.size = size;
    this.speed = (options.speed ?? data.speed.default) * data.speed.scaler;
    this.age = 0;
    this.ttl = (options.ttl ?? data.ttl.default) * data.ttl.scaler;
    this.damage = options.damage ?? data.damage;
    this.levelDamage = options.levelDamage ?? data.levelDamage;
    this.explosion = { ...data.explosion, ...(options.explosion ?? {}) };
  }

  onCollision({ other, otherOwner }) {
    if (this.hit) return;
    if (other.layer === 'player') {
      const playerId = otherOwner?.playerId;
      if (!playerId) return;
      if (playerId === this.ownerId && (!this.ownerCollisionArmed || this.ownerImmune)) return;
      this.hitPlayerId = playerId;
      this.hit = true;
    } else if (other.layer === 'projectile') {
      if (this.volleyId && otherOwner?.volleyId === this.volleyId) return;
      this.hit = true;
    } else if (other.layer === 'mine') {
      if (otherOwner?.ownerId === this.ownerId) return;
      this.hit = true;
    } else if (other.layer === 'level') {
      this.hitLevelObjectId = otherOwner?.id ?? null;
      this.hitLevelCollider = other;
      this.hit = true;
    }
  }

  shouldIgnoreCollision(other) {
    return this.cardBehaviors.some((behavior, index) =>
      behavior.module.shouldIgnoreCollision?.({
        projectile: this,
        other,
        otherOwner: other.owner,
        options: behavior.options,
        state: getBehaviorState(this.behaviorState, `${behavior.id}:${index}`)
      }) === true
    );
  }

  update(dt, { wrap = false } = {}) {
    const collisions = super.update(dt);
    const touchingOwner = collisions.some(collider =>
      collider.layer === 'player' && collider.owner?.playerId === this.ownerId
    );
    if (!touchingOwner) this.ownerCollisionArmed = true;
    this.age += dt;
    this.x += Math.sin(this.rotation) * this.speed * dt;
    this.y -= Math.cos(this.rotation) * this.speed * dt;
    if (wrap) {
      this.x = wrapUnit(this.x);
      this.y = wrapUnit(this.y);
    }
  }

  get expired() {
    return this.hit
      || this.age >= this.ttl;
  }
}

function wrapUnit(value) {
  return ((value % 1) + 1) % 1;
}

function getBehaviorState(states, key) {
  if (!states.has(key)) states.set(key, {});
  return states.get(key);
}

export default Projectile;
