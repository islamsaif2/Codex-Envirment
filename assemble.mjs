import { copyFileSync } from "node:fs";

// The current dashboard release contains the exact worker used by the launcher.
copyFileSync(new URL("./dashboard-release.mjs", import.meta.url), new URL("./worker.mjs", import.meta.url));
console.log("Assembled Ultramedix dashboard from dashboard-release.mjs");
// Apply the approved compact diagnostic canvas after copying the exact release.
await import('./enhance-diagnostic-v2.mjs');
// Replace the legacy absolute-position diagnostic tree with the approved V2 poster layout.
await import('./enhance-diagnostic-v3.mjs');
// Upgrade Daily Performance monthly card choices without changing underlying metric formulas.
await import('./enhance-daily-performance-v7.mjs');
// Daily Performance V8: weekday dates, six card slots and prior channel comparisons.
await import('./enhance-daily-performance-v8.mjs');

await import('./enhance-monthly-inventory.mjs');
