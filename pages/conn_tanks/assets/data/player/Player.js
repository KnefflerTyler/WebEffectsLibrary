import Tank from './Tank.js';

export class Player {
  constructor(options = {}) {
    this.id = options.id ?? '';
    this.name = options.name ?? '';
    this.color = options.color ?? '#ffffff';
    this.tank = options.tank ?? new Tank({ ...options, id: this.id });
  }

  get sprites() {
    return this.tank.sprites;
  }

  get x() {
    return this.tank.x;
  }

  get y() {
    return this.tank.y;
  }

  get targetX() {
    return this.tank.targetX;
  }

  get targetY() {
    return this.tank.targetY;
  }

  get targetRotation() {
    return this.tank.targetRotation;
  }

  get move_speed() {
    return this.tank.move_speed;
  }

  get rotation_speed() {
    return this.tank.rotation_speed;
  }

  get aimRotation() {
    return this.tank.aimRotation;
  }

  get isMoving() {
    return this.tank.isMoving;
  }

  set isMoving(value) {
    this.tank.isMoving = value;
  }

  get isTurning() {
    return this.tank.isTurning;
  }

  set isTurning(value) {
    this.tank.isTurning = value;
  }

  move(state, dt) {
    this.tank.move(state, dt);
  }

  stopMoving() {
    this.tank.stopMoving();
  }

  stopTurning() {
    this.tank.stopTurning();
  }

  applyState(state) {
    this.tank.applyState(state);
  }

  moveFromInput(movement, dt, bounds) {
    return this.tank.moveFromInput(movement, dt, bounds);
  }

  aimAt(target) {
    this.tank.aimAt(target);
  }

  getRotationTo(target) {
    return this.tank.getRotationTo(target);
  }

  getAimDebugLine() {
    return this.tank.getAimDebugLine();
  }

  update(dt) {
    this.tank.update(dt);
  }

  serialize() {
    const { id, name, color } = this;
    const { targetX: x, targetY: y, targetRotation: rotation } = this.tank;
    return { id, name, x, y, rotation, color };
  }
}

export default Player;
