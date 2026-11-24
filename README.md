# Ultramedix Dashboard

Hosted analytics dashboard running locally on Node.js and in production on Render.

## Run locally — same source as Render

Install **Node.js 22 or newer**. From the root of this repository, run:

```powershell
npm install
npm run dev
```

Open **http://localhost:10000**.

`npm run dev` always runs the dashboard assembly pipeline before starting the server, so it includes the latest enabled changes on your checked-out Git commit. `npm start` starts the already-assembled application and does **not** rebuild it.

### Updating your local Git checkout

```powershell
git switch main
git pull origin main
npm run dev
```

Stop a previously running local server first (Ctrl+C), then restart it. If localhost still shows stale content, hard-refresh the browser with Ctrl+Shift+R.

To check that the browser is running the correct server, visit **http://localhost:10000/api/health**.

### Environment

The server listens on `0.0.0.0` and `process.env.PORT || 10000`. The default spreadsheet ID is configured for the Ultramedix workbook; you can explicitly configure it with `SPREADSHEET_ID` when needed. Local and Render instances use the same Google Sheets reporting source, but caches live in each server's memory and may refresh at different times.

## Deploy

## Price Change Analysis

The assembled dashboard includes `/api/price-analysis`. It reads the selected
business workbook, its existing order/page mappings, and the Price History
destination/header/data-row controls in Automation Settings (W16, W37, W38).
No reconstructed prices or product-specific pricing rules are embedded in code.

Conversion is unique Shopify product orders divided by GA4 product-page sessions,
summed before division. Missing traffic remains unknown. Comparisons use equally
long stable-price windows, exclude transition days, and stop before another price
change. Whole weeks preserve weekday mix; shorter regimes remain labelled.
Stock availability is deliberately not included. Meta spend shown as context is
store-wide. Revenue is not profit; ambiguous mixed-order quantities are unavailable.

Price analysis source modules are `price-analysis-core.js`,
`price-analysis-data.js`, `price-analysis-ui.js` and `price-analysis.css`, installed
by `enhance-price-analysis.mjs` during `npm run build`.

Render uses the `main` branch, `npm install && node assemble.mjs` as its build command, and `npm start` as its start command; these are defined in `render.yaml`. The deployment runs the same assembly scripts as `npm run dev`. Render may be serving an older commit until a new production deployment completes, so compare the deployed commit with `git rev-parse HEAD` when checking version parity.

The worker-compatible API runs in Node with in-memory caching. Render Free may sleep when inactive; the first request after waking can be slower.
