import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuantityInput, sanitizeQuantityInput } from '../src/utils/quantity';

describe('sanitizeQuantityInput', () => {
  test('keeps whole numbers', () => assert.equal(sanitizeQuantityInput('12'), '12'));

  test('accepts comma or dot as decimal separator and shows a comma', () => {
    assert.equal(sanitizeQuantityInput('0,485'), '0,485');
    assert.equal(sanitizeQuantityInput('0.485'), '0,485');
  });

  test('keeps a trailing separator so the user can keep typing', () => {
    assert.equal(sanitizeQuantityInput('1,'), '1,');
    assert.equal(sanitizeQuantityInput('1.'), '1,');
  });

  test('drops letters and signs, and a second separator', () => {
    assert.equal(sanitizeQuantityInput('a1b-2'), '12');
    assert.equal(sanitizeQuantityInput('1,2,3'), '1,23');
  });

  test('limits decimals to 3 and the integer part to 4 digits', () => {
    assert.equal(sanitizeQuantityInput('1,23456'), '1,234');
    assert.equal(sanitizeQuantityInput('123456'), '1234');
  });

  test('empty stays empty', () => assert.equal(sanitizeQuantityInput(''), ''));
});

describe('parseQuantityInput', () => {
  test('parses integers and decimals', () => {
    assert.equal(parseQuantityInput('3'), 3);
    assert.equal(parseQuantityInput('0,485'), 0.485);
    assert.equal(parseQuantityInput('1,'), 1);
  });

  test('rejects empty, zero and nonsense', () => {
    assert.equal(parseQuantityInput(''), null);
    assert.equal(parseQuantityInput(','), null);
    assert.equal(parseQuantityInput('0'), null);
    assert.equal(parseQuantityInput('0,000'), null);
  });
});
