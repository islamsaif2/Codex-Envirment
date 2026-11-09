# Ultramedix Dashboard

Hosted analytics dashboard migrated from Cloudflare Workers to Render (Node.js).

## Run

Node.js 22 or newer is required.

```sh
npm start
```

The app listens on `0.0.0.0` and `process.env.PORT || 10000`.
The existing Google Sheets workbook is the data source. The environment variable `SPREADSHEET_ID` selects the workbook. No private credentials are committed.

## Deploy

Render Free Web Service: Node runtime, build command `npm install`, start command `npm start`. Set `SPREADSHEET_ID` in the Render environment settings.

The worker-compatible API runs locally inside Node, with short-lived in-memory caches. Render Free may sleep when inactive; the first request after waking may take longer. Shopify and Meta inputs continue to come from the existing spreadsheet.
