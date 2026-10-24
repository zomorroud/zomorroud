'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sma, ema, rsi } = require('../src/indicators');

test('sma averages the trailing window', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 3), 4);
  assert.equal(sma([1, 2], 3), null);
});

test('ema equals the value for a constant series', () => {
  assert.equal(ema([5, 5, 5, 5, 5], 3), 5);
});

test('rsi is 100 for a rising series and 0 for a falling one', () => {
  const up = Array.from({ length: 20 }, (_, i) => i);
  assert.equal(rsi(up, 14), 100);
  assert.equal(rsi(up.slice().reverse(), 14), 0);
  assert.equal(rsi([1, 2], 14), null);
});
