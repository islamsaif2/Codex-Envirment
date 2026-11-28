# Meta platforms to Google Sheets

Run **syncMetaPlatforms** for setup, manual refresh and continuation. This importer uses Facebook Login and an explicit ad-account picker. It never chooses the first account automatically. No access token is pasted by the user; Meta issues it during login and the script stores it in the installing user's Apps Script User Properties.

## Current installation

The source is installed as **MetaPlatformsImporter.gs** in the existing Ultramedix Apps Script project, alongside GA4EgyptImporter.gs (shared date, retry classification and cell-conversion helpers). Google Sheets advanced service is already enabled. No Web App deployment, third-party OAuth library or local scheduling server is required.

Settings are in **Automation Settings!AN:AO**, after the GA4 sections. The default interval is **4 hours**. Each cycle refreshes **today and yesterday**, in the selected Meta ad account's timezone. Existing older history is retained. Missed dates since the initial connection are repaired automatically, rather than silently leaving gaps after an outage. Previously completed older dates are not routinely refreshed. Late-attributed conversions outside that window may consequently remain unchanged, as requested.

Output is **Raw Ga4 & Meta Ads Data!AM:AS**, with headers in row 2 and newest rows starting at row 3:

| Column | Header | Meta source |
|---|---|---|
| AM | Day | date_start, daily insights |
| AN | Amount spent | spend, account currency |
| AO | CTR (link click-through rate) | inline_link_click_ctr / 100, displayed as percent |
| AP | Landing page views | actions: landing_page_view |
| AQ | Purchases | first available purchase total: omni_purchase, purchase, offsite_conversion.fb_pixel_purchase, onsite_conversion.purchase |
| AR | Platform | publisher_platform |
| AS | Placement | platform_position |

Purchase aliases are alternatives, not summed, to avoid counting the same purchase twice. Missing optional actions remain blank; reported zero values remain zero. Raw platform/placement identifiers use readable names where known; new identifiers are preserved as text. Currency comes from the selected account; EGP is displayed with E£. Queries are at account level with publisher_platform/platform_position breakdowns and ad-set unified attribution settings. No country filter is added. Attribution settings and Meta API restrictions can affect comparison with another connector's results.

## One-time Meta app connection

Unlike Google's built-in Analytics services, Facebook Login requires an application registered with Meta. A connector such as SyncWith supplies its own registered app. An independent importer needs an app controlled by its owner.

An existing app named **New Dashboard**, ID **1692565939119813**, was verified in the user's Meta account with Marketing API and Facebook Login for Business already added. Its configuration page had no login configurations when inspected. The source uses that app ID; changing it is an explicit installer operation.

The installed Google preflight completed successfully and generated this callback URL:

    https://script.google.com/macros/d/1eH2lBiidZtj8ibxd8JXxhnM-11dFYo8oZK0O566VETruCaIfE5e7-Lf5/usercallback

To finish connecting:

1. Register that exact URL in the existing Meta app's allowed OAuth redirect URIs, preserving other entries.
2. Add the app secret to **Apps Script > Project Settings > Script Properties**, under **META_PLATFORMS_APP_SECRET**. Keep it out of the spreadsheet, repository and chat.
3. For Facebook Login for Business, create a login configuration requesting **ads_read** with a **user access token**, and put its configuration ID in Script Properties as **META_PLATFORMS_LOGIN_CONFIG_ID**. This app's login configuration is not yet created. App roles, account access, reviews and access tiers remain subject to Meta's requirements.
4. Run syncMetaPlatforms. Open the generated Facebook login URL in **AO12** and complete Facebook authorization personally.
5. Select the intended ad account from **AO10**, then run syncMetaPlatforms again. The script validates its account ID, timezone and currency, starts the four-hour trigger and imports the two dates.

Until those steps succeed, **no Meta import schedule is active and no existing AM:AS data is replaced**. The installed status accurately says setup is pending. An existing connector may still refresh this export; disable only its corresponding platform report after the replacement is connected and validated, to avoid two writers.

## Settings and recovery

- AO10: selected account; AO11: validated currency; AO12: Facebook login link/status; AO13: callback URL.
- AO16: export tab; AO17: AM:AS; AO18: header 2; AO19: first data 3.
- AO22: refresh interval (1, 2, 4, 6, 8 or 12 hours); AO23: one previous day; AO24: account timezone.
- AO27: run function; AO30: last complete cycle; AO31: progress/error; AO32: provisional-data reminder.

After changing the interval, run syncMetaPlatforms to apply it immediately; otherwise the next old scheduled run applies it. An already connected export refuses another account selection, preventing mixed history.

The script validates every API page before publication. A complete day replaces its previous full platform/placement set; data and the day's completion metadata commit atomically. New values push older values down by rewriting only AM:AS, without inserting entire spreadsheet rows or touching adjacent exports. Partial reports never clear the previous day.

A shared script lock avoids overlapping automations. A saved cycle and a per-day developer-metadata ledger allow replay without duplicate rows. One recurring trigger and at most one continuation/watchdog belong to this importer. Transient errors retry and then continue automatically; revoked authorization or invalid settings require repair. Login has expiration and single-use nonce validation, and Meta errors are sanitized so credentials are not written to logs or the sheet. Expired/revoked Meta login requires reconnecting; this is not a promise of permanent authorization.

## Validation

Run **node --test integrations/meta-sheets/test/importer.test.mjs** from the dashboard repository. Twelve local tests cover numeric conversion, missing/zero actions, purchase alias deduplication, exact-day requests, pagination, interrupted downloads, AM:AS-only atomic publication, history preservation, account selection, OAuth state and credential-safe errors. Google-side installation and setup preflight passed. Live Meta OAuth, account listing and data reconciliation remain pending user connection.

References: [Meta authorization](https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authorization), [login flow](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow), [Insights API](https://developers.facebook.com/docs/graph-api/reference/adaccount/insights), [Google OAuth callback pattern](https://github.com/googleworkspace/apps-script-oauth2).
