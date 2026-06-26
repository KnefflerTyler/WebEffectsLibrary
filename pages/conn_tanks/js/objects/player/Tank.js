import Sprite from '../sprites/sprite.js';
import SpriteAnimation from '../sprites/spriteAnimation.js';

const tankDataUrl = new URL('../../../assets/data/player/tank.json', import.meta.url);
let tankData = null;

export async function loadTankData(source = tankDataUrl) {
  const url = source instanceof URL ? source : new URL(source, tankDataUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load tank data: ${url.href}`);
  tankData = normalizeTankData(await response.json(), url);
  return tankData;
}

export function setTankData(data, source = tankDataUrl) {
  tankData = normalizeTankData(data, source instanceof URL ? source : new URL(source, tankDataUrl));
  return tankData;
}

export function getTankData() {
  if (!tankData) throw new Error('Tank data has not been loaded.');
  return tankData;
}

function normalizeTankData(data, sourceUrl) {
  return {
    sourceUrl,
    speed: {
      default: data.speed?.default ?? 1,
      scaler: data.speed?.scaler ?? 1,
      response: data.speed?.response ?? 18
    },
    rotation: {
      default: data.rotation?.default ?? 1,
      scaler: data.rotation?.scaler ?? 1,
      response: data.rotation?.response ?? 18
    },
    aim: {
      default: data.aim?.default ?? 1,
      scaler: data.aim?.scaler ?? 1,
      response: data.aim?.response ?? 18
    },
    size: {
      default: data.size?.default ?? 1,
      scaler: data.size?.scaler ?? 54
    },
    collider: normalizeColliderData(data.collider),
    spriteSheet: {
      image: data.spriteSheet?.image ?? '../../images/tankspritesheet.png',
      frameWidth: data.spriteSheet?.frameWidth ?? 1,
      frameHeight: data.spriteSheet?.frameHeight ?? 1,
      sheetCols: data.spriteSheet?.sheetCols ?? 1,
      sheetRows: data.spriteSheet?.sheetRows ?? 1,
      turretPivotOffsetY: data.spriteSheet?.turretPivotOffsetY ?? 0,
      frameCenterOffsets: data.spriteSheet?.frameCenterOffsets ?? []
    },
    bottomSprite: {
      animation: data.bottomSprite?.animation ?? { name: 'default' }
    },
    topSprite: {
      animation: data.topSprite?.animation ?? { name: 'default' }
    }
  };
}

function normalizeColliderData(collider) {
  if (!collider) return null;

  return {
    enabled: collider.enabled ?? true,
    isTrigger: collider.isTrigger ?? true,
    layer: collider.layer ?? 'player',
    collidesWith: Array.isArray(collider.collidesWith)
      ? collider.collidesWith
      : null,
    offsetX: collider.offsetX ?? 0,
    offsetY: collider.offsetY ?? 0,
    width: collider.width ?? 0.045,
    height: collider.height ?? 0.06
  };
}

function createColliderOptions(collider, id) {
  if (!collider) return null;
  return {
    ...collider,
    id: collider.id ?? `${id}:collider`
  };
}

function createTankImage(data) {
  const image = new Image();
  image.src = new URL(data.spriteSheet.image, data.sourceUrl).href;
  return image;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createFrameOffsets(data, width, height) {
  const { frameWidth, frameHeight, frameCenterOffsets } = data.spriteSheet;
  return frameCenterOffsets.map(row => row.map(offset => ({
    x: (Number(offset.x) || 0) / frameWidth * width,
    y: (Number(offset.y) || 0) / frameHeight * height
  })));
}

export class Tank {
  constructor(options = {}) {
    const data = getTankData();
    const { spriteSheet } = data;

    this.id = options.id ?? '';
    this.x = options.x ?? 0.5;
    this.y = options.y ?? 0.5;
    this.rotation = options.rotation ?? 0;

    this.size = options.size ?? data.size.default;
    this.move_speed = options.move_speed ?? data.speed.default;
    this.rotation_speed = options.rotation_speed ?? data.rotation.default;
    this.aim_speed = options.aim_speed ?? data.aim.default;

    const spriteHeight = this.size * data.size.scaler;
    const spriteWidth = spriteHeight * (spriteSheet.frameWidth / spriteSheet.frameHeight);
    const turretPivotOffsetY = spriteSheet.turretPivotOffsetY / spriteSheet.frameHeight * spriteHeight;
    const tankImage = options.image ?? createTankImage(data);
    const frameOffsets = createFrameOffsets(data, spriteWidth, spriteHeight);

    this.bottomSprite = new Sprite({
      id: `${this.id}:bottom`,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      image: tankImage,
      frameOffsets,
      sheetCols: spriteSheet.sheetCols,
      sheetRows: spriteSheet.sheetRows,
      collider: options.collider ?? createColliderOptions(data.collider, this.id)
    });
    this.topSprite = new Sprite({
      id: `${this.id}:top`,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      image: tankImage,
      originOffsetY: turretPivotOffsetY,
      frameOffsets,
      sheetCols: spriteSheet.sheetCols,
      sheetRows: spriteSheet.sheetRows
    });

    this.bottomSprite.addAnimation(new SpriteAnimation(data.bottomSprite.animation));
    this.bottomSprite.setAnimation(data.bottomSprite.animation.name);

    this.bottomSprite.width = spriteWidth;
    this.bottomSprite.height = spriteHeight;
    this.topSprite.width = spriteWidth;
    this.topSprite.height = spriteHeight;

    this.topSprite.addAnimation(new SpriteAnimation(data.topSprite.animation));
    this.topSprite.setAnimation(data.topSprite.animation.name);

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
    const data = getTankData();
    if (Number.isFinite(x)) this.targetX = x;
    if (Number.isFinite(y)) this.targetY = y;
    if (Number.isFinite(rotation)) this.targetRotation = rotation;

    if (!Number.isFinite(dt) || dt <= 0) return;

    const moveAmount = 1 - Math.exp(-this.move_speed * data.speed.response * dt);
    const rotationAmount = 1 - Math.exp(-this.rotation_speed * data.rotation.response * dt);
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
    const data = getTankData();
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
      + rotate * this.rotation_speed * data.rotation.scaler * dt;
    const distance = throttle * this.move_speed * data.speed.scaler * dt;
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
    const data = getTankData();
    if (!Number.isFinite(dt) || dt <= 0) return;

    const aimAmount = 1 - Math.exp(-this.aim_speed * data.aim.scaler * data.aim.response * dt);
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
