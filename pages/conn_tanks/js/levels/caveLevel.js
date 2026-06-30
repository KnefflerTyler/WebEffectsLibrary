import Sprite from '../objects/sprites/sprite.js';
import BaseLevel from './baseLevel.js';
import LevelCollider from './levelCollider.js';
import { buildColliderMesh, createCaveTextureCanvas } from '../editor/caveGenerator.js';

export class CaveLevel extends BaseLevel {
  constructor(data = {}) {
    const textureCanvas = createCaveTextureCanvas(data);
    const image = new Image();
    image.src = textureCanvas.toDataURL('image/png');
    const sprite = new Sprite({ id: `${data.id}:texture`, x: 0.5, y: 0.5, image });
    sprite.levelSized = true;
    const mesh = Array.isArray(data.mesh) ? data.mesh : buildColliderMesh(data.cells);
    const colliders = mesh.map((rectangle, index) => new LevelCollider({
      id: `${data.id}:mesh:${index + 1}`,
      shape: 'rectangle',
      start: rectangle.start,
      end: rectangle.end,
      borderAlpha: 0,
      fillAlpha: 0,
      collider: { enabled: true, isTrigger: false, layer: 'level' }
    }));
    super({
      data: { ...data, name: data.name ?? 'Cave', screenWrap: false },
      objects: [sprite, ...colliders],
      spawns: []
    });
    this.sprite = sprite;
  }

  update() {
    // Static cave colliders are queried by moving colliders; they do not need
    // to test every other cave rectangle against one another each frame.
  }

}

export default CaveLevel;
