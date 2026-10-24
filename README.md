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

The dashboard works in two modes. When the Node server is running, it streams from the server. When there is no server, as on static hosting such as Netlify, it runs the same simulation code in the browser. `npm run build` bundles `src/` into `public/engine.js` for that mode.

## Run

```bash
npm start          # builds, then serves http://localhost:3000
npm test
npm run build      # browser bundle only (public/engine.js)
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

**Netlify:** `netlify.toml` runs `npm run build` and publishes `public/`. The app runs entirely in the browser, and each visitor gets their own simulated market and account.

**Azure:** `.github/workflows/azure.yml` tests the app and deploys it to the App Service web app `day-trader` on every push to `main`. You can also run it by hand from the Actions tab. On Azure the Node server runs, so all visitors share one market and account.

### Deploy to Azure

You only need to do this once.

1. In the [Azure portal](https://portal.azure.com), create a **Web App** with these settings:
   - **Name:** `day-trader`. If the name is taken, pick another and change `AZURE_WEBAPP_NAME` in the workflow to match.
   - **Publish:** Code
   - **Runtime stack:** Node 20 LTS
   - **Operating system:** Linux
   - **Pricing plan:** any. Free F1 works for trying it out.
2. Open the web app. Under **Settings → Environment variables** (called **Configuration** in some versions of the portal), add the app setting `WEBSITE_WEBDEPLOY_USE_SCM` = `true` and save.
3. On the web app's **Overview** page, click **Download publish profile**. If that button is disabled, go to **Settings → Configuration → General settings**, turn on **SCM Basic Auth Publishing Credentials**, save, and try again.
4. In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `AZURE_WEBAPP_PUBLISH_PROFILE` and paste in the whole contents of the downloaded file.
5. Go to **Actions → the Azure workflow → Run workflow**, or push to `main`. Once it finishes, the app is live at `https://day-trader.azurewebsites.net`.

Until the secret exists, the workflow still runs the tests but skips the deploy with a warning. Azure starts the app with `npm start`, which builds the browser bundle and serves on the `PORT` that Azure provides. To change the loss limit or tick speed, set `MAX_DAILY_LOSS` or `TICK_MS` as app settings.
