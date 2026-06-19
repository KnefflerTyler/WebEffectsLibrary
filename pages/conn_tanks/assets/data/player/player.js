import { PLAYER_MOVE_SMOOTHING, PLAYER_SIZE } from '../../../js/config.js';
import Sprite from '../../../js/objects/sprites/sprite.js';
import SpriteAnimation from '../../../js/objects/sprites/spriteAnimation.js';



export class Player extends Sprite {
  constructor(options = {}) {
    const playerImage = new Image();
    playerImage.src = new URL('../../images/slime_idle1.png', import.meta.url).href;
    
    super({
      ...options,
      width: options.width ?? PLAYER_SIZE,
      height: options.height ?? PLAYER_SIZE,
      image: options.image ?? playerImage,
      sheetCols: 2,
      sheetRows: 7
    });

    this.addAnimation(new SpriteAnimation({ name: 'default', row: 3, startCol: 0, endCol: 1, fps: 5, loop: true }));
    this.setAnimation('default');

    this.targetX = this.x;
    this.targetY = this.y;
    this.targetRotation = this.rotation;
  }

  move({ x, y, rotation } = {}, dt = 0) {
    if (Number.isFinite(x)) this.targetX = x;
    if (Number.isFinite(y)) this.targetY = y;
    if (Number.isFinite(rotation)) this.targetRotation = rotation;

    if (!Number.isFinite(dt) || dt <= 0) return;

    const amount = 1 - Math.exp(-PLAYER_MOVE_SMOOTHING * dt);
    this.x += (this.targetX - this.x) * amount;
    this.y += (this.targetY - this.y) * amount;

    const rotationDelta = Math.atan2(
      Math.sin(this.targetRotation - this.rotation),
      Math.cos(this.targetRotation - this.rotation)
    );
    this.rotation += rotationDelta * amount;

    if (Math.abs(this.targetX - this.x) < 0.00001) this.x = this.targetX;
    if (Math.abs(this.targetY - this.y) < 0.00001) this.y = this.targetY;
    if (Math.abs(rotationDelta) < 0.0001) this.rotation = this.targetRotation;
  }

  applyState(state) {
    this.move(state);
  }

  update(dt) {
    super.update(dt);
    this.move(undefined, dt);
  }

  serialize() {
    const { id, name, targetX: x, targetY: y, targetRotation: rotation, color } = this;
    return { id, name, x, y, rotation, color };
  }
}

export default Player;
