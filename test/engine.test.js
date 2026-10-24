'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Market } = require('../src/market');
const { Engine } = require('../src/engine');
const { CrossoverBot } = require('../src/strategy');

test('market is reproducible with a seed and keeps bounded history', () => {
  const a = new Market({ seed: 42, historySize: 50 });
  const b = new Market({ seed: 42, historySize: 50 });
  for (let i = 0; i < 100; i++) {
    a.tick();
    b.tick();
  }
  assert.deepEqual(a.quotes(), b.quotes());
  assert.equal(a.history('AAPL').length, 50);
});

test('crossover bot signals on crosses', () => {
  const bot = new CrossoverBot({ fast: 2, slow: 4, size: 10 });
  const falling = [10, 9, 8, 7, 6, 5];
  assert.deepEqual(bot.decide([...falling, 9], 0), { side: 'buy', qty: 10 });
  const rising = [5, 6, 7, 8, 9, 10];
  assert.deepEqual(bot.decide([...rising, 6], 10), { side: 'sell', qty: 20 });
  assert.equal(bot.decide(rising, 0), null);
});

test('engine runs bots and halts at the daily loss limit', () => {
  const engine = new Engine({
    market: new Market({ seed: 7, symbols: [{ symbol: 'X', price: 100, volatility: 3 }] }),
    bot: new CrossoverBot({ fast: 2, slow: 5, size: 1000 }),
    maxDailyLoss: 500,
  });
  engine.setBot('X', true);
  for (let i = 0; i < 2000 && !engine.halted; i++) engine.tick();
  assert.ok(engine.account.trades.some((t) => t.source === 'bot'));
  assert.ok(engine.halted, 'expected the loss limit to trigger');
  assert.equal(engine.account.positions.size, 0);
  assert.throws(() => engine.placeOrder({ symbol: 'X', side: 'buy', qty: 1 }), /halted/);
  engine.reset();
  assert.equal(engine.halted, false);
});
