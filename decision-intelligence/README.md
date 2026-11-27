# Ultramedix Decision Intelligence

Separate, local, advisory decision layer. Existing dashboard, launcher, deployment and automation settings are untouched. Latest dashboard source audited at GitHub commit `76876297cd3be3cb4bd78b0964f854f5038a44ab` in `audit/github-latest`. Render is explicitly not the current source of truth.

## Use

Requires Node.js 22+. No dependencies to install.

```powershell
npm start
```

Open http://127.0.0.1:10040. It is accessible locally without an account or access key, as requested. The existing dashboard's port 10000 and startup settings are unchanged. The trial opens with a runnable synthetic scenario; no JSON entry is required.

Seven business choices live in `Decision Intelligence Setup`, rows 7–13, answer column B. All are dropdowns. The defaults are trial choices. Clear an answer when unknown. Click **تحديث اختيارات الشيت** to read them and update the local trial registry. This never updates live ad or store settings.

The objective is increasing delivered sales using every available and relevant business domain. The owner's marketing role limits onboarding questions, not analytical scope. Known ready-to-sell inventory and homepage ad destinations are recorded. Campaign-to-SKU effects are unknown; the demo uses an explicitly synthetic shared sitewide product mix.

## What is implemented

- Read-only Sheets audit, analytical aggregates, source hashes and latest GitHub audit snapshot.
- A–Z business model, 363 observed field labels, 43 recorded/proposed metrics, 18 entity definitions, 22 relationships and configuration-driven constraints. Observed labels are not automatically approved business semantics.
- Typed dropdown translation, optional blanks, independent capability readiness and trial presets kept separate from real business facts.
- Time-ordered demand baselines, rolling backtesting, error metrics and empirical horizon bands. Unverified/incomplete/stock-censored observations are excluded; missing is never zero.
- Exact finite scenario optimization, joint stock consumption, daily/period ad budget, timed cash, fulfillment, production and optional resource capacities; explicit infeasibility. Bounded search, no global real-world optimality claim.
- Campaign scenario compilation with spend bounds, ramps, delivery economics, SKU shares and settlement lags. SKU shares are accepted only as stated evidence/assumptions, not inferred from historical ROAS.
- Production MOQ/multiples/lead-time batch helper and material resource vectors. It is not a fully calibrated manufacturing scheduler.
- Sensitivity comparison and mature-outcome prediction-error review. No automatic causal learning or automatic retraining from correlation.
- Local HTTP and stdio MCP adapters; read-only analytical tool allowlist. No commercial execution route exists.

Real forecasts and recommendations stay gated by relevant source and validation prerequisites. Unknown costs/refunds disable net-profit claims; unknown cash disables actual cash feasibility; unknown campaign/SKU effects disable campaign-specific stock claims. These do not prevent historical review or the explicitly synthetic demo.

## Check and refresh

```powershell
npm test
node scripts/collect-audit.mjs
node scripts/sync-onboarding.mjs
npm run report
```

The audit collector requests no customer contact fields and saves analytical aggregates and stock observations. It treats the reporting formula's last-row day/ad deduplication as an observed convention, not proof of source revision order. Report output is `outputs/business-review.html`.

`scripts/build-model.mjs` and `scripts/build-demo-inputs.mjs` are one-time broad catalog builders. Do not rerun them alone over reviewed onboarding answers. `scripts/build-marketing-onboarding.mjs` narrows the catalog to the owner's current seven-choice trial; it also resets trial selections. Normal use is `sync-onboarding.mjs`.

## ChatGPT / desktop integration

`src/stdio.mjs` is a local MCP server. `src/server.mjs` exposes `/mcp` on localhost for local HTTP clients. The desktop MCP configuration registers the stdio process as `ultramedix-decision-intelligence`. Host tool discovery may require refreshing the app or a new chat; registration and a tested handshake are not proof that a tool has appeared in an existing chat.

