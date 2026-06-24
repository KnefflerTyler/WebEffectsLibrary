import { 
  DEFAULT_PLAYER_SPEED, 
  DEFAULT_PLAYER_ROTATION_SPEED, 
  DEFAULT_PLAYER_SIZE, 
  DEFAULT_PLAYER_SIZE_SCALER,
  PLAYER_MOVE_RESPONSE,
  PLAYER_ROTATION_RESPONSE
} from '../../../js/config.js';
import Sprite from '../../../js/objects/sprites/sprite.js';
import SpriteAnimation from '../../../js/objects/sprites/spriteAnimation.js';

function createPlayerImage() {
  const image = new Image();
  image.src = new URL('../../images/slime_idle1.png', import.meta.url).href;
  return image;
}

export class Tank {
  constructor(options = {}) {
    this.id = options.id ?? '';
    this.name = options.name ?? '';
    this.color = options.color ?? '#ffffff';
    this.x = options.x ?? 0.5;
    this.y = options.y ?? 0.5;
    this.rotation = options.rotation ?? 0;

    this.bottomSprite = new Sprite({
      id: `${this.id}:bottom`,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      image: options.image ?? createPlayerImage(),
      sheetCols: 2,
      sheetRows: 7
    });
    this.topSprite = new Sprite({
      id: `${this.id}:top`,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      image: null
    });

    this.size = options.size ?? DEFAULT_PLAYER_SIZE;
    this.move_speed = options.move_speed ?? DEFAULT_PLAYER_SPEED;
    this.rotation_speed = options.rotation_speed ?? DEFAULT_PLAYER_ROTATION_SPEED;

    this.bottomSprite.addAnimation(new SpriteAnimation({ name: 'default', row: 3, startCol: 0, endCol: 1, fps: 5, loop: true }));
    this.bottomSprite.setAnimation('default');

    const spriteSize = this.size * DEFAULT_PLAYER_SIZE_SCALER;
    this.bottomSprite.width = spriteSize;
    this.bottomSprite.height = spriteSize;
    this.topSprite.width = spriteSize;
    this.topSprite.height = spriteSize;

    this.targetX = this.x;
    this.targetY = this.y;
    this.targetRotation = this.rotation;
    this.aimRotation = this.rotation;
    this.isMoving = false;
    this.isTurning = false;
    this.syncSprites();
  }

  get sprites() {
    return [this.bottomSprite, this.topSprite];
  }

  syncSprites() {
    this.bottomSprite.x = this.x;
    this.bottomSprite.y = this.y;
    this.bottomSprite.rotation = this.rotation;

    this.topSprite.x = this.x;
    this.topSprite.y = this.y;
    this.topSprite.rotation = this.aimRotation;
  }

  move({ x, y, rotation } = {}, dt = 0) {
    if (Number.isFinite(x)) this.targetX = x;
    if (Number.isFinite(y)) this.targetY = y;
    if (Number.isFinite(rotation)) this.targetRotation = rotation;

    if (!Number.isFinite(dt) || dt <= 0) return;

    const moveAmount = 1 - Math.exp(-this.move_speed * PLAYER_MOVE_RESPONSE * dt);
    const rotationAmount = 1 - Math.exp(-this.rotation_speed * PLAYER_ROTATION_RESPONSE * dt);
    this.x += (this.targetX - this.x) * moveAmount;
    this.y += (this.targetY - this.y) * moveAmount;

    const rotationDelta = Math.atan2(
      Math.sin(this.targetRotation - this.rotation),
      Math.cos(this.targetRotation - this.rotation)
    );
    this.rotation += rotationDelta * rotationAmount;

    if (Math.abs(this.targetX - this.x) < 0.00001) this.x = this.targetX;
    if (Math.abs(this.targetY - this.y) < 0.00001) this.y = this.targetY;
    if (Math.abs(rotationDelta) < 0.0001) this.rotation = this.targetRotation;

    this.syncSprites();
  }

  stopMoving() {
    this.targetX = this.x;
    this.targetY = this.y;
  }

  stopTurning() {
    this.targetRotation = this.rotation;
  }

  applyState(state) {
    this.move(state);
  }

  aimAt(target) {
    if (!target) return;
    this.aimRotation = this.getRotationTo(target);
    this.syncSprites();
  }

  getRotationTo(target) {
    return Math.atan2(target.x - this.x, -(target.y - this.y));
  }

  getAimDebugLine(length = 0.18) {
    return {
      start: { x: this.x, y: this.y },
      end: {
        x: this.x + Math.sin(this.aimRotation) * length,
        y: this.y - Math.cos(this.aimRotation) * length
      }
    };
  }

  update(dt) {
    this.bottomSprite.update(dt);
    this.topSprite.update(dt);
    this.move(undefined, dt);
  }

  serialize() {
    const { id, name, targetX: x, targetY: y, targetRotation: rotation, color } = this;
    return { id, name, x, y, rotation, color };
  }
}

export default Tank;
