'use strict';

const round2 = (n) => Math.round(n * 100) / 100;

// Paper-trading account supporting long and short positions with
// pattern-day-trader style intraday buying power (equity * leverage).
class Account {
  constructor({ startingCash = 100000, leverage = 4, commission = 0 } = {}) {
    this.startingCash = startingCash;
    this.leverage = leverage;
    this.commission = commission;
    this.reset();
  }

  reset() {
    this.cash = this.startingCash;
    this.realizedPnl = 0;
    this.positions = new Map(); // symbol -> { qty (signed), avgCost }
    this.trades = [];
    this.nextTradeId = 1;
  }

  position(symbol) {
    return this.positions.get(symbol) || { qty: 0, avgCost: 0 };
  }

  marketValue(prices) {
    let value = 0;
    for (const [symbol, pos] of this.positions) value += pos.qty * prices(symbol);
    return value;
  }

  grossExposure(prices) {
    let value = 0;
    for (const [symbol, pos] of this.positions) value += Math.abs(pos.qty * prices(symbol));
    return value;
  }

  equity(prices) {
    return this.cash + this.marketValue(prices);
  }

  buyingPower(prices) {
    return Math.max(0, this.equity(prices) * this.leverage - this.grossExposure(prices));
  }

  // Executes a market order immediately at `price`. `side` is 'buy' or 'sell'.
  execute({ symbol, side, qty, price, prices, source = 'manual', time = Date.now() }) {
    if (side !== 'buy' && side !== 'sell') throw new Error('side must be "buy" or "sell"');
    if (!Number.isInteger(qty) || qty <= 0) throw new Error('qty must be a positive integer');
    if (!(price > 0)) throw new Error('price must be positive');

    const delta = side === 'buy' ? qty : -qty;
    const pos = this.position(symbol);
    const newQty = pos.qty + delta;

    // Only orders that increase exposure in a symbol consume buying power.
    const addedExposure = Math.max(0, Math.abs(newQty) - Math.abs(pos.qty)) * price;
    if (addedExposure > 0 && addedExposure + this.commission > this.buyingPower(prices)) {
      throw new Error('Insufficient buying power');
    }

    let realized = 0;
    let avgCost = pos.avgCost;
    if (pos.qty === 0 || Math.sign(pos.qty) === Math.sign(delta)) {
      avgCost = (pos.qty * pos.avgCost + delta * price) / newQty;
    } else {
      const closed = Math.min(Math.abs(delta), Math.abs(pos.qty));
      realized = closed * (price - pos.avgCost) * Math.sign(pos.qty);
      if (Math.sign(newQty) !== Math.sign(pos.qty) && newQty !== 0) avgCost = price; // flipped
    }
    realized -= this.commission;

    this.cash = round2(this.cash - delta * price - this.commission);
    this.realizedPnl = round2(this.realizedPnl + realized);
    if (newQty === 0) this.positions.delete(symbol);
    else this.positions.set(symbol, { qty: newQty, avgCost: round2(avgCost) });

    const trade = {
      id: this.nextTradeId++,
      time,
      symbol,
      side,
      qty,
      price,
      realizedPnl: round2(realized),
      source,
    };
    this.trades.push(trade);
    return trade;
  }

  // Closes every open position at current prices (end-of-day flatten).
  flatten(prices, source = 'flatten') {
    const fills = [];
    for (const [symbol, pos] of [...this.positions]) {
      fills.push(
        this.execute({
          symbol,
          side: pos.qty > 0 ? 'sell' : 'buy',
          qty: Math.abs(pos.qty),
          price: prices(symbol),
          prices,
          source,
        })
      );
    }
    return fills;
  }

  summary(prices) {
    const positions = [...this.positions].map(([symbol, pos]) => {
      const price = prices(symbol);
      return {
        symbol,
        qty: pos.qty,
        avgCost: pos.avgCost,
        price,
        marketValue: round2(pos.qty * price),
        unrealizedPnl: round2(pos.qty * (price - pos.avgCost)),
      };
    });
    const unrealizedPnl = round2(positions.reduce((a, p) => a + p.unrealizedPnl, 0));
    const equity = round2(this.equity(prices));
    const closing = this.trades.filter((t) => t.realizedPnl !== 0);
    const wins = closing.filter((t) => t.realizedPnl > 0).length;
    return {
      cash: round2(this.cash),
      equity,
      buyingPower: round2(this.buyingPower(prices)),
      realizedPnl: this.realizedPnl,
      unrealizedPnl,
      dayPnl: round2(equity - this.startingCash),
      tradeCount: this.trades.length,
      winRate: closing.length ? round2((wins / closing.length) * 100) : null,
      positions,
    };
  }
}

module.exports = { Account };
