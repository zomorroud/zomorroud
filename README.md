# Day-Trader

A paper-trading day-trader simulator with a live web dashboard. No real money is involved and nothing connects to a broker. Prices are simulated.

## Features

- **Simulated market**: five symbols move tick by tick using geometric Brownian motion. The price model is seedable, so runs can be reproduced.
- **Paper account**: long and short positions, average-cost tracking, realized and unrealized P&L, win rate, and pattern-day-trader-style intraday buying power (4× equity).
- **Indicators**: SMA, EMA, RSI and the session average.
- **SMA-crossover bot**: turn it on per symbol. It goes long on a golden cross and short on a death cross.
- **Risk control**: when the day's loss limit is hit, all positions are flattened and trading halts until you reset.
- **Dashboard**: watchlist, price chart with the SMA overlays, order ticket, positions and trade blotter. It streams live over Server-Sent Events.

There are no runtime dependencies. You only need Node.js 18 or newer.

## Run

```bash
npm start          # http://localhost:3000
npm test
```

Environment variables:

| Variable         | Default | Meaning                              |
| ---------------- | ------- | ------------------------------------ |
| `PORT`           | `3000`  | HTTP port                            |
| `TICK_MS`        | `1000`  | Milliseconds between market ticks    |
| `MAX_DAILY_LOSS` | `5000`  | Loss in $ that flattens and halts    |

## API

| Method | Path                   | Body                                        |
| ------ | ---------------------- | ------------------------------------------- |
| GET    | `/api/state`           | n/a                                         |
| GET    | `/api/stream`          | n/a (SSE snapshot on every tick)            |
| GET    | `/api/history/:symbol` | n/a                                         |
| POST   | `/api/orders`          | `{ "symbol", "side": "buy"/"sell", "qty" }` |
| POST   | `/api/bots/:symbol`    | `{ "enabled": true/false }`                 |
| POST   | `/api/flatten`         | n/a                                         |
| POST   | `/api/reset`           | n/a                                         |

## Deploy

`.github/workflows/azure.yml` deploys to Azure App Service when a release is created. Before you use it, set `AZURE_WEBAPP_NAME` and add the `AZURE_WEBAPP_PUBLISH_PROFILE` secret.
