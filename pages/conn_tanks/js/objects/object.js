export class GameObject {
  constructor({ id = '', x = 0.5, y = 0.5, rotation = 0 } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
  }
}

export default GameObject;
