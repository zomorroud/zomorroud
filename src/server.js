'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Engine } = require('./engine');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e5) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, content) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}

function createServer(engine = new Engine()) {
  const clients = new Set();
  const warnings = [];

  engine.on('warning', (message) => {
    warnings.push({ time: Date.now(), message });
    if (warnings.length > 20) warnings.shift();
  });
  engine.on('tick', (snapshot) => {
    const payload = `data: ${JSON.stringify({ ...snapshot, warnings })}\n\n`;
    for (const res of clients) res.write(payload);
  });

  const routes = {
    'GET /api/state': async () => [200, { ...engine.snapshot(), warnings }],
    'POST /api/orders': async (req) => {
      const { symbol, side, qty } = await readJson(req);
      return [201, engine.placeOrder({ symbol, side, qty: Number(qty) })];
    },
    'POST /api/flatten': async () => [200, engine.flatten()],
    'POST /api/reset': async () => {
      engine.reset();
      warnings.length = 0;
      return [200, engine.snapshot()];
    },
  };

  return http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];
    try {
      if (req.method === 'GET' && urlPath === '/api/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ ...engine.snapshot(), warnings })}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      const historyMatch = urlPath.match(/^\/api\/history\/([A-Z.]+)$/);
      if (req.method === 'GET' && historyMatch) {
        return sendJson(res, 200, engine.market.history(historyMatch[1]));
      }
      const botMatch = urlPath.match(/^\/api\/bots\/([A-Z.]+)$/);
      if (req.method === 'POST' && botMatch) {
        const { enabled } = await readJson(req);
        engine.setBot(botMatch[1], Boolean(enabled));
        return sendJson(res, 200, { botsEnabled: [...engine.botsEnabled] });
      }
      const route = routes[`${req.method} ${urlPath}`];
      if (route) {
        const [status, body] = await route(req);
        return sendJson(res, status, body);
      }
      if (urlPath.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
      if (req.method === 'GET') return serveStatic(req, res);
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });
}

if (require.main === module) {
  const engine = new Engine({ maxDailyLoss: Number(process.env.MAX_DAILY_LOSS) || 5000 });
  const tickMs = Number(process.env.TICK_MS) || 1000;
  setInterval(() => engine.tick(), tickMs);
  const port = Number(process.env.PORT) || 3000;
  createServer(engine).listen(port, () => console.log(`Day-Trader running on http://localhost:${port}`));
}

module.exports = { createServer };
