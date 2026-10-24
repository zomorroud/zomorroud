'use strict';

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => (n == null ? '—' : (n + 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const cls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let state = null;
let selected = null;
const history = {};

// Set by connect(): talks to the Node server, or to an in-browser engine
// when no server is available (static hosting such as Netlify).
let api = null;

async function serverApi(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// Mirrors the server's routes against an Engine running in this page.
function createLocalApi(engine, warnings) {
  const snapshot = () => ({ ...engine.snapshot(), warnings });
  return async (method, url, body = {}) => {
    const [, , resource, symbol] = url.split('/');
    if (method === 'GET' && resource === 'state') return snapshot();
    if (method === 'GET' && resource === 'history') return engine.market.history(symbol);
    if (method === 'POST' && resource === 'orders') return engine.placeOrder({ ...body, qty: Number(body.qty) });
    if (method === 'POST' && resource === 'bots') {
      engine.setBot(symbol, Boolean(body.enabled));
      return { botsEnabled: [...engine.botsEnabled] };
    }
    if (method === 'POST' && resource === 'flatten') return engine.flatten();
    if (method === 'POST' && resource === 'reset') {
      engine.reset();
      warnings.length = 0;
      return snapshot();
    }
    throw new Error('Not found');
  };
}

function sma(values, period, i) {
  if (i + 1 < period) return null;
  let sum = 0;
  for (let j = i - period + 1; j <= i; j++) sum += values[j];
  return sum / period;
}

function drawChart() {
  const canvas = $('#chart');
  const values = history[selected] || [];
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = 260;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;

  const css = getComputedStyle(document.documentElement);
  const pad = { l: 8, r: 56, t: 8, b: 8 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => pad.l + (i / (values.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / span) * (h - pad.t - pad.b);

  ctx.fillStyle = css.getPropertyValue('--muted');
  ctx.font = '11px system-ui';
  ctx.strokeStyle = css.getPropertyValue('--border');
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const v = min + (span * k) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y(v));
    ctx.lineTo(w - pad.r, y(v));
    ctx.stroke();
    ctx.fillText(v.toFixed(2), w - pad.r + 6, y(v) + 4);
  }

  const line = (series, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    series.forEach((v, i) => {
      if (v == null) return;
      if (started) ctx.lineTo(x(i), y(v));
      else ctx.moveTo(x(i), y(v));
      started = true;
    });
    ctx.stroke();
  };
  const { fast, slow } = state.bot;
  line(values.map((_, i) => sma(values, slow, i)), css.getPropertyValue('--slow'), 1.5);
  line(values.map((_, i) => sma(values, fast, i)), css.getPropertyValue('--fast'), 1.5);
  line(values, css.getPropertyValue('--accent'), 2);
}

function render() {
  const a = state.account;
  const stats = [
    ['Equity', fmt(a.equity)],
    ['Day P&L', fmt(a.dayPnl), cls(a.dayPnl)],
    ['Realized', fmt(a.realizedPnl), cls(a.realizedPnl)],
    ['Unrealized', fmt(a.unrealizedPnl), cls(a.unrealizedPnl)],
    ['Cash', fmt(a.cash)],
    ['Buying power', fmt(a.buyingPower)],
    ['Trades', a.tradeCount],
    ['Win rate', a.winRate == null ? '—' : `${a.winRate}%`],
  ];
  $('#stats').innerHTML = stats
    .map(([k, v, c = '']) => `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`)
    .join('');

  const banner = $('#banner');
  const lastWarning = state.warnings[state.warnings.length - 1];
  if (state.halted) {
    banner.textContent = `Trading halted: daily loss limit of $${fmt(state.maxDailyLoss)} reached. Press Reset to start a new session.`;
  } else if (lastWarning && Date.now() - lastWarning.time < 5000) {
    banner.textContent = lastWarning.message;
  }
  banner.classList.toggle('hidden', !state.halted && !(lastWarning && Date.now() - lastWarning.time < 5000));
  document.querySelectorAll('#ticket button[data-side]').forEach((b) => (b.disabled = state.halted));

  $('#watchlist tbody').innerHTML = state.quotes
    .map((q) => {
      const on = state.botsEnabled.includes(q.symbol);
      return `<tr data-symbol="${q.symbol}" class="${q.symbol === selected ? 'selected' : ''}">
        <td>${q.symbol}</td><td>${fmt(q.price)}</td>
        <td class="${cls(q.changePct)}">${q.changePct.toFixed(2)}%</td>
        <td>${q.rsi == null ? '—' : q.rsi.toFixed(0)}</td>
        <td><input type="checkbox" data-bot="${q.symbol}" ${on ? 'checked' : ''} ${state.halted ? 'disabled' : ''} aria-label="Bot for ${q.symbol}"></td>
      </tr>`;
    })
    .join('');

  $('#positions tbody').innerHTML =
    a.positions
      .map(
        (p) => `<tr><td>${p.symbol}</td><td class="${cls(p.qty)}">${p.qty}</td><td>${fmt(p.avgCost)}</td>
          <td>${fmt(p.price)}</td><td class="${cls(p.unrealizedPnl)}">${fmt(p.unrealizedPnl)}</td></tr>`
      )
      .join('') || '<tr><td colspan="5">Flat</td></tr>';

  $('#trades tbody').innerHTML =
    state.trades
      .map(
        (t) => `<tr><td>${new Date(t.time).toLocaleTimeString()}</td><td>${t.symbol}</td>
          <td class="${t.side === 'buy' ? 'up' : 'down'}">${t.side}</td><td>${t.qty}</td><td>${fmt(t.price)}</td>
          <td class="${cls(t.realizedPnl)}">${t.realizedPnl ? fmt(t.realizedPnl) : ''}</td><td>${esc(t.source)}</td></tr>`
      )
      .join('') || '<tr><td colspan="7">No trades yet</td></tr>';

  const q = state.quotes.find((x) => x.symbol === selected);
  $('#chart-title').textContent = q
    ? `${q.symbol} ${fmt(q.price)} · SMA${state.bot.fast} ${fmt(q.smaFast)} · SMA${state.bot.slow} ${fmt(q.smaSlow)}`
    : 'Chart';
  drawChart();
}

async function select(symbol) {
  selected = symbol;
  history[symbol] = await api('GET', `/api/history/${symbol}`);
  render();
}

function onSnapshot(snapshot) {
  state = snapshot;
  for (const q of state.quotes) {
    if (!history[q.symbol]) continue;
    history[q.symbol].push(q.price);
    if (history[q.symbol].length > 600) history[q.symbol].shift();
  }
  if (!selected) select(state.quotes[0].symbol);
  else render();
}

async function act(fn) {
  try {
    await fn();
  } catch (err) {
    alert(err.message);
  }
}

$('#watchlist').addEventListener('click', (e) => {
  if (e.target.matches('input[data-bot]')) {
    act(() => api('POST', `/api/bots/${e.target.dataset.bot}`, { enabled: e.target.checked }));
    return;
  }
  const row = e.target.closest('tr[data-symbol]');
  if (row) select(row.dataset.symbol);
});
document.querySelectorAll('#ticket button[data-side]').forEach((b) =>
  b.addEventListener('click', () =>
    act(() => api('POST', '/api/orders', { symbol: selected, side: b.dataset.side, qty: Number($('#qty').value) }))
  )
);
$('#flatten').addEventListener('click', () => act(() => api('POST', '/api/flatten')));
$('#reset').addEventListener('click', () => act(async () => onSnapshot({ ...(await api('POST', '/api/reset')), warnings: [] })));
window.addEventListener('resize', () => state && drawChart());

function connectServer() {
  api = serverApi;
  const stream = new EventSource('/api/stream');
  stream.onopen = () => ($('#status').textContent = 'live');
  stream.onerror = () => ($('#status').textContent = 'reconnecting…');
  stream.onmessage = (e) => onSnapshot(JSON.parse(e.data));
}

function connectLocal() {
  const engine = new window.DayTrader.Engine();
  const warnings = [];
  engine.on('warning', (message) => {
    warnings.push({ time: Date.now(), message });
    if (warnings.length > 20) warnings.shift();
  });
  // Warm up the market so the chart and indicators have data straight away.
  for (let i = 0; i < 120; i++) engine.market.tick();
  api = createLocalApi(engine, warnings);
  $('#status').textContent = 'live · simulated in your browser';
  onSnapshot({ ...engine.snapshot(), warnings });
  setInterval(() => onSnapshot({ ...engine.tick(), warnings }), 1000);
}

async function connect() {
  try {
    const res = await fetch('/api/state');
    if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) return connectServer();
  } catch {
    // No server reachable: fall through to the in-browser engine.
  }
  connectLocal();
}

connect();
