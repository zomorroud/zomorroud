'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Account } = require('../src/account');

const fixed = (map) => (symbol) => map[symbol];

test('round trip long trade realizes profit', () => {
  const acct = new Account({ startingCash: 10000 });
  const prices = fixed({ X: 10 });
  acct.execute({ symbol: 'X', side: 'buy', qty: 100, price: 10, prices });
  acct.execute({ symbol: 'X', side: 'sell', qty: 100, price: 12, prices });
  assert.equal(acct.realizedPnl, 200);
  assert.equal(acct.cash, 10200);
  assert.equal(acct.positions.size, 0);
});

test('averages cost when adding to a position', () => {
  const acct = new Account();
  const prices = fixed({ X: 10 });
  acct.execute({ symbol: 'X', side: 'buy', qty: 100, price: 10, prices });
  acct.execute({ symbol: 'X', side: 'buy', qty: 100, price: 20, prices });
  assert.deepEqual(acct.position('X'), { qty: 200, avgCost: 15 });
});

test('short trade profits when price falls and flips correctly', () => {
  const acct = new Account();
  const prices = fixed({ X: 50 });
  acct.execute({ symbol: 'X', side: 'sell', qty: 10, price: 50, prices });
  acct.execute({ symbol: 'X', side: 'buy', qty: 30, price: 40, prices });
  assert.equal(acct.realizedPnl, 100);
  assert.deepEqual(acct.position('X'), { qty: 20, avgCost: 40 });
});

test('rejects orders beyond intraday buying power', () => {
  const acct = new Account({ startingCash: 1000, leverage: 4 });
  const prices = fixed({ X: 10 });
  acct.execute({ symbol: 'X', side: 'buy', qty: 400, price: 10, prices });
  assert.throws(() => acct.execute({ symbol: 'X', side: 'buy', qty: 1, price: 10, prices }), /buying power/);
  // Reducing exposure is always allowed.
  acct.execute({ symbol: 'X', side: 'sell', qty: 400, price: 10, prices });
});

test('validates order input', () => {
  const acct = new Account();
  const prices = fixed({ X: 10 });
  assert.throws(() => acct.execute({ symbol: 'X', side: 'hold', qty: 1, price: 10, prices }));
  assert.throws(() => acct.execute({ symbol: 'X', side: 'buy', qty: 1.5, price: 10, prices }));
  assert.throws(() => acct.execute({ symbol: 'X', side: 'buy', qty: 0, price: 10, prices }));
});

test('flatten closes all positions', () => {
  const acct = new Account();
  const prices = fixed({ X: 10, Y: 20 });
  acct.execute({ symbol: 'X', side: 'buy', qty: 5, price: 10, prices });
  acct.execute({ symbol: 'Y', side: 'sell', qty: 5, price: 20, prices });
  acct.flatten(prices);
  assert.equal(acct.positions.size, 0);
  assert.equal(acct.summary(prices).equity, acct.startingCash);
});
