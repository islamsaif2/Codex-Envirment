# Decision Intelligence MVP (isolated feature branch)

This is a first detection engine, NOT a finished AI diagnosis system or mathematical Solver.

- Data: existing Shopify Attribution Data worksheet, using the already implemented parser in server.mjs.
- Scope: one exact Shopify store, one attribution model, a completed day, and daily channel conversion defined as attributed orders / attributed sessions.
- Baseline: previous same weekdays within up to 84 days. At least 3 historical weekdays required.
- Testing: pooled two-proportion z-test with Benjamini-Hochberg correction across evaluated segments, plus a 15% relative-change filter. Sparse rows are suppressed.
- Output: evidence, observed vs baseline conversion rate, estimated order gap, multiple-test-adjusted p-value, and unverified investigation prompts.
- NO causal claims, financial impact estimates, machine learning, optimization, UI integration or notification scheduling in this first iteration.
- Excludes current date by default, since it is incomplete.
- Do NOT merge until validated on historical holdouts with known data anomalies and tracking changes.

Run: `node --test test/decision-intelligence.test.mjs`
Endpoint after integration: `/api/decision-intelligence?store=<exact-store.myshopify.com>&model=linear&asOf=YYYY-MM-DD`.

Next: build multi-metric data adapters (Meta/GA4/Bosta), history backtests, drift monitoring, decomposition, and a Decision Center UI.
