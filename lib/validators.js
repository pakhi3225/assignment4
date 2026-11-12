'use strict';

// Custom module: server-side validation rules for the registration form.
// Every check returns "" when the value is valid, or an error message.
// The functions are pure (no I/O), so they are easy to unit test.

const NAME_RE = /^[A-Za-z][A-Za-z .'-]*$/;
const PRN_RE = /^[A-Za-z0-9]{5,12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/;

// Accept strings and numbers (JSON clients may send age as a number).
const asText = (v) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';

function checkName(v) {
  if (!v) return 'Full name is required.';
  if (v.length < 3 || v.length > 40) return 'Full name must be 3-40 characters.';
  if (!NAME_RE.test(v))
    return "Full name can contain only letters, spaces, . ' and -.";
  return '';
}

function checkPrn(v) {
  if (!v) return 'PRN is required.';
  if (!PRN_RE.test(v)) return 'PRN must be 5-12 letters or digits.';
  return '';
}

function checkEmail(v) {
  if (!v) return 'Email is required.';
  if (!EMAIL_RE.test(v)) return 'Enter a valid email, e.g. name@example.com.';
  return '';
}

function checkPhone(v) {
  if (!v) return 'Phone number is required.';
  if (!PHONE_RE.test(v))
    return 'Phone must be 10 digits and start with 6, 7, 8 or 9.';
  return '';
}

function checkAge(v) {
  if (!v) return 'Age is required.';
  if (!/^\d+$/.test(v)) return 'Age must be a whole number.';
  const n = Number(v);
  if (n < 16 || n > 100) return 'Age must be between 16 and 100.';
  return '';
}

function checkPassword(v) {
  if (typeof v !== 'string' || !v) return 'Password is required.';
  if (v.length < 8) return 'Password must be at least 8 characters.';
  if (v.length > 64) return 'Password must be at most 64 characters.';
  if (!/[A-Z]/.test(v)) return 'Password needs an uppercase letter.';
  if (!/[a-z]/.test(v)) return 'Password needs a lowercase letter.';
  if (!/\d/.test(v)) return 'Password needs a digit.';
  if (!/[^A-Za-z0-9]/.test(v)) return 'Password needs a special character.';
  return '';
}

/**
 * Validate a registration payload.
 * @returns {{valid: boolean, errors: object, clean: object|null}}
 *   errors: { field: message } (only invalid fields)
 *   clean:  normalised data (trimmed, email lower-cased, PRN upper-cased)
 */
function validateRegistration(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: { body: 'Request body must be an object of fields.' },
      clean: null,
    };
  }

  const fullName = asText(input.fullName);
  const prn = asText(input.prn);
  const email = asText(input.email);
  const phone = asText(input.phone);
  const age = asText(input.age);
  const password = typeof input.password === 'string' ? input.password : '';

  const checks = {
    fullName: checkName(fullName),
    prn: checkPrn(prn),
    email: checkEmail(email),
    phone: checkPhone(phone),
    age: checkAge(age),
    password: checkPassword(password),
  };

  const errors = {};
  for (const [field, message] of Object.entries(checks)) {
    if (message) errors[field] = message;
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
    clean: valid
      ? {
          fullName,
          prn: prn.toUpperCase(),
          email: email.toLowerCase(),
          phone,
          age: Number(age),
          password,
        }
      : null,
  };
}

module.exports = {
  validateRegistration,
  checkName,
  checkPrn,
  checkEmail,
  checkPhone,
  checkAge,
  checkPassword,
};
