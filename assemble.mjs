import fs from "node:fs";
import path from "node:path";

const directory = path.join(process.cwd(), "source-parts");
const names = fs.readdirSync(directory).filter(name => /^part-\d{3}\.txt$/.test(name)).sort();
if (names.length !== 25) throw new Error("Incomplete Ultramedix source transfer: " + names.length + " of 25 parts");
let source = names.map(name => fs.readFileSync(path.join(directory, name), "utf8")).join("");
if (source.length !== 382097 || !source.includes("export default {")) {
  throw new Error("Invalid original Cloudflare source size: " + source.length);
}
const b64 = source.match(/const APP_HTML_B64 = "([^"]+)"/);
if (!b64) throw new Error("Embedded dashboard HTML is missing");
let html = Buffer.from(b64[1], "base64").toString("utf8");
const oldAPI = "const API='https://ultramedix-analytics-api.islam-ahmed-solutions.workers.dev'";
if (!html.includes(oldAPI)) throw new Error("Cloudflare API URL was not found; cannot safely migrate");
html = html.replace(oldAPI, "const API=''");
source = source.replace(b64[1], Buffer.from(html, "utf8").toString("base64"));
source = source.replace(
  'u.hostname === "ultramedix-analytics-api.islam-ahmed-solutions.workers.dev"',
  'u.hostname === "ultramedix-analytics-api.islam-ahmed-solutions.workers.dev" || u.hostname.endsWith(".onrender.com")'
);
fs.writeFileSync("worker.mjs", source, "utf8");
console.log("Assembled Ultramedix dashboard", { originalCharacters: 382097, generatedBytes: Buffer.byteLength(source), htmlBytes: Buffer.byteLength(html) });

// Apply the Meta Explorer redesign after reconstructing the original Worker.
await import("./enhance-explorer.mjs");
await import("./fix-meta-reporting.mjs");
await import("./enhance-meta-v3.mjs");
await import("./enhance-v5.mjs");
await import("./enhance-v6.mjs");
await import("./enhance-v7.mjs");
await import("./enhance-v8.mjs");
await import("./enhance-v9.mjs");
await import("./enhance-v10.mjs");
