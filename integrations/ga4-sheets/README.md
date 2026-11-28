# GA4 Egypt and page analysis importers

Google manages authorization for both importers. No API key, pasted token, service account or connector subscription is required. They use the official GA4 APIs and run on Google's servers even when the computer is closed. Revoked authorization or lost access requires reconnecting.

## Installed Ultramedix layout

| Importer | Function | Settings | Export |
|---|---|---|---|
| Regional GA4 | `syncGA4` | Automation Settings!AH:AI | Raw Ga4 & Meta Ads Data!AX:BH |
| Page analysis | `syncGA4Pages` | Automation Settings!AK:AL | D by D Pages Analysis!A:K |

Both settings panels follow the existing green headings, blue input cells and hidden borders. Property, country and export coordinates guard against mixing business data. A property change requires a separate connection/destination; changing the displayed property does not silently reconnect this export.

Settings rows: property 10, Egypt 11, history start 12, destination 16, columns 17, header row 18, first data row 19, interval 22, previous days 23, timezone 24, run function 27, last successful cycle 30, progress/error 31 and provisional-data reminder 32. Editable interval choices are 1, 2, 4, 6, 8 or 12 hours; refresh window accepts 1–30 previous days. Installed defaults are **12 hours and 7 previous days**.

### Regional GA4

Headers stay at **AX2:BH2**; newest data starts at **AX3**. New dates move older values down inside AX:BH without inserting entire spreadsheet rows. Other raw source blocks and BI's region-normalization formula stay outside the write range.

| Column | Header | Source |
|---|---|---|
| AX | Day | `date`, native spreadsheet date |
| AY | Sessions | `sessions` |
| AZ | Engaged sessions | `engagedSessions` |
| BA | Add to carts | `addToCarts` |
| BB | Checkouts | `checkouts` |
| BC | Average session duration | `averageSessionDuration`, seconds |
| BD | Views per session | `screenPageViewsPerSession` |
| BE | User engagement | `userEngagementDuration`, total seconds |
| BF | Bounce rate | `bounceRate`, fraction displayed as percent |
| BG | Region | `region` |
| BH | Average Engaged time per session | `userEngagementDuration / sessions`; blank for zero sessions |

Exact country filter: EG. Sort: date descending, region ascending. Add-to-cart and checkout metrics count event occurrences. Migration preserved older raw history and replaced recent dates from the former dedicated export. The obsolete GA4 Import Setup and GA4 Sync tabs were removed; the previous dedicated export is hidden as a backup. GA4 Fields remains available.

### Page analysis

Headers stay at **A2:K2**, **row 3 stays blank**, and newest data starts at **A4**. The key is day + page title + page path, so titles such as page 1 and page 2 remain distinct even when their path matches. Filter: Egypt. Sort: date descending, sessions descending, then path/title.

| Column | Header | Source |
|---|---|---|
| A | Day | `date`, native spreadsheet date |
| B | Page title | `pageTitle` |
| C | Sessions | `sessions` |
| D | Engaged sessions | `engagedSessions` |
| E | Engagement rate | `engagementRate`, fraction |
| F | Bounce rate | `bounceRate`, fraction |
| G | Average session duration | `averageSessionDuration`, seconds |
| H | Total users | `totalUsers` |
| I | New users | `newUsers` |
| J | Page path | `pagePath`, excludes query string |
| K | Old Users | Total users − New users, matching the existing sheet |

Old Users is the existing arithmetic definition, not GA4's returning-users audience. Users and sessions can appear on multiple pages, so page rows must not be summed to obtain deduplicated site totals.

The one-time migration moves the existing A3:K history to A4:K using a value copy and commits a migration marker atomically. Refreshes replace each day's full page set. If the row count changes, a server-side value copy shifts the older tail within A:K; columns L onward do not move. The importer may extend the bottom grid when necessary, but never inserts entire rows at the top. Google Sheets workbook cell limits still apply.

## Refresh, missing dates and continuation

- Each cycle refreshes today and the previous 7 dates (8 dates total), using the GA4 property's timezone. Today's data is partial; the window is a refresh policy, not a finalization guarantee.
- Missing dates and row-count discrepancies from the configured history start are repaired automatically. Earlier existing history is retained; gaps before that date are not backfilled.
- Each complete day and its completion ledger record publish atomically. Partial downloads retain previously published data. A replay replaces that day's rows without duplication.
- Completion records live in spreadsheet developer metadata; no sync-log tab is required. API sampling, thresholding and data-loss notes are retained there. Settings show cycle progress and a provisional-data reminder.
- A shared script lock prevents concurrent imports. Each importer has one recurring trigger plus at most one temporary continuation/watchdog trigger. Known trigger IDs are managed separately; unrelated automations are preserved.
- A saved job and atomic ledger resume incomplete work after transient errors or hard execution timeouts. Running the same public function manually also resumes. Permission/configuration errors require correction instead of endless retries.
- Google trigger times are approximate. Apps Script and GA4 API quotas apply.

## Apps Script source and installation

The existing project contains **GA4EgyptImporter.gs** (source `Code.gs`) and **GA4PagesImporter.gs** (source `Pages.gs`). Pages.gs uses shared helpers from Code.gs; install both in the same project and retain all other automation files.

Required advanced services: Analytics Data (`AnalyticsData`, v1beta), Analytics Admin (`AnalyticsAdmin`, v1beta), and Google Sheets (`Sheets`, v4). Existing Google authorization covers both importers; no Web App deployment is needed.

The settings sections above are installed in the Ultramedix workbook. The current code expects these sections and exact destination tabs to exist; this package is not a generic settings-panel installer. The older sidebar/setup-tab connection flow remains for compatibility. Standalone projects cannot use SpreadsheetApp.getUi() and use sheet-based setup.

`appsscript.json` is a reference manifest for a new dedicated project. **Do not replace an existing project's manifest**: preserve its services, scopes, settings and other functions. Google authorization must be completed interactively once.

## Verification

Run `node --test test/importer.test.mjs test/pages.test.mjs` from this directory. Tests cover pagination, interruption, rolling repair, trigger deduplication, date conversion, idempotent replacement, publication boundaries, page keys, row-4 positioning and shifting when counts increase/decrease. Live runs separately verify actual Google access and successful publication.

References: [GA4 schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema), [advanced services](https://developers.google.com/apps-script/guides/services/advanced), [installable triggers](https://developers.google.com/apps-script/guides/triggers/installable), [developer metadata](https://developers.google.com/sheets/api/guides/metadata).
