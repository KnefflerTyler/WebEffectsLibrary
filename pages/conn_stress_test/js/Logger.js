// Logger.js — append timestamped lines to a log box element
export class Logger {
  constructor(boxId) {
    this._boxId = boxId;
  }

  log(msg, level = '') {
    const box = document.getElementById(this._boxId);
    if (!box) return;
    const line = document.createElement('div');
    line.className = 'log-line ' + level;
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = '[' + ts + '] ' + msg;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  info(msg)  { this.log(msg, 'info'); }
  ok(msg)    { this.log(msg, 'ok'); }
  warn(msg)  { this.log(msg, 'warn'); }
  error(msg) { this.log(msg, 'error'); }
  data(msg)  { this.log(msg, 'data'); }
}