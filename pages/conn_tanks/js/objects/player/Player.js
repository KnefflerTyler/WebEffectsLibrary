import Tank from './Tank.js';

export class Player {
  constructor(options = {}) {
    this.id = options.id ?? '';
    this.name = options.name ?? '';
    this.color = options.color ?? '#ffffff';
    this.lives = Math.max(0, Math.floor(Number(options.lives ?? 3)));
    this.tank = options.tank ?? new Tank({ ...options, id: this.id });
    this.syncAliveState();
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
    if (Number.isFinite(Number(state?.lives))) {
      this.lives = Math.max(0, Math.floor(Number(state.lives)));
      this.syncAliveState();
    }
    this.tank.applyState(state);
  }

  get alive() {
    return this.lives > 0;
  }

  loseLife() {
    if (!this.alive) return false;
    this.lives -= 1;
    this.syncAliveState();
    return true;
  }

  resetForMatch(spawn, lives = 3) {
    this.lives = lives;
    this.syncAliveState();
    this.tank.teleport(spawn);
  }

  respawn(spawn) {
    if (!this.alive) return;
    this.tank.teleport(spawn);
  }

  syncAliveState() {
    if (this.tank.bottomSprite.collider) this.tank.bottomSprite.collider.enabled = this.alive;
  }

  moveFromInput(movement, dt, bounds) {
    if (!this.alive) return false;
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

  destroy() {
    this.tank.bottomSprite.removeCollider();
  }

  serialize() {
    const { id, name, color, lives } = this;
    const { targetX: x, targetY: y, targetRotation: rotation } = this.tank;
    return { id, name, x, y, rotation, color, lives };
  }
}

export default Player;
