// Game.js — pure game logic, no DOM
export const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

export class Game {
  constructor() {
    this.scores = { x: 0, o: 0 };
    this.reset();
  }

  reset() {
    this.board       = Array(9).fill(null);
    this.turn        = 'X';
    this.over        = false;
    this.winner      = null;   // 'X' | 'O' | 'draw'
    this.winLine     = null;
    this.replayVotes = new Set();
  }

  /** Returns true if the move was applied. */
  applyMove(index) {
    if (this.over || this.board[index] != null) return false;
    const mark       = this.turn;
    this.board[index] = mark;
    const line        = this._checkWin(mark);
    if (line) {
      this.over    = true;
      this.winner  = mark;
      this.winLine = line;
      if (mark === 'X') this.scores.x++;
      else              this.scores.o++;
    } else if (this.board.every(c => c != null)) {
      this.over   = true;
      this.winner = 'draw';
    } else {
      this.turn = this.turn === 'X' ? 'O' : 'X';
    }
    return true;
  }

  _checkWin(mark) {
    for (const line of WIN_LINES) {
      if (line.every(i => this.board[i] === mark)) return line;
    }
    return null;
  }

  serialize() {
    return {
      board:   [...this.board],
      turn:    this.turn,
      scores:  { ...this.scores },
      over:    this.over,
      winner:  this.winner,
      winLine: this.winLine ? [...this.winLine] : null,
    };
  }
}