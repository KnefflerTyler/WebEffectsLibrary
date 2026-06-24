import {
  DEFAULT_PROJECTILE_SIZE,
  DEFAULT_PROJECTILE_SIZE_SCALER,
  DEFAULT_PROJECTILE_SPEED,
  DEFAULT_PROJECTILE_SPEED_SCALER,
  DEFAULT_PROJECTILE_TTL,
  DEFAULT_PROJECTILE_TTL_SCALER
} from '../../../js/config.js';
import Sprite from '../../../js/objects/sprites/sprite.js';

let projectileImage = null;

function getProjectileImage() {
  if (projectileImage) return projectileImage;

  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f8f35f';
  context.beginPath();
  context.arc(8, 8, 5, 0, Math.PI * 2);
  context.fill();

  projectileImage = new Image();
  projectileImage.src = canvas.toDataURL();
  return projectileImage;
}

export class Projectile extends Sprite {
  constructor(options = {}) {
    const rotation = options.rotation ?? 0;
    const size = options.size ?? DEFAULT_PROJECTILE_SIZE;
    super({
      ...options,
      image: options.image ?? getProjectileImage(),
      width: options.width ?? size * DEFAULT_PROJECTILE_SIZE_SCALER,
      height: options.height ?? size * DEFAULT_PROJECTILE_SIZE_SCALER,
      rotation
    });

    this.size = size;
    this.speed = (options.speed ?? DEFAULT_PROJECTILE_SPEED) * DEFAULT_PROJECTILE_SPEED_SCALER;
    this.age = 0;
    this.ttl = (options.ttl ?? DEFAULT_PROJECTILE_TTL) * DEFAULT_PROJECTILE_TTL_SCALER;
  }

  update(dt) {
    super.update(dt);
    this.age += dt;
    this.x += Math.sin(this.rotation) * this.speed * dt;
    this.y -= Math.cos(this.rotation) * this.speed * dt;
  }

  get expired() {
    return this.age >= this.ttl
      || this.x < -0.05
      || this.x > 1.05
      || this.y < -0.05
      || this.y > 1.05;
  }
}

export default Projectile;
