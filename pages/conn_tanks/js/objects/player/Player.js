import Tank from './Tank.js';

export class Player {
  constructor(options = {}) {
    this.id = options.id ?? '';
    this.name = options.name ?? '';
    this.isCpu = Boolean(options.isCpu);
    this.color = options.color ?? '#ffffff';
    this.baseMaxHealth = 100;
    this.maxHealth = Math.max(this.baseMaxHealth, Number(options.maxHealth) || this.baseMaxHealth);
    this.lives = Math.max(0, Math.min(this.maxHealth, Number(options.lives ?? this.maxHealth)));
    this.maxAmmo = Math.max(1, Math.floor(Number(options.maxAmmo) || 1));
    const initialAmmo = Number.isFinite(Number(options.ammo)) ? Number(options.ammo) : this.maxAmmo;
    this.ammo = Math.max(0, Math.min(this.maxAmmo, Math.floor(initialAmmo)));
    this.reloadElapsed = Math.max(0, Number(options.reloadElapsed) || 0);
    this.reloadDuration = Math.max(0.01, Number(options.reloadDuration) || 1.5);
    this.reloading = options.reloading ?? this.ammo < this.maxAmmo;
    this.lobbyRegenElapsed = Math.max(0, Number(options.lobbyRegenElapsed) || 0);
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
    if (typeof state?.isCpu === 'boolean') this.isCpu = state.isCpu;
    if (Number.isFinite(Number(state?.maxHealth))) {
      this.maxHealth = Math.max(this.baseMaxHealth, Number(state.maxHealth));
    }
    if (Number.isFinite(Number(state?.lives))) {
      this.lives = Math.max(0, Math.min(this.maxHealth, Number(state.lives)));
      this.syncAliveState();
    }
    if (Number.isFinite(Number(state?.maxAmmo))) {
      this.maxAmmo = Math.max(1, Math.floor(Number(state.maxAmmo)));
    }
    if (Number.isFinite(Number(state?.ammo))) {
      this.ammo = Math.max(0, Math.min(this.maxAmmo, Math.floor(Number(state.ammo))));
    }
    if (Number.isFinite(Number(state?.reloadElapsed))) {
      this.reloadElapsed = Math.max(0, Number(state.reloadElapsed));
    }
    if (Number.isFinite(Number(state?.reloadDuration))) {
      this.reloadDuration = Math.max(0.01, Number(state.reloadDuration));
    }
    if (typeof state?.reloading === 'boolean') this.reloading = state.reloading;
    if (Number.isFinite(Number(state?.lobbyRegenElapsed))) {
      this.lobbyRegenElapsed = Math.max(0, Number(state.lobbyRegenElapsed));
    }
    this.tank.applyState(state);
  }

  get alive() {
    return this.lives > 0;
  }

  loseLife(amount = 1) {
    if (!this.alive) return false;
    this.lives = Math.max(0, this.lives - Math.max(0, Number(amount) || 0));
    this.syncAliveState();
    return true;
  }

  resetForMatch(spawn, lives = 100) {
    this.lives = this.maxHealth;
    this.ammo = this.maxAmmo;
    this.reloadElapsed = 0;
    this.reloading = false;
    this.lobbyRegenElapsed = 0;
    this.syncAliveState();
    this.tank.teleport(spawn);
  }

  applyCardModifiers(modifiers = {}) {
    this.tank.applyModifiers(modifiers.tank);
    this.projectileModifiers = modifiers.projectile ?? { speed: 1, size: 1, ttl: 1 };
    this.cardBehaviors = modifiers.behaviors ?? [];
    const oldMaxHealth = this.maxHealth;
    const oldMaxAmmo = this.maxAmmo;
    this.maxHealth = Math.max(1, this.baseMaxHealth + (modifiers.tank?.maxHealthAdd ?? 0));
    this.maxAmmo = Math.max(1, 1 + Math.floor(modifiers.tank?.maxAmmoAdd ?? 0));
    this.reloadSpeed = Math.max(0.05, modifiers.tank?.reloadSpeed ?? 1);
    this.lives = Math.max(0, Math.min(this.maxHealth, this.lives + this.maxHealth - oldMaxHealth));
    this.ammo = Math.max(0, Math.min(this.maxAmmo, this.ammo + this.maxAmmo - oldMaxAmmo));
  }

  respawn(spawn) {
    if (!this.alive) return;
    this.tank.teleport(spawn);
  }

  consumeAmmo(reloadDuration = this.reloadDuration) {
    if (!this.alive || this.ammo <= 0) return false;
    this.ammo -= 1;
    this.reloadDuration = Math.max(
      0.01,
      (Number(reloadDuration) || this.reloadDuration) * (this.reloadSpeed ?? 1)
    );
    if (this.ammo < this.maxAmmo) {
      this.reloadElapsed = 0;
      this.reloading = true;
    }
    return true;
  }

  get reloadProgress() {
    return this.reloading ? Math.min(1, this.reloadElapsed / this.reloadDuration) : 0;
  }

  regenerate() {
    this.lives = this.maxHealth;
    this.lobbyRegenElapsed = 0;
    this.syncAliveState();
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
    if (!this.reloading) return;
    this.reloadElapsed += Math.max(0, Number(dt) || 0);
    if (this.reloadElapsed < this.reloadDuration) return;
    this.ammo = Math.min(this.maxAmmo, this.ammo + 1);
    this.reloadElapsed = 0;
    this.reloading = this.ammo < this.maxAmmo;
  }

  destroy() {
    this.tank.bottomSprite.removeCollider();
  }

  serialize() {
    const {
      id, name, color, isCpu, lives, maxHealth,
      ammo, maxAmmo, reloading, reloadElapsed, reloadDuration, lobbyRegenElapsed
    } = this;
    const { targetX: x, targetY: y, targetRotation: rotation } = this.tank;
    return {
      id, name, x, y, rotation, color, isCpu, lives, maxHealth,
      ammo, maxAmmo, reloading, reloadElapsed, reloadDuration,
      lobbyRegenElapsed,
      reloadProgress: this.reloadProgress
    };
  }
}

export default Player;
