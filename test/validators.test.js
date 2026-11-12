'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRegistration,
  checkName,
  checkPrn,
  checkEmail,
  checkPhone,
  checkAge,
  checkPassword,
} = require('../lib/validators');

test('name rules', () => {
  assert.notEqual(checkName(''), '');
  assert.notEqual(checkName('Ab'), '');
  assert.notEqual(checkName('R2D2'), '');
  assert.equal(checkName('Abhishek Patil'), '');
});

test('prn rules', () => {
  assert.notEqual(checkPrn('12'), '');
  assert.notEqual(checkPrn('ABC-12345'), '');
  assert.equal(checkPrn('2024104005'), '');
});

test('email, phone and age rules', () => {
  assert.notEqual(checkEmail('abc'), '');
  assert.equal(checkEmail('a@b.com'), '');
  assert.notEqual(checkPhone('5123456789'), '');
  assert.equal(checkPhone('9876543210'), '');
  assert.notEqual(checkAge('12'), '');
  assert.notEqual(checkAge('20.5'), '');
  assert.equal(checkAge('21'), '');
});

test('password rules', () => {
  assert.notEqual(checkPassword('short'), '');
  assert.notEqual(checkPassword('alllowercase1!'), '');
  assert.notEqual(checkPassword('NoDigits!!'), '');
  assert.notEqual(checkPassword('NoSpecial12'), '');
  assert.equal(checkPassword('Str0ng@Pass'), '');
});

test('validateRegistration normalises valid data', () => {
  const r = validateRegistration({
    fullName: ' Abhishek Patil ',
    prn: 'ab12345',
    email: 'Abhi@Example.COM',
    phone: '9876543210',
    age: 21,
    password: 'Str0ng@Pass',
  });
  assert.equal(r.valid, true);
  assert.equal(r.clean.prn, 'AB12345');
  assert.equal(r.clean.email, 'abhi@example.com');
  assert.equal(r.clean.age, 21);
});

test('validateRegistration lists every invalid field', () => {
  const r = validateRegistration({});
  assert.equal(r.valid, false);
  assert.deepEqual(Object.keys(r.errors).sort(), [
    'age', 'email', 'fullName', 'password', 'phone', 'prn',
  ]);
});

test('validateRegistration rejects non-object bodies', () => {
  assert.equal(validateRegistration(null).valid, false);
  assert.equal(validateRegistration([1, 2]).valid, false);
  assert.equal(validateRegistration('text').valid, false);
});
