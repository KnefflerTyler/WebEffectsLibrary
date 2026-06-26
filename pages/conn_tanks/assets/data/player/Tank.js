import { 
  DEFAULT_TANK_AIM_SPEED,
  DEFAULT_TANK_AIM_SPEED_SCALER,
  DEFAULT_TANK_SPEED, 
  DEFAULT_TANK_SPEED_SCALER,
  DEFAULT_TANK_ROTATION_SPEED, 
  DEFAULT_TANK_ROTATION_SPEED_SCALER,
  DEFAULT_TANK_SIZE, 
  DEFAULT_TANK_SIZE_SCALER,
  PLAYER_MOVE_RESPONSE,
  PLAYER_ROTATION_RESPONSE,
  TANK_AIM_RESPONSE
} from '../../../js/config.js';
import Sprite from '../../../js/objects/sprites/sprite.js';
import SpriteAnimation from '../../../js/objects/sprites/spriteAnimation.js';

function createPlayerImage() {
  const image = new Image();
  image.src = new URL('../../images/tankspritesheet.png', import.meta.url).href;
  return image;
}

const TANK_SHEET_FRAME_WIDTH = 111.375;
const TANK_SHEET_FRAME_HEIGHT = 140;
const TANK_SHEET_FRAME_CENTER_OFFSETS = [
  [
    { x: 5, y: 5 },
    { x: 6, y: 4.5 },
    { x: 6.5, y: 5 },
    { x: 3, y: 5 },
    { x: 0.5, y: 4.5 },
    { x: -1.5, y: 5 },
    { x: -4.5, y: 5 },
    { x: -5.5, y: 4.5 }
  ],
  [
    { x: 3, y: -6 },
    { x: 5, y: -6 },
    { x: 6, y: -6 },
    { x: 3, y: -6 },
    { x: 0, y: -6 },
    { x: -1.5, y: -6 },
    { x: -5, y: -6 },
    { x: -6, y: -6 }
  ]
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createFrameOffsets(width, height) {
  return TANK_SHEET_FRAME_CENTER_OFFSETS.map(row => row.map(offset => ({
    x: offset.x / TANK_SHEET_FRAME_WIDTH * width,
    y: offset.y / TANK_SHEET_FRAME_HEIGHT * height
  })));
}

export class Tank {
  constructor(options = {}) {
    this.id = options.id ?? '';
    this.x = options.x ?? 0.5;
    this.y = options.y ?? 0.5;
    this.rotation = options.rotation ?? 0;

    this.size = options.size ?? DEFAULT_TANK_SIZE;
    this.move_speed = options.move_speed ?? DEFAULT_TANK_SPEED;
    this.rotation_speed = options.rotation_speed ?? DEFAULT_TANK_ROTATION_SPEED;
    this.aim_speed = options.aim_speed ?? DEFAULT_TANK_AIM_SPEED;

    const spriteHeight = this.size * DEFAULT_TANK_SIZE_SCALER;
    const spriteWidth = spriteHeight * (TANK_SHEET_FRAME_WIDTH / TANK_SHEET_FRAME_HEIGHT);
    const tankImage = options.image ?? createPlayerImage();
    const frameOffsets = createFrameOffsets(spriteWidth, spriteHeight);

    this.bottomSprite = new Sprite({
      id: `${this.id}:bottom`,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      image: tankImage,
      frameOffsets,
      sheetCols: 8,
      sheetRows: 2
    });
    this.topSprite = new Sprite({
      id: `${this.id}:top`,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      image: tankImage,
      frameOffsets,
      sheetCols: 8,
      sheetRows: 2
    });

    this.bottomSprite.addAnimation(new SpriteAnimation({ name: 'default', row: 1, startCol: 0, endCol: 7, fps: 5, loop: true }));
    this.bottomSprite.setAnimation('default');

    this.bottomSprite.width = spriteWidth;
    this.bottomSprite.height = spriteHeight;
    this.topSprite.width = spriteWidth;
    this.topSprite.height = spriteHeight;

    
    this.topSprite.addAnimation(new SpriteAnimation({ name: 'default', row: 0, startCol: 0, endCol: 7, fps: 5, loop: true }));
    this.topSprite.setAnimation('default');

    this.targetX = this.x;
    this.targetY = this.y;
    this.targetRotation = this.rotation;
    this.aimRotation = this.rotation;
    this.targetAimRotation = this.aimRotation;
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

  moveFromInput(movement, dt, bounds) {
    if (!movement || !Number.isFinite(dt) || dt <= 0) return false;

    const throttle = Math.max(-1, Math.min(1, Number(movement.throttle) || 0));
    const rotate = Math.max(-1, Math.min(1, Number(movement.rotate) || 0));
    const stoppedMoving = this.isMoving && !throttle;
    const stoppedTurning = this.isTurning && !rotate;

    this.isMoving = Boolean(throttle);
    this.isTurning = Boolean(rotate);

    if (!throttle) this.stopMoving();
    if (!rotate) this.stopTurning();
    if (!throttle && !rotate && !stoppedMoving && !stoppedTurning) return false;

    const rotation = this.targetRotation
      + rotate * this.rotation_speed * DEFAULT_TANK_ROTATION_SPEED_SCALER * dt;
    const distance = throttle * this.move_speed * DEFAULT_TANK_SPEED_SCALER * dt;
    const x = clamp(
      this.targetX + Math.sin(rotation) * distance,
      bounds.minX,
      bounds.maxX
    );
    const y = clamp(
      this.targetY - Math.cos(rotation) * distance,
      bounds.minY,
      bounds.maxY
    );

    this.move({ x, y, rotation });
    return true;
  }

  aimAt(target) {
    if (!target) return;
    this.targetAimRotation = this.getRotationTo(target);
    this.syncSprites();
  }

  updateAim(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    const aimAmount = 1 - Math.exp(-this.aim_speed * DEFAULT_TANK_AIM_SPEED_SCALER * TANK_AIM_RESPONSE * dt);
    const aimDelta = Math.atan2(
      Math.sin(this.targetAimRotation - this.aimRotation),
      Math.cos(this.targetAimRotation - this.aimRotation)
    );
    this.aimRotation += aimDelta * aimAmount;

    if (Math.abs(aimDelta) < 0.0001) this.aimRotation = this.targetAimRotation;
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
    this.updateAim(dt);
  }
}

export default Tank;
