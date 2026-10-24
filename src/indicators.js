'use strict';

// Simple moving average of the last `period` values, or null if not enough data.
function sma(values, period) {
  if (period <= 0 || values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

// Exponential moving average seeded with the SMA of the first `period` values.
function ema(values, period) {
  if (period <= 0 || values.length < period) return null;
  const k = 2 / (period + 1);
  let value = sma(values.slice(0, period), period);
  for (let i = period; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}

// Wilder's RSI over `period` changes. Returns 0..100, or null if not enough data.
function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

// Volume-free VWAP stand-in: mean price since the session open.
function sessionAverage(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

module.exports = { sma, ema, rsi, sessionAverage };
