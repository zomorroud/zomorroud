'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');
const { Engine } = require('../src/engine');
const { Market } = require('../src/market');

test('HTTP API places orders and reports state', async (t) => {
  const engine = new Engine({ market: new Market({ seed: 1 }) });
  const server = createServer(engine).listen(0);
  t.after(() => server.close());
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const order = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'AAPL', side: 'buy', qty: 10 }),
  });
  assert.equal(order.status, 201);

  const bad = await fetch(`${base}/api/orders`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'NOPE', side: 'buy', qty: 10 }),
  });
  assert.equal(bad.status, 400);

  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.account.positions[0].qty, 10);

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Day-Trader/);

  const escape = await fetch(`${base}/..%2fpackage.json`);
  assert.notEqual(escape.status, 200);
});
