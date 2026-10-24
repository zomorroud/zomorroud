'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const { build } = require('../scripts/build-web');

test('browser bundle runs the engine without Node modules', () => {
  const sandbox = { window: {}, Date, Math };
  vm.runInNewContext(fs.readFileSync(build(), 'utf8'), sandbox);
  const engine = new sandbox.window.DayTrader.Engine();
  const warnings = [];
  engine.on('warning', (m) => warnings.push(m));
  engine.placeOrder({ symbol: 'AAPL', side: 'buy', qty: 10 });
  const snapshot = engine.tick();
  assert.equal(snapshot.account.positions[0].qty, 10);
  assert.equal(snapshot.tick, 1);
});
