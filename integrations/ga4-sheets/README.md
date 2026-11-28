# GA4 Egypt to Google Sheets

Run **`syncGA4`**. This is the only public function. On first use, Google asks you to authorize the script with an account that has GA4 Viewer access. In a bound project a sidebar lists the accounts/properties available to that Google account. In a standalone project the script creates **GA4 Import Setup** in the configured destination spreadsheet: select the property in **B3**, then run **`syncGA4`** again. No API key, pasted access token, service account or separate connector subscription is required. Google manages OAuth internally; authorization is not guaranteed forever if you revoke it, lose access or change permissions.

The importer uses the official GA4 APIs, not browser scraping. Your spreadsheet and computer can be closed while Google runs the scheduled import.

## Install into your spreadsheet's existing Apps Script project

1. Open the destination Google Sheet, then **Extensions > Apps Script**.
2. Add a **new script file** named `GA4EgyptImporter`. Paste `Code.gs` into that new file. Do not replace your existing automation files.
3. Under **Services**, add **Google Analytics Data API** (`AnalyticsData`, v1beta), **Google Analytics Admin API** (`AnalyticsAdmin`, v1beta), and **Google Sheets API** (`Sheets`, v4). Keep all existing services. On an Apps Script default Cloud project, adding advanced services enables the corresponding APIs automatically. If the project uses a standard Cloud project, its administrator must enable these three APIs in that project as well.
4. Save, choose `syncGA4` in the function selector and click **Run**. Complete Google's authorization yourself, using the Google account that has access to your GA4 property and destination Sheet.
5. Return to the spreadsheet and select the property in the **GA4 Egypt import** sidebar. Leave the optional history date blank to start with today plus the previous 7 days, or choose an earlier initial backfill date. Click **Connect and import**.

`appsscript.json` is a complete manifest for a **new dedicated bound project**. **Do not replace the manifest of an existing automation project**: it may contain other services, scopes and settings. Add the services through the UI as above. If the existing project explicitly lists `oauthScopes`, preserve them and add any missing scopes from this package's manifest; if it has no explicit scope list, Apps Script infers them from code.

There is no Web App deployment step. No paid Cloud product, billing account or local server is required by this importer. The spreadsheet account's Apps Script and GA4 API quotas still apply.

## Standalone Apps Script projects

The existing Ultramedix Dashboard project is standalone, so `SpreadsheetApp.getUi()` is unavailable there. This version supports that context automatically. The default `destinationSpreadsheetId` at the top of `Code.gs` points to the existing Ultramedix workbook. Change that setting before installing a standalone copy for a different business. A bound project uses its own spreadsheet instead.

Tab creation and its ownership marker are committed atomically through the Sheets API. A timed-out creation is read back before retrying, preventing duplicate tabs. The empty field-catalogue tab left by the earlier non-atomic version can be recovered; populated unowned tabs are refused. Shared project locks wait up to 20 seconds for existing automations, then log a clear retry message rather than silently skipping work.

Run `syncGA4`, open the **GA4 Import Setup** tab, select the accessible GA4 property in **B3**, optionally set a history start in **B4**, then run `syncGA4` again. Later manual and scheduled runs do not need a spreadsheet UI or property selection. No recurring trigger is installed until a property has been selected and validated.

## Output

Creates separate tabs with the selected property ID in their names:

- **GA4 Egypt - PROPERTY_ID**: headers **B2:L2**, newest data **B3:L**. Columns A, row 1 and columns beyond L are not written by the importer. Initial setup reserves 20,000 rows in this new tab. Every refresh shifts older data down by rewriting only the owned B3:L range, without inserting entire spreadsheet rows. If capacity is exhausted it stops safely and asks you to increase the tab's capacity.
- **GA4 Sync - PROPERTY_ID**: current status, timezone, last completed cycle and a per-day completion ledger. Successful empty days are recorded distinctly from failed requests. Check the quality notes for thresholding, sampling or data loss.
- **GA4 Fields - PROPERTY_ID**: actual dimension/metric catalogue returned by your property's metadata endpoint. Setup verifies the requested fields and checks compatibility before scheduling imports. Missing fields stop setup; nothing is silently substituted.

The importer refuses to overwrite an existing tab with one of these names unless that tab has its ownership metadata. Existing dashboard source tabs and schedules are not changed. Use one installing Google account per property in a bound project; installable triggers and configuration belong to that user.

## Query and formatting

| Column | Header | Source |
|---|---|---|
| B | Day | `date`, ISO text YYYY-MM-DD |
| C | Sessions | `sessions` |
| D | Engaged sessions | `engagedSessions` |
| E | Add to carts | `addToCarts` |
| F | Checkouts | `checkouts` |
| G | Average session duration | `averageSessionDuration`, seconds |
| H | Views per session | `screenPageViewsPerSession` |
| I | User engagement | `userEngagementDuration`, total seconds |
| J | Bounce rate | `bounceRate`, fraction stored and percent displayed |
| K | Region | `region`, including unknown values returned by GA4 |
| L | Average Engaged time per session | `userEngagementDuration / sessions`; blank when sessions = 0 |

Filter: exact `countryId = EG`. Group: date and region. Sort: date descending, region ascending. Decimal precision is stored; display formats can round. For the supplied example: `343 / 4 = 85.75` seconds. Add to carts and checkout starts are event occurrences, not item quantities or purchases.

## Refresh and resume

- One recurring trigger every **12 hours**, plus at most one temporary continuation/watchdog trigger for this importer. Other triggers are left alone. Google schedules are approximate.
- A cycle revisits **today plus seven previous dates** (8 dates). Example for 2026-11-28: 2026-11-21 through 2026-11-28. GA4 property timezone determines today. This rolling window is a refresh policy, not a guarantee that GA4 never revises older data.
- The selected initial history start date remains the lower bound for missing-date repair. Older missing imports and row-count discrepancies are re-fetched automatically; dates before the chosen history start are not invented or backfilled.
- Pagination is completed and validated per day. If the execution budget is nearly used up, the unfinished day is downloaded again on continuation; published days need not be repeated within that cycle.
- Each complete day replaces that day's entire region set. Data values, removal of obsolete rows and the day's completion ledger publish in one atomic Google Sheets API batch. A failed or partial download never clears a previously published day. A replay is idempotent.
- A script lock prevents overlapping imports. A watchdog is scheduled before downloading so a hard Apps Script timeout can resume too. Temporary API failures get bounded retries, then a continuation. Permission failures require authorization repair; they do not trigger endless retries.
- Running `syncGA4` again continues an unfinished cycle or starts a fresh one after the previous cycle completed. It does not create another 12-hour trigger while its existing schedule is present.
- The entire row set is rewritten when a day is published so new dates occupy B3 and old dates move down within B:L. Other columns do not move; avoid putting manually maintained row-linked data beside this generated range.

## Verification

From this directory: `node --test test/importer.test.mjs`.

Local tests simulate pagination, changing reports, interrupted cycles, retry behavior, schedule deduplication, rolling repair, exact output coordinates, example calculations and idempotent day replacement. They do not prove access to your GA4 account. Installation, property selection, consent and the first real import must be verified in Google's UI and the created tabs.

Official references:

- https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/getMetadata
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility
- https://developers.google.com/apps-script/guides/services/advanced
- https://developers.google.com/apps-script/guides/triggers/installable
- https://developers.google.com/apps-script/guides/services/quotas
