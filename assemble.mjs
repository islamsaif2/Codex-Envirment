import { copyFileSync } from "node:fs";

// The current dashboard release contains the exact worker used by the launcher.
copyFileSync(new URL("./dashboard-release.mjs", import.meta.url), new URL("./worker.mjs", import.meta.url));
console.log("Assembled Ultramedix dashboard from dashboard-release.mjs");
// Apply the approved compact diagnostic canvas after copying the exact release.
await import('./enhance-diagnostic-v2.mjs');
