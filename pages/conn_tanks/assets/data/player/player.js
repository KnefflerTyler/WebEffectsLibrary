import { PLAYER_SIZE } from '../../../js/config.js';
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
  }

  applyState({ x, y, rotation }) {
    if (Number.isFinite(x)) this.x = x;
    if (Number.isFinite(y)) this.y = y;
    if (Number.isFinite(rotation)) this.rotation = rotation;
  }

  serialize() {
    const { id, name, x, y, rotation, color } = this;
    return { id, name, x, y, rotation, color };
  }
}

export default Player;