Local registration does not register a remotely hosted ChatGPT web connector. No public endpoint, paid service, OAuth application or external publication was created. See [OpenAI's current connection guide](https://developers.openai.com/api/docs/guides/custom-mcp-server) for supported host-specific connection flows. Protocol follows [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

Tools: `get_status`, `get_business_center`, `get_business_model`, `get_audit`, `get_diagnostics`, `get_forecast`, `get_recommendations`, `run_demo`, `translate_choices`, `simulate_scenario`. Discovery and `get_status` were verified in this chat on 2026-11-27. No tool changes campaigns, orders, inventory, spend or source Sheets. Trial refresh writes local trial configuration only, after a source read.

### Embedded decision chat and connection setup

**Current default: browser-account mode (2026-11-27).** The owner chose ChatGPT beside the dashboard using their existing account. The unused browser-chat introduction and prompt block were removed from the decision page. The read-only `/assistant-context` endpoint remains available for browser-based analysis. `/api/chat/status` returns the mode without reading Sheet credentials; API chat and connection mutations are disabled unless the server is explicitly started with `DI_ENABLE_API_CHAT=1`. No Sheet cell or sharing setting was changed for this switch. The official guide supports browser side chat but specifically directs localhost workflows to the built-in browser. Chrome/Edge extension access is not connected in this session, so extension-side localhost support has not been claimed as verified. Browser chat must be opened in the browser/desktop UI; the website cannot embed the signed-in side panel or launch it through an undocumented API. See https://learn.chatgpt.com/docs/chrome-extension.

The optional API mode uses the Responses API with `store:false`. If explicitly enabled, the server reads **Automation Settings!AF10** for credentials whenever API chat status is checked or a question is sent. Sheet keys take priority, are never returned to the browser or copied into analytical snapshots/logs, and are verified by the first API reply. The Sheet is readable by anyone with its link: a plaintext key in AF10 is visible to those readers. This implementation does not change sharing permissions. No real key was supplied or written by the agent.

Optional local setup remains at `http://127.0.0.1:10000/decision-intelligence/chat-settings`. It verifies model access and can save a separate Windows DPAPI-encrypted key for the current user in ignored `data/private/openai.json`. The status endpoint reports only key presence and source. A blank AF10 falls back to that saved local key or `OPENAI_API_KEY`, if configured. API billing is separate from desktop tool access.

Chat sends selected decision evidence, source dates and advanced-model readiness to OpenAI, not raw customer contacts or the large pairwise proof table. It cannot execute commercial actions. It validates cited decision IDs, displays the authoritative engine evidence beside replies, and caches identical question/evidence/model requests in memory. Engine math and bootstrap seeds are reproducible; AI wording and future outcomes are not guaranteed deterministic. Replies remain recommendations for review. A real API-key reply has not been tested because no key was configured; provider behavior, encryption round trips and origin restrictions were tested using a disposable fake credential and a mocked provider.

### Advanced models requested on 2026-11-27

`src/advanced-models.mjs` evaluates 180 days through the last common completed order, website and stock-history date. Product stock state requires every listed size to have a nonnegative known closing value; mixed sizes are partial, not a stockout. Suppressed-demand scenarios estimate **order occurrences containing a product**, not SKU units, using prior positive-stock weekday/session rates. They require 42 training days, 14 later holdout days, weekday coverage and at least 20 training occurrences. A model must beat a constant order-count baseline on that chronological holdout. Each target stockout day uses only earlier positive-stock observations. Seeded seven-observation block resampling produces parameter intervals, signed-gap downside and lower-tail means; these exclude outcome noise and confounding and are not causal recovery probabilities.

Substitution screening compares exact related names differing by a recognized trailing color. It requires 3 independent stockout episodes, 14 eligible zero-stock days and 28 comparison days with the alternative positive. Same-weekday controls must be within 28 days. Results are exploratory traffic-adjusted associations, not causal cannibalization or net restock uplift, and never feed budget optimization. The current snapshot yields 1 eligible stockout estimate and 0 eligible substitution associations out of 6 screened pairs. Estimates count overlapping product-order occurrences and must not be added together.

Incremental retention is explicitly unavailable: the connected customer/cohort sources have no randomized treatment/control assignment linked to mature outcomes. No response uplift, segment targeting or probability is invented from repeat propensity. All new model evidence is visible in collapsed advanced-model details and relevant product decisions. Historical source staleness and uncertain stock provenance remain visible.

## Data contracts

`config/businesses.json` is a server-controlled allowlist for separate business paths. No client-supplied filesystem paths are accepted. This is an internal local tool, not a customer account platform.

A verified series requires a reviewer, evidence reference and daily `{date,value,complete:true,quality:"verified",inStock:true}` observations. A reviewed real scenario requires a current audit timestamp, explicit evidence and readiness checks. Every option supplies daily spend/cash/fulfillment/production arrays, demand/inbound by canonical variant, revenue and contribution before advertising. Cash out must include spend. Resource arrays can impose material or labor capacity. All amounts use the single declared scenario currency. Legacy `EGP` field suffixes identify monetary fields; do not mix currencies.

Actuals do not inherit anything from the discarded previous DI settings. Remaining gaps include verified imported-order identity, complete historical demand, source freshness, causal/marginal response estimates, campaign/product inference, refund/cash/cost sources and the direct Apps Script source/trigger audit. These are recorded as limitations rather than silently guessed.
