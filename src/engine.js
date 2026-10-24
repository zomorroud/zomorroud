'use strict';

const { EventEmitter } = require('events');
const { Market } = require('./market');
const { Account } = require('./account');
const { CrossoverBot } = require('./strategy');
const { sma, rsi, sessionAverage } = require('./indicators');

// Ties the market, account and bots together. Emits 'tick' with a snapshot.
class Engine extends EventEmitter {
  constructor({ market, account, bot, maxDailyLoss = 5000 } = {}) {
    super();
    this.market = market || new Market();
    this.account = account || new Account();
    this.bot = bot || new CrossoverBot();
    this.maxDailyLoss = maxDailyLoss;
    this.botsEnabled = new Set();
    this.halted = false;
    this.prices = (symbol) => this.market.price(symbol);
  }

  placeOrder({ symbol, side, qty, source = 'manual' }) {
    if (this.halted) throw new Error('Trading halted: daily loss limit reached');
    if (!this.market.has(symbol)) throw new Error(`Unknown symbol: ${symbol}`);
    return this.account.execute({
      symbol,
      side,
      qty,
      price: this.market.price(symbol),
      prices: this.prices,
      source,
    });
  }

  flatten() {
    return this.account.flatten(this.prices);
  }

  setBot(symbol, enabled) {
    if (!this.market.has(symbol)) throw new Error(`Unknown symbol: ${symbol}`);
    if (enabled) this.botsEnabled.add(symbol);
    else this.botsEnabled.delete(symbol);
  }

  reset() {
    this.account.reset();
    this.halted = false;
  }

  tick() {
    this.market.tick();
    if (!this.halted) {
      for (const symbol of this.botsEnabled) {
        const order = this.bot.decide(this.market.history(symbol), this.account.position(symbol).qty);
        if (!order) continue;
        try {
          this.placeOrder({ symbol, ...order, source: 'bot' });
        } catch (err) {
          this.emit('warning', `${symbol} bot order rejected: ${err.message}`);
        }
      }
      this.enforceRisk();
    }
    const snapshot = this.snapshot();
    this.emit('tick', snapshot);
    return snapshot;
  }

  // Flattens everything and halts trading once the day's loss limit is hit.
  enforceRisk() {
    const { dayPnl } = this.account.summary(this.prices);
    if (this.maxDailyLoss > 0 && dayPnl <= -this.maxDailyLoss) {
      this.account.flatten(this.prices, 'risk');
      this.halted = true;
      this.botsEnabled.clear();
      this.emit('warning', 'Daily loss limit reached: positions flattened, trading halted');
    }
  }

  indicators(symbol) {
    const history = this.market.history(symbol);
    const round = (v) => (v == null ? null : Math.round(v * 100) / 100);
    return {
      smaFast: round(sma(history, this.bot.fast)),
      smaSlow: round(sma(history, this.bot.slow)),
      rsi: round(rsi(history, 14)),
      sessionAvg: round(sessionAverage(history)),
    };
  }

  snapshot() {
    return {
      tick: this.market.tickCount,
      halted: this.halted,
      maxDailyLoss: this.maxDailyLoss,
      bot: { fast: this.bot.fast, slow: this.bot.slow, size: this.bot.size },
      botsEnabled: [...this.botsEnabled],
      quotes: this.market.quotes().map((q) => ({ ...q, ...this.indicators(q.symbol) })),
      account: this.account.summary(this.prices),
      trades: this.account.trades.slice(-50).reverse(),
    };
  }
}

module.exports = { Engine };
