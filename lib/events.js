'use strict';

// Custom module: one shared EventEmitter used across the application.
// server.js emits events, logger.js (and the request counter) listen to them.
//
//   request            { method, pathname }
//   response           { method, pathname, status }
//   user:registered    { id, prn }
//   validation:failed  { fields }

const { EventEmitter } = require('events');

module.exports = new EventEmitter();
