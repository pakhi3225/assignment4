'use strict';

// Custom module: file-system storage (fs.promises) for registered users.
// Users are kept in data/users.json. Writes go through a queue so two
// simultaneous registrations cannot overwrite each other.

const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const dataDir = () => process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dataFile = () => path.join(dataDir(), 'users.json');

async function readUsers() {
  try {
    const text = await fsp.readFile(dataFile(), 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return []; // first run, no file yet
    throw err;
  }
}

async function writeUsers(users) {
  await fsp.mkdir(dataDir(), { recursive: true });
  const tmp = dataFile() + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(users, null, 2), 'utf8');
  await fsp.rename(tmp, dataFile()); // atomic replace
}

let queue = Promise.resolve();

/** Add a user. Rejects with err.code === 'DUPLICATE' and err.field if the
 *  email or PRN is already registered. */
function addUser(user) {
  const run = queue.then(async () => {
    const users = await readUsers();
    const clash = users.find((u) => u.email === user.email)
      ? 'email'
      : users.find((u) => u.prn === user.prn)
      ? 'prn'
      : null;
    if (clash) {
      const err = new Error(`${clash} already registered`);
      err.code = 'DUPLICATE';
      err.field = clash;
      throw err;
    }
    users.push(user);
    await writeUsers(users);
    return user;
  });
  queue = run.catch(() => {}); // keep the queue alive after a failure
  return run;
}

module.exports = { readUsers, addUser, dataFile };
