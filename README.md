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

## Data Health

Open **http://localhost:10000/#data-health** or select **Data Health** in the
dashboard. The dashboard reads the same 30 formula-driven checks as the existing
**Data Up to Date Check** Sheet tab. It covers order creation, tracked Bosta status
coverage, GA4, Meta ads and platforms (including Facebook and Instagram separately),
the reporting blocks actually used by the website, pages, regions, current stock,
closing-stock history, the inventory sync ledger, customer activity, every Shopify
attribution model and its sync timestamps, catalog prices, CRO events, and delivery
duration coverage. Configuration/manual tabs have no invented daily deadline.

All dated feeds are checked against today in Africa/Cairo, except inventory history
and its ledger, which are due through yesterday. Every check uses the same two
labels: **Up to date** or **Not up to date**. Each dataset retains its own activity,
snapshot, sync-date or field-coverage rule. Missing or unverified freshness evidence
is **Not up to date**, with the reason in the details. Today-dated activity can still
be partial; the label does not certify a complete daily import. Reference/manual
tabs have no scheduled daily refresh and therefore no overdue daily update.
Bosta status sync and customer profile sync need importer timestamps before their
freshness checks can be Up to date.
`GET /api/data-health` reads only the checker tab. It bypasses the reporting cache's
12-hour stale fallback, coalesces concurrent reads, and reuses a read for at most one
minute. `?refresh=1` forces a source read. Network fallback results and a Sheet
reference date that differs from the current Cairo date are visibly marked as
unverified. No import jobs, Google Sheets writes, or commercial actions are triggered.
The formulas use complete source columns rather than fixed imported-row limits.
Run `npm run test:data-health` for parser, cache, outage and coverage-contract tests.

## Decision Intelligence and browser chat

Open **http://127.0.0.1:10000/#decision-intelligence** after `npm run dev`.
The separate advisory layer ranks a top-30 review queue in six collapsed groups,
uses 180-day stock context, and reports source dates and model limitations.
It cannot execute commercial decisions. The original dashboard metrics and
startup defaults remain in place, apart from the requested repeat-purchase timing
correction (placed orders excluding cancellations, with an end-date cutoff).

ChatGPT runs beside the site through the browser/desktop account. The tab includes
a copyable analysis prompt and a read-only decision-context page. API chat is
disabled by default; no API key is needed for browser-account mode. Chrome/Edge
extension installation is separate, and localhost was verified with ChatGPT's
built-in browser. See [the official browser guide](https://learn.chatgpt.com/docs/chrome-extension).

Local source snapshots, generated reports, logs and encrypted credentials are
excluded from Git. On a fresh checkout, use **Recalculate decisions** to collect
the Sheet data, then **Read updated business inputs** to sync onboarding answers.
The decision API accepts localhost hosts by default; publishing it requires an
explicit authenticated origin rather than changing existing deployment settings.

Validate with `npm run test:price-analysis`, `npm run test:repeat-purchases`, and
`npm run test:decision-intelligence`. More model details are in
[the decision-layer documentation](decision-intelligence/README.md).

## Price Change Analysis

The assembled dashboard includes `/api/price-analysis`. It reads the selected
business workbook, its existing order/page mappings, and the Price History
destination/header/data-row controls in Automation Settings (W16, W37, W38).
No reconstructed prices or product-specific pricing rules are embedded in code.

Conversion is unique Shopify product orders divided by GA4 product-page sessions,
summed before division. Missing traffic remains unknown. Comparisons use equally
long available-price windows and stop before another price change. Days with
order prices inconsistent with the daily price are excluded. Whole-week windows
contain seven available days; shorter comparisons remain labelled.
The simplified page pools the same products before/after shared price changes,
and shows a conversion response normalized to a 10% price change, fitted with
weights based on sessions and squared price-change magnitude. Price changes
below 1% are excluded from this scaled metric to avoid rounding noise.
Unusable comparisons are omitted from the main table, never filled with zeros.
Stock availability is deliberately not included. The simplified page focuses on
conversion comparisons and removes revenue, break-even and advertising panels.

Price analysis source modules are `price-analysis-core.js`,
`price-analysis-data.js`, `price-analysis-ui.js` and `price-analysis.css`, installed
by `enhance-price-analysis.mjs` during `npm run build`.

Render uses the `main` branch, `npm install && node assemble.mjs` as its build command, and `npm start` as its start command; these are defined in `render.yaml`. The deployment runs the same assembly scripts as `npm run dev`. Render may be serving an older commit until a new production deployment completes, so compare the deployed commit with `git rev-parse HEAD` when checking version parity.

The worker-compatible API runs in Node with in-memory caching. Render Free may sleep when inactive; the first request after waking can be slower.
