// #region Imports
import {
  ApiMessageType,
  PlayerActionModel,
  PlayerMoveModel,
  SerializableModel
} from './models.js';
// #endregion

// #region Base Request
export class ApiRequest extends SerializableModel {
  constructor(type) {
    super();
    this.type = type;
  }

  static parse(raw) {
    const data = parseRaw(raw);
    switch (data?.type) {
      case ApiMessageType.WELCOME:
        return WelcomeRequest.from(data);
      case ApiMessageType.STATE:
        return StateRequest.from(data);
      case ApiMessageType.MOVE:
        return MoveRequest.from(data);
      case ApiMessageType.ACTION:
        return ActionRequest.from(data);
      default:
        return null;
    }
  }
}
// #endregion

// #region Snapshot Requests
export class SnapshotRequest extends ApiRequest {
  constructor(type, { players, level, game } = {}) {
    super(type);
    this.players = players;
    this.level = level;
    this.game = game;
  }

  get valid() {
    return Array.isArray(this.players)
      && this.game
      && ['lobby', 'playing', 'gameOver'].includes(this.game.phase)
      && Number.isInteger(this.game.levelRevision)
      && this.game.levelRevision >= 0;
  }

  static from(value) {
    const request = new this(value);
    return request.valid ? request : null;
  }
}

export class WelcomeRequest extends SnapshotRequest {
  constructor(snapshot = {}) {
    super(ApiMessageType.WELCOME, snapshot);
  }

  get valid() {
    return super.valid && Boolean(this.level);
  }
}

export class StateRequest extends SnapshotRequest {
  constructor(snapshot = {}) {
    super(ApiMessageType.STATE, snapshot);
  }
}
// #endregion

// #region Player Requests
export class MoveRequest extends ApiRequest {
  constructor(movement, dt) {
    super(ApiMessageType.MOVE);
    const model = PlayerMoveModel.from({ movement, dt });
    this.movement = model.movement;
    this.dt = model.dt;
  }

  static from(value) {
    return new MoveRequest(value?.movement, value?.dt);
  }
}

export class ActionRequest extends ApiRequest {
  constructor(action) {
    super(ApiMessageType.ACTION);
    this.action = PlayerActionModel.from(action);
  }

  get valid() {
    return Boolean(this.action);
  }

  static from(value) {
    const request = new ActionRequest(value?.action);
    return request.valid ? request : null;
  }
}
// #endregion

// #region Factory Helpers
export function createWelcomeRequest(snapshot) {
  const request = new WelcomeRequest(snapshot);
  if (!request.valid) throw new TypeError('Invalid welcome snapshot');
  return request;
}

export function createStateRequest(snapshot) {
  const request = new StateRequest(snapshot);
  if (!request.valid) throw new TypeError('Invalid state snapshot');
  return request;
}

export function createMoveRequest(movement, dt) {
  return new MoveRequest(movement, dt);
}

export function createActionRequest(action) {
  const request = new ActionRequest(action);
  return request.valid ? request : null;
}
// #endregion

// #region Parsing Helpers
export function parseApiRequest(raw) {
  return ApiRequest.parse(raw);
}

export function getSnapshotPlayers(request) {
  if (!(request instanceof SnapshotRequest)) return null;
  return request.players;
}

export function getSnapshotLevel(request) {
  if (!(request instanceof SnapshotRequest)) return null;
  return request.level;
}

export function getSnapshotGame(request) {
  if (!(request instanceof SnapshotRequest)) return null;
  return request.game;
}

function parseRaw(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
// #endregion
