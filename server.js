'use strict';


const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { Readable, pipeline } = require('stream');

const { validateRegistration } = require('./lib/validators');
const storage = require('./lib/storage');
const events = require('./lib/events');
const logger = require('./lib/logger');

logger.init();

const scrypt = promisify(crypto.scrypt);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 10 * 1024; // 10 KB is plenty for this form
const startedAt = Date.now();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

// ---- events: a second listener that counts requests ----
let requestCount = 0;
events.on('request', () => {
  requestCount += 1;
});

// ---------------------------------------------------------------- helpers

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

// The request object is a readable stream: collect its chunks, but stop
// storing data once the size limit is passed and answer 413 at the end.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return; // keep draining, do not store
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(httpError(413, `Payload too large (limit ${MAX_BODY_BYTES} bytes).`));
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', reject);
  });
}

function parseBody(raw, contentType) {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();

  if (type === 'application/json') {
    try {
      return JSON.parse(raw);
    } catch {
      throw httpError(400, 'Malformed JSON in request body.');
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  throw httpError(
    415,
    'Unsupported Media Type. Use application/json or application/x-www-form-urlencoded.'
  );
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

// What the public listing / export shows (no email, phone or password data).
const summary = (u) => ({
  id: u.id,
  fullName: u.fullName,
  prn: u.prn,
  registeredAt: u.registeredAt,
});

// ---------------------------------------------------------------- handlers

function health(req, res) {
  sendJson(res, 200, {
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requestsHandled: requestCount,
    node: process.version,
  });
}

async function register(req, res) {
  const raw = await readBody(req);
  const data = parseBody(raw, req.headers['content-type']);

  const { valid, errors, clean } = validateRegistration(data);
  if (!valid) {
    events.emit('validation:failed', { fields: Object.keys(errors) });
    return sendJson(res, 422, {
      success: false,
      message: 'Validation failed.',
      errors,
    });
  }

  const { password, ...profile } = clean;
  const user = {
    id: crypto.randomUUID(),
    ...profile,
    passwordHash: await hashPassword(password),
    registeredAt: new Date().toISOString(),
  };

  try {
    await storage.addUser(user);
  } catch (err) {
    if (err.code === 'DUPLICATE') {
      return sendJson(res, 409, {
        success: false,
        message: 'User already exists.',
        errors: { [err.field]: `This ${err.field} is already registered.` },
      });
    }
    throw err;
  }

  events.emit('user:registered', { id: user.id, prn: user.prn });
  sendJson(res, 201, {
    success: true,
    message: 'Registration successful.',
    user: {
      id: user.id,
      fullName: user.fullName,
      prn: user.prn,
      email: user.email,
      registeredAt: user.registeredAt,
    },
  });
}

async function listUsers(req, res) {
  const users = await storage.readUsers();
  sendJson(res, 200, { count: users.length, users: users.map(summary) });
}

// Streams a JSON array chunk by chunk: Readable.from(generator) -> response.
async function exportUsers(req, res) {
  const users = (await storage.readUsers()).map(summary);

  function* chunks() {
    yield '[\n';
    for (let i = 0; i < users.length; i++) {
      yield '  ' + JSON.stringify(users[i]) + (i < users.length - 1 ? ',' : '') + '\n';
    }
    yield ']\n';
  }

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': 'attachment; filename="students.json"',
  });
  pipeline(Readable.from(chunks()), res, (err) => {
    if (err) console.error('Export stream error:', err.message);
  });
}

// Streams the log file to the client with fs.createReadStream.
async function streamLogs(req, res) {
  const file = logger.logFilePath();
  try {
    await fs.promises.stat(file);
  } catch {
    throw httpError(404, 'No log file yet.');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  pipeline(fs.createReadStream(file), res, (err) => {
    if (err) console.error('Log stream error:', err.message);
  });
}

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    throw httpError(400, 'Bad URL encoding.');
  }
  if (rel.includes('\0')) throw httpError(400, 'Bad path.');
  if (rel === '/') rel = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  // block path traversal such as /..%2f..%2fpackage.json
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    throw httpError(403, 'Forbidden.');
  }

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    throw httpError(404, 'Not found.');
  }
  if (!stat.isFile()) throw httpError(404, 'Not found.');

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'Content-Length': stat.size,
    'X-Content-Type-Options': 'nosniff',
  });
  pipeline(fs.createReadStream(filePath), res, (err) => {
    if (err) console.error('Static stream error:', err.message);
  });
}

// ---------------------------------------------------------------- routing

const routes = {
  '/api/health': { GET: health },
  '/api/register': { POST: register },
  '/api/users': { GET: listUsers },
  '/api/users/export': { GET: exportUsers },
  '/api/logs': { GET: streamLogs },
};

async function handle(req, res) {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const method = req.method;

    events.emit('request', { method, pathname });
    res.on('finish', () =>
      events.emit('response', { method, pathname, status: res.statusCode })
    );

    const route = routes[pathname];
    if (route) {
      const handler = route[method];
      if (!handler) {
        return sendJson(
          res,
          405,
          { success: false, message: `Method ${method} not allowed on ${pathname}.` },
          { Allow: Object.keys(route).join(', ') }
        );
      }
      return await handler(req, res);
    }

    if (pathname.startsWith('/api/')) {
      throw httpError(404, `No API route for ${pathname}.`);
    }
    if (method !== 'GET') {
      return sendJson(
        res,
        405,
        { success: false, message: `Method ${method} not allowed.` },
        { Allow: 'GET' }
      );
    }
    return await serveStatic(req, res, pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (res.headersSent) return res.end();
    sendJson(res, status, {
      success: false,
      message: status === 500 ? 'Internal server error.' : err.message,
    });
  }
}

function createServer() {
  return http.createServer(handle);
}

module.exports = { createServer };

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  createServer().listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}
