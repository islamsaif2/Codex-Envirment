## Diagnostic decomposition

`diagnoseChannels(rows,{store,model,asOf})` analyzes the existing attribution data for a selected completed day. It compares ONLY previous dates with the same weekday, using up to 84 days of history.

For eligible channels it separates differences into:
- **Within-segment order gap:** current orders minus orders expected using each channel's historical order/session rate at its current sessions.
- **Traffic mix contribution:** expected orders under current channel mix minus expected orders at the historical blended order/session rate.

The two components add to a descriptive overall gap *over eligible segments*; these are mathematical accounting decompositions, NOT causal drivers or proof of an intervention effect.

No comparison to yesterday, no claim about checkout errors, campaigns, promotions or shipping without linked evidence. Excluded channels should be shown prominently. No inference for incomplete dates. Before production use: test the model on actual dated channel exports, reconcile attribution model and time zone, review duplicates/late uploads, and improve coverage and uncertainty treatment.

The integrated read-only endpoint returns `diagnosis` alongside `findings` on feature branch only.
