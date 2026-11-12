# Server-Side Validation Application using NodeJS

Web Technology (2304362L) | Practical No. 4 | T.Y. B.Tech | AY 2025-26

A user-registration server written with **NodeJS core modules only** (no
Express, no npm dependencies). The browser form has no client-side checks:
every rule is enforced on the server, which answers with proper HTTP status
codes.

## Requirements

Node.js 18 or newer (`node -v` to check). Nothing else to install.

## Setup and run

```bash
npm start            # starts the server on http://localhost:3000
npm test             # runs unit + integration tests (no server needed)
```

Open http://localhost:3000 in the browser. Use **Fill valid sample** /
**Fill invalid sample** and press Register to see the server response and
status code.

To use another port: `PORT=4000 npm start` (Windows PowerShell:
`$env:PORT=4000; npm start`).

## API

| Method | Path | Purpose | Status codes |
| --- | --- | --- | --- |
| GET | `/` | Registration page (static files streamed from `public/`) | 200, 403, 404 |
| POST | `/api/register` | Validate and register a user (JSON or form-urlencoded) | 201, 400, 409, 413, 415, 422 |
| GET | `/api/users` | List registered users (id, name, PRN, time) | 200 |
| GET | `/api/users/export` | Download the list as JSON (streamed) | 200 |
| GET | `/api/logs` | Stream the server log file | 200, 404 |
| GET | `/api/health` | Uptime, request count, Node version | 200 |

Status code meaning: **201** created, **400** malformed JSON, **409** email or
PRN already registered, **413** body larger than 10 KB, **415** wrong
content type, **422** validation failed (body lists every invalid field),
**405** wrong method (with `Allow` header), **404** unknown route.

### Try it with curl

```bash
# valid -> 201
curl -i -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Abhishek Patil","prn":"2024104005","email":"abhi@example.com","phone":"9876543210","age":21,"password":"Str0ng@Pass"}'

# invalid -> 422 with an errors object
curl -i -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"R2","prn":"12","email":"bad","phone":"123","age":9,"password":"weak"}'

# malformed JSON -> 400
curl -i -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" -d '{ not json'

curl http://localhost:3000/api/users
curl http://localhost:3000/api/health
```

(On Windows PowerShell use `curl.exe`, or use Postman / Thunder Client, or
just the web page.)

## Validation rules

| Field | Rule |
| --- | --- |
| fullName | Required, 3-40 chars, letters/space/. ' - only |
| prn | Required, 5-12 letters or digits |
| email | Required, valid format |
| phone | Required, 10 digits starting 6-9 |
| age | Required, whole number 16-100 |
| password | 8-64 chars with upper, lower, digit and special char |

Email and PRN must also be unique.

## NodeJS capabilities demonstrated

| Capability | Where |
| --- | --- |
| HTTP server, GET and POST routing | `server.js` (`http.createServer`) |
| Custom modules (`module.exports` / `require`) | `lib/validators.js`, `lib/storage.js`, `lib/events.js`, `lib/logger.js` |
| File system | `lib/storage.js` (`fs.promises`: read, write, rename), `logger.js` (`mkdirSync`, `openSync`) |
| Events | `lib/events.js` (EventEmitter); `server.js` emits `request`, `response`, `user:registered`, `validation:failed`; `logger.js` and a request counter listen |
| Streams | Request body read as a stream; `fs.createReadStream` for static files and logs; `fs.createWriteStream` for the log; `Readable.from` + `pipeline` for the export |
| crypto | Password hashing with `scrypt`, ids with `randomUUID` |

## Project structure

```
server.js              HTTP server, routes, handlers
lib/
  validators.js        pure validation rules (custom module)
  storage.js           users.json read/write (custom module)
  events.js            shared EventEmitter (custom module)
  logger.js            event listeners + log write stream (custom module)
public/
  index.html, style.css, app.js     browser UI
test/
  validators.test.js   unit tests
  api.test.js          integration tests (real HTTP requests)
data/users.json        created at run time (git-ignored)
logs/server.log        created at run time (git-ignored)
```

## Deploy on Render

1. Push this folder to a GitHub repository.
2. Render dashboard: **New +** > **Web Service** > pick the repository.
3. Settings: Runtime **Node**, Build Command `npm install`, Start Command
   `npm start`, Instance type **Free**.
4. Click **Create Web Service**. The URL appears at the top of the service page.

The server reads the `PORT` variable Render provides and listens on `0.0.0.0`.
Check the deployment at `https://<your-service>.onrender.com/api/health`.

Live URL: _add your deployed URL here_

## Limitations

- Data is stored in a JSON file. On Render's free plan the disk is not
  permanent, so users reset when the service restarts or redeploys.
- No login, sessions or rate limiting.
- The free Render service sleeps after inactivity, so the first request can
  take around a minute.
