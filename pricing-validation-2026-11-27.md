# Price-effect validation — 2026-11-27

Decision: keep the Price Change Analysis tab disabled. The user confirmed historical catalog prices are accurate; the decision does not rely on disputing that confirmation.

## Data and methods
Source: Ultramedix analytics workbook, Price History, Shopify Attribution Data, Meta & GA4 Reporting, Inventory History, Order Tracking Details, D by D Pages Analysis. No source rows containing customer information are retained here.
Store model: fixed equal-product geometric price basket (62 complete products), 263 usable dates Feb 13–Nov 26; one last-click attribution model to avoid duplicated attribution models, summed reported channel sessions and completed-checkout sessions; daily ad spend, paid session share, observed size availability, linear time and weekday features. Ridge binomial logistic regression (penalty 10), compared with identical model omitting price. Eight expanding-window tests: initial 90 usable days, subsequent blocks of 21 usable days. Current incomplete day excluded. Channel uniqueness and inventory completeness are not independently audited.
Product model: existing price data join; 8,833 usable product-day rows, 62 products, 254 dates; 69 price-mismatch rows excluded, recorded stock units zero and missing availability excluded. Shopify orders containing product / GA4 product-page sessions is a proxy, not attributed conversion. Poisson offset log sessions, product intercepts, shared log-price coefficient and product-specific deviations with normal-prior/ridge MAP penalties; time, annual sine/cosine, weekday, ad spend and recorded availability; seven expanding-window tests, initial 90 usable dates then 21-date blocks. Same controls for no-price comparator. Not full posterior inference. Same-day controls are observed covariates, not necessarily known future inputs.

## Results
| Level | Held-out exposure | Metric | No price | With price |
|---|---:|---|---:|---:|
| Store | 186303 | Binomial log loss/session | .1089746682 | .1089841937 |
| Store | 186303 | Absolute daily error/session | .0081707290 | .0080910100 |
| Product | 173616 | Poisson deviance/session | .0325564882 | .0325992241 |
| Product | 173616 | Absolute product-day error/session | .0211075025 | .0211203341 |

Store log loss improved in 4/8 folds, aggregate worsened .00874%; absolute error improved .976%. Store log-price slopes across folds: .767, .258, 1.151, 1.581, 1.634, .947, -.120, -.140.
Product deviance improved in 4/7 folds, aggregate worsened .1313%; absolute error worsened .0608%. Product shared log-price slopes: -.974, -1.052, -1.302, -1.697, -1.055, -1.524, -1.757.
Product-page exposures overlap and should not be interpreted as unique store sessions.

## Limitations
Exploratory model comparison, no formal inference on metric differences, no untouched final validation beyond rolling blocks, no causal identification, no test restricted to held-out promotion events, no randomized price experiment, no full Bayesian posterior or calibrated prediction intervals, no verified separation of discount exposure and marketing campaign effects. Historical fit is not proof of counterfactual accuracy. No evidence to enable pricing forecasts from these models; this is not proof price has no effect or that all alternative models would fail. Existing dashboard code and data remain intact.
