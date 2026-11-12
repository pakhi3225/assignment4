'use strict';

const form = document.getElementById('regForm');
const statusEl = document.getElementById('status');
const output = document.getElementById('output');

function show(status, body) {
  statusEl.textContent = `HTTP ${status}`;
  statusEl.className = 'status ' + (status < 300 ? 'ok' : 'bad');
  output.textContent = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
}

function clearErrors() {
  document.querySelectorAll('.err').forEach((el) => (el.textContent = ''));
}

async function call(url, options) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let body = text;
    try { body = JSON.parse(text); } catch { /* plain text, e.g. logs */ }
    show(res.status, body);
    return { res, body };
  } catch (err) {
    show(0, 'Network error: ' + err.message);
    return null;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  const payload = Object.fromEntries(new FormData(form));

  const result = await call('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!result) return;

  const { res, body } = result;
  if (body && body.errors) {
    for (const [field, message] of Object.entries(body.errors)) {
      const el = document.querySelector('[data-err="' + field + '"]');
      if (el) el.textContent = message;
    }
  }
  if (res.status === 201) form.reset();
});

function fill(values) {
  clearErrors();
  for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
}

document.getElementById('fillValid').addEventListener('click', () => {
  const n = Math.floor(1000 + Math.random() * 9000);
  fill({
    fullName: 'Abhishek Patil',
    prn: '2024' + n + '0050',
    email: `student${n}@example.com`,
    phone: '9876543210',
    age: '21',
    password: 'Str0ng@Pass',
  });
});

document.getElementById('fillInvalid').addEventListener('click', () =>
  fill({
    fullName: 'R2',
    prn: '12',
    email: 'not-an-email',
    phone: '12345',
    age: '9',
    password: 'weak',
  })
);

document.getElementById('btnUsers').addEventListener('click', () => call('/api/users'));
document.getElementById('btnHealth').addEventListener('click', () => call('/api/health'));
document.getElementById('btnLogs').addEventListener('click', () => call('/api/logs'));
