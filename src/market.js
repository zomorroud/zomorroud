'use strict';

const { createRng } = require('./random');

const DEFAULT_SYMBOLS = [
  { symbol: 'AAPL', price: 190, volatility: 0.25 },
  { symbol: 'MSFT', price: 410, volatility: 0.22 },
  { symbol: 'TSLA', price: 240, volatility: 0.6 },
  { symbol: 'NVDA', price: 120, volatility: 0.5 },
  { symbol: 'AMZN', price: 180, volatility: 0.3 },
];

const round2 = (n) => Math.round(n * 100) / 100;

// Simulated market: each tick moves every symbol by geometric Brownian motion.
// `dt` is the fraction of a year per tick; the default compresses a trading
// day into a few minutes so moves are visible on a dashboard.
class Market {
  constructor({ symbols = DEFAULT_SYMBOLS, seed, historySize = 600, dt = 1 / (252 * 60) } = {}) {
    this.rng = createRng(seed);
    this.historySize = historySize;
    this.dt = dt;
    this.tickCount = 0;
    this.instruments = new Map();
    for (const s of symbols) {
      this.instruments.set(s.symbol, {
        symbol: s.symbol,
        volatility: s.volatility,
        drift: s.drift || 0,
        open: s.price,
        high: s.price,
        low: s.price,
        price: s.price,
        history: [s.price],
      });
    }
  }

  symbols() {
    return [...this.instruments.keys()];
  }

  has(symbol) {
    return this.instruments.has(symbol);
  }

  price(symbol) {
    const inst = this.instruments.get(symbol);
    if (!inst) throw new Error(`Unknown symbol: ${symbol}`);
    return inst.price;
  }

  history(symbol) {
    const inst = this.instruments.get(symbol);
    if (!inst) throw new Error(`Unknown symbol: ${symbol}`);
    return inst.history.slice();
  }

  tick() {
    const { dt } = this;
    for (const inst of this.instruments.values()) {
      const sigma = inst.volatility;
      const shock = (inst.drift - (sigma * sigma) / 2) * dt + sigma * Math.sqrt(dt) * this.rng.normal();
      inst.price = Math.max(0.01, round2(inst.price * Math.exp(shock)));
      inst.high = Math.max(inst.high, inst.price);
      inst.low = Math.min(inst.low, inst.price);
      inst.history.push(inst.price);
      if (inst.history.length > this.historySize) inst.history.shift();
    }
    this.tickCount++;
    return this.quotes();
  }

  quotes() {
    return [...this.instruments.values()].map((i) => ({
      symbol: i.symbol,
      price: i.price,
      open: i.open,
      high: i.high,
      low: i.low,
      change: round2(i.price - i.open),
      changePct: round2(((i.price - i.open) / i.open) * 100),
    }));
  }
}

module.exports = { Market, DEFAULT_SYMBOLS };
