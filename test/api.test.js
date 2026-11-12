'use strict';

// Integration tests: start the real server on a random port and send real
// HTTP requests. Data and logs go to a temp folder, not the project folder.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.LOG_DIR = path.join(tmp, 'logs');
process.env.NODE_ENV = 'test';

const { createServer } = require('../server');
const logger = require('../lib/logger');

const validUser = {
  fullName: 'Abhishek Patil',
  prn: '2024104005',
  email: 'abhi@example.com',
  phone: '9876543210',
  age: 21,
  password: 'Str0ng@Pass',
};

let server;
let base;

const postJson = (body, url = '/api/register') =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test.before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await logger.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('GET /api/health returns 200', async () => {
  const res = await fetch(base + '/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('POST valid registration returns 201 and hides the password', async () => {
  const res = await postJson(validUser);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.user.prn, '2024104005');
  assert.equal(JSON.stringify(body).includes('Str0ng'), false);
  assert.equal('passwordHash' in body.user, false);
});

test('password is stored hashed, never as plain text', async () => {
  const text = fs.readFileSync(path.join(process.env.DATA_DIR, 'users.json'), 'utf8');
  assert.equal(text.includes('Str0ng@Pass'), false);
  assert.match(text, /passwordHash/);
});

test('duplicate email returns 409', async () => {
  const res = await postJson({ ...validUser, prn: 'OTHER12345' });
  assert.equal(res.status, 409);
  assert.ok((await res.json()).errors.email);
});

test('duplicate PRN returns 409', async () => {
  const res = await postJson({ ...validUser, email: 'new@example.com' });
  assert.equal(res.status, 409);
  assert.ok((await res.json()).errors.prn);
});

test('invalid data returns 422 with a message per field', async () => {
  const res = await postJson({
    fullName: 'R2',
    prn: '12',
    email: 'bad',
    phone: '123',
    age: 9,
    password: 'weak',
  });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(Object.keys(body.errors).length, 6);
});

test('empty JSON object returns 422', async () => {
  const res = await postJson({});
  assert.equal(res.status, 422);
});

test('malformed JSON returns 400', async () => {
  const res = await fetch(base + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ not json',
  });
  assert.equal(res.status, 400);
});

test('unsupported content type returns 415', async () => {
  const res = await fetch(base + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'hello',
  });
  assert.equal(res.status, 415);
});

test('oversized body returns 413', async () => {
  const res = await postJson({ ...validUser, fullName: 'A'.repeat(20000) });
  assert.equal(res.status, 413);
});

test('form-urlencoded registration works', async () => {
  const res = await fetch(base + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      fullName: 'Form User',
      prn: 'FORM12345',
      email: 'form@example.com',
      phone: '9123456780',
      age: '22',
      password: 'Another#Pass1',
    }).toString(),
  });
  assert.equal(res.status, 201);
});

test('GET /api/users lists users without email or phone', async () => {
  const res = await fetch(base + '/api/users');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 2);
  assert.equal('email' in body.users[0], false);
  assert.equal('phone' in body.users[0], false);
});

test('GET /api/users/export streams a JSON array download', async () => {
  const res = await fetch(base + '/api/users/export');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const data = JSON.parse(await res.text());
  assert.equal(Array.isArray(data), true);
  assert.equal(data.length, 2);
});

test('GET /api/logs streams the log file', async () => {
  const res = await fetch(base + '/api/logs');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
});

test('wrong method returns 405 with an Allow header', async () => {
  const res = await fetch(base + '/api/register');
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
});

test('unknown API route returns 404 JSON', async () => {
  const res = await fetch(base + '/api/nothing');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).success, false);
});

test('GET / serves the HTML page', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('path traversal is blocked', async () => {
  const res = await fetch(base + '/..%2f..%2fpackage.json');
  assert.equal(res.status, 403);
});
