'use strict';

const { sma } = require('./indicators');

// SMA-crossover bot: long when the fast average crosses above the slow one,
// short when it crosses below. Holds at most `size` shares either way.
class CrossoverBot {
  constructor({ fast = 10, slow = 30, size = 100, allowShort = true } = {}) {
    if (fast >= slow) throw new Error('fast period must be shorter than slow period');
    this.fast = fast;
    this.slow = slow;
    this.size = size;
    this.allowShort = allowShort;
  }

  // Returns 1 (fast crossed above slow), -1 (crossed below) or 0.
  signal(history) {
    if (history.length < this.slow + 1) return 0;
    const prev = history.slice(0, -1);
    const prevDiff = sma(prev, this.fast) - sma(prev, this.slow);
    const diff = sma(history, this.fast) - sma(history, this.slow);
    if (prevDiff <= 0 && diff > 0) return 1;
    if (prevDiff >= 0 && diff < 0) return -1;
    return 0;
  }

  // Returns the order needed to reach the target position, or null.
  decide(history, currentQty) {
    const sig = this.signal(history);
    if (sig === 0) return null;
    const target = sig > 0 ? this.size : this.allowShort ? -this.size : 0;
    const delta = target - currentQty;
    if (delta === 0) return null;
    return { side: delta > 0 ? 'buy' : 'sell', qty: Math.abs(delta) };
  }
}

module.exports = { CrossoverBot };
