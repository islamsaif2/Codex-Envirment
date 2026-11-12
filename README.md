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

Render uses the `main` branch, `npm install && node assemble.mjs` as its build command, and `npm start` as its start command; these are defined in `render.yaml`. The deployment runs the same assembly scripts as `npm run dev`. Render may be serving an older commit until a new production deployment completes, so compare the deployed commit with `git rev-parse HEAD` when checking version parity.

The worker-compatible API runs in Node with in-memory caching. Render Free may sleep when inactive; the first request after waking can be slower.
