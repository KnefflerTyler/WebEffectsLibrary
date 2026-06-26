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
  constructor(type, players = [], level = null) {
    super(type);
    this.players = Array.isArray(players) ? players : [];
    this.level = level;
  }

  static from(value) {
    return new this(value?.players, value?.level ?? null);
  }
}

export class WelcomeRequest extends SnapshotRequest {
  constructor(players = [], level = null) {
    super(ApiMessageType.WELCOME, players, level);
  }
}

export class StateRequest extends SnapshotRequest {
  constructor(players = [], level = null) {
    super(ApiMessageType.STATE, players, level);
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
export function createWelcomeRequest(players, level = null) {
  return new WelcomeRequest(players, level);
}

export function createStateRequest(players, level = null) {
  return new StateRequest(players, level);
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

function parseRaw(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}
// #endregion
