'use strict';

// Custom module: listens to application events and appends one line per event
// to logs/server.log using a writable stream (fs.createWriteStream).

const fs = require('fs');
const path = require('path');
const events = require('./events');

let stream = null;
let initialised = false;

const logDir = () => process.env.LOG_DIR || path.join(__dirname, '..', 'logs');
const logFilePath = () => path.join(logDir(), 'server.log');

function getStream() {
  if (!stream) {
    fs.mkdirSync(logDir(), { recursive: true });
    stream = fs.createWriteStream(logFilePath(), { flags: 'a' });
  }
  return stream;
}

function write(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  getStream().write(line);
  if (process.env.NODE_ENV !== 'test') process.stdout.write(line);
}

function init() {
  if (initialised) return;
  initialised = true;

  // make sure the file exists so /api/logs can always stream it
  fs.mkdirSync(logDir(), { recursive: true });
  fs.closeSync(fs.openSync(logFilePath(), 'a'));

  events.on('response', ({ method, pathname, status }) =>
    write(`${method} ${pathname} -> ${status}`)
  );
  events.on('user:registered', ({ id, prn }) =>
    write(`EVENT user:registered id=${id} prn=${prn}`)
  );
  events.on('validation:failed', ({ fields }) =>
    write(`EVENT validation:failed fields=${fields.join(',')}`)
  );
}

function close() {
  return new Promise((resolve) => {
    if (!stream) return resolve();
    const s = stream;
    stream = null;
    s.end(resolve);
  });
}

module.exports = { init, close, logFilePath };
