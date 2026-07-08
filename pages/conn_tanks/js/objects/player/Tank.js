import Sprite from '../sprites/sprite.js';
import SpriteAnimation from '../sprites/spriteAnimation.js';
import Collider from '../collider.js';

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
      scaler: data.size?.scaler ?? 54,
      cellScale: Math.max(0.1, Math.min(4, Number(data.size?.cellScale) || 1.8))
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
    rotateWithOwner: collider.rotateWithOwner ?? false,
    pixelWidth: collider.pixelWidth ?? null,
    pixelHeight: collider.pixelHeight ?? null,
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
    this.levelGridCols = 96;
    this.levelGridRows = 54;
    this.move_speed = options.move_speed ?? data.speed.default;
    this.rotation_speed = options.rotation_speed ?? data.rotation.default;
    this.aim_speed = options.aim_speed ?? data.aim.default;
    this.baseStats = {
      move_speed: this.move_speed,
      rotation_speed: this.rotation_speed,
      aim_speed: this.aim_speed
    };

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
    this.bottomSprite.playerId = this.id;
    this.bottomSprite.wrapWithScreen = true;
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
    this.topSprite.wrapWithScreen = true;

    this.bottomSprite.addAnimation(new SpriteAnimation(data.bottomSprite.animation));
    this.bottomSprite.setAnimation(data.bottomSprite.animation.name);

    this.bottomSprite.width = spriteWidth;
    this.bottomSprite.height = spriteHeight;
    this.topSprite.width = spriteWidth;
    this.topSprite.height = spriteHeight;

    this.topSprite.addAnimation(new SpriteAnimation(data.topSprite.animation));
    this.topSprite.setAnimation(data.topSprite.animation.name);
    this.updateLevelScale();

    this.targetX = this.x;
    this.targetY = this.y;
    this.targetRotation = this.rotation;
    this.aimRotation = this.rotation;
    this.targetAimRotation = this.aimRotation;
    this.isMoving = false;
    this.isTurning = false;
    this.lastSafeX = this.x;
    this.lastSafeY = this.y;
    this.lastSafeRotation = this.rotation;
    this.syncSprites();
  }

  get sprites() {
    return [this.bottomSprite, this.topSprite];
  }

  applyModifiers({ moveSpeed = 1, rotationSpeed = 1, aimSpeed = 1 } = {}) {
    this.move_speed = this.baseStats.move_speed * moveSpeed;
    this.rotation_speed = this.baseStats.rotation_speed * rotationSpeed;
    this.aim_speed = this.baseStats.aim_speed * aimSpeed;
  }

  setLevelGridSize(cols, rows) {
    const nextCols = Math.max(1, Math.floor(Number(cols) || 1));
    const nextRows = Math.max(1, Math.floor(Number(rows) || 1));
    if (nextCols === this.levelGridCols && nextRows === this.levelGridRows) return;
    this.levelGridCols = nextCols;
    this.levelGridRows = nextRows;
    this.updateLevelScale();
  }

  updateLevelScale() {
    if (!this.bottomSprite || !this.topSprite) return;
    const data = getTankData();
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1);
    const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 1);
    const cellWidth = viewportWidth / this.levelGridCols;
    const cellHeight = viewportHeight / this.levelGridRows;
    const aspect = data.spriteSheet.frameWidth / data.spriteSheet.frameHeight;
    const height = Math.min(cellHeight, cellWidth / aspect) * data.size.cellScale * this.size;
    const width = height * aspect;
    if (Math.abs(this.bottomSprite.height - height) < 0.01
      && Math.abs(this.bottomSprite.width - width) < 0.01) return;

    const frameOffsets = createFrameOffsets(data, width, height);
    const turretPivotOffsetY = data.spriteSheet.turretPivotOffsetY / data.spriteSheet.frameHeight * height;
    for (const sprite of [this.bottomSprite, this.topSprite]) {
      sprite.width = width;
      sprite.height = height;
      sprite.frameOffsets = frameOffsets;
    }
    this.topSprite.originOffsetY = turretPivotOffsetY;
    if (this.bottomSprite.collider) {
      this.bottomSprite.collider.pixelWidth = width * 0.52;
      this.bottomSprite.collider.pixelHeight = height * 0.63;
    }
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

  teleport({ x = this.x, y = this.y, rotation = this.rotation } = {}) {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    this.rotation = this.targetRotation = rotation;
    this.aimRotation = this.targetAimRotation = rotation;
    this.stopMoving();
    this.stopTurning();
    this.lastSafeX = x;
    this.lastSafeY = y;
    this.lastSafeRotation = rotation;
    this.syncSprites();
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
    const rawX = this.targetX + Math.sin(rotation) * distance;
    const rawY = this.targetY - Math.cos(rotation) * distance;
    const x = bounds.wrap
      ? wrap(rawX, bounds.minX, bounds.maxX)
      : clamp(rawX, bounds.minX, bounds.maxX);
    const y = bounds.wrap
      ? wrap(rawY, bounds.minY, bounds.maxY)
      : clamp(rawY, bounds.minY, bounds.maxY);

    if (bounds.wrap && x !== rawX) this.x = this.targetX = x;
    if (bounds.wrap && y !== rawY) this.y = this.targetY = y;

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
    this.updateLevelScale();
    this.move(undefined, dt);
    const collisions = this.bottomSprite.update(dt);
    const walls = collisions.filter(collider => collider.layer === 'level');
    if (walls.length) {
      this.resolveWallSlide();
    } else {
      this.lastSafeX = this.x;
      this.lastSafeY = this.y;
      this.lastSafeRotation = this.rotation;
    }
    this.topSprite.update(dt);
    this.updateAim(dt);
  }

  resolveWallSlide() {
    const attemptedX = this.x;
    const attemptedY = this.y;
    const deltaX = attemptedX - this.lastSafeX;
    const deltaY = attemptedY - this.lastSafeY;
    const canSlideX = Math.abs(deltaX) > 1e-8 && this.isClearOfWalls(attemptedX, this.lastSafeY);
    const canSlideY = Math.abs(deltaY) > 1e-8 && this.isClearOfWalls(this.lastSafeX, attemptedY);

    if (canSlideX && (!canSlideY || Math.abs(deltaX) >= Math.abs(deltaY))) {
      this.x = attemptedX;
      this.y = this.lastSafeY;
      this.targetY = this.y;
    } else if (canSlideY) {
      this.x = this.lastSafeX;
      this.y = attemptedY;
      this.targetX = this.x;
    } else {
      this.x = this.lastSafeX;
      this.y = this.lastSafeY;
      this.rotation = this.lastSafeRotation;
      this.stopMoving();
    }

    this.lastSafeX = this.x;
    this.lastSafeY = this.y;
    this.lastSafeRotation = this.rotation;
    this.syncSprites();
  }

  isClearOfWalls(x, y) {
    const previousX = this.x;
    const previousY = this.y;
    this.x = x;
    this.y = y;
    this.syncSprites();
    const clear = [...Collider.colliders].every(collider =>
      collider === this.bottomSprite.collider
      || collider.layer !== 'level'
      || !collider.enabled
      || !this.bottomSprite.collider.intersects(collider));
    this.x = previousX;
    this.y = previousY;
    this.syncSprites();
    return clear;
  }
}

function wrap(value, min, max) {
  if (value >= min && value <= max) return value;
  const span = max - min;
  return ((value - min) % span + span) % span + min;
}

export default Tank;
