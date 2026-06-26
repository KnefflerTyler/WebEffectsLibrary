// #region Constants
export const ApiMessageType = Object.freeze({
  ACTION: 'action',
  MOVE: 'move',
  STATE: 'state',
  WELCOME: 'welcome'
});

export const PlayerActionType = Object.freeze({
  FIRE: 'fire'
});
// #endregion

// #region Base Model
export class SerializableModel {
  toJSON() {
    return Object.fromEntries(
      Object.entries(this).map(([key, value]) => [key, serializeValue(value)])
    );
  }

  serialize() {
    return this.toJSON();
  }

  toString() {
    return JSON.stringify(this);
  }
}
// #endregion

// #region Value Models
export class PointModel extends SerializableModel {
  constructor(point = {}) {
    super();
    this.x = clamp01(point.x);
    this.y = clamp01(point.y);
  }

  static from(point) {
    return point instanceof PointModel ? point : new PointModel(point);
  }
}

export class PlayerMoveModel extends SerializableModel {
  constructor({ movement, dt } = {}) {
    super();
    this.movement = {
      throttle: clampAxis(movement?.throttle),
      rotate: clampAxis(movement?.rotate)
    };
    this.dt = Math.max(0, Number(dt) || 0);
  }

  static from(value) {
    return value instanceof PlayerMoveModel ? value : new PlayerMoveModel(value);
  }
}

export class PlayerActionModel extends SerializableModel {
  constructor(action = {}) {
    super();
    this.type = action.type;
    this.target = action.target ? PointModel.from(action.target) : null;
  }

  get valid() {
    return this.type === PlayerActionType.FIRE && Boolean(this.target);
  }

  static from(action) {
    if (action instanceof PlayerActionModel) return action;
    const model = new PlayerActionModel(action);
    return model.valid ? model : null;
  }
}
// #endregion

// #region Factory Helpers
export function createPlayerMove({ movement, dt } = {}) {
  return new PlayerMoveModel({ movement, dt });
}

export function createPlayerAction(action = {}) {
  return PlayerActionModel.from(action);
}

export function createPoint(point = {}) {
  return PointModel.from(point);
}
// #endregion

// #region Internal Helpers
function serializeValue(value) {
  if (value instanceof SerializableModel) return value.toJSON();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serializeValue(child)])
    );
  }
  return value;
}

function clampAxis(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
// #endregion
