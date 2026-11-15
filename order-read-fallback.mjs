import {readFile} from "node:fs/promises";

const refreshInterval = 5 * 60_000;
const workbookId = "1bWPoTD6FZ7vr2cfYcxxvXSbehhEwqWamao5Vgu5kR3E";
const snapshots = new Map([
  ["Order Tracking Details|A1:BA", "order-tracking"],
  ["D by D Pages Analysis|A2:K", "pages"],
  ["Regions Analysis|A1:AT", "regions"],
  ["Meta & GA4 Reporting|DW8:EZ", "ads"],
  ["Meta & GA4 Reporting|FB8:FH", "placements"],
  ["Meta & GA4 Reporting|FJ8:FU", "ga"],
  ["Meta & GA4 Reporting|CQ8:DU", "creative"],
  ["Website Mapping and Metrics|A1:G180", "map"],
  ["Cards Order|A1:D1000", "cards"],
  ["Inventory Tracking|A1:X", "inventory"],
  ["Inventory Tracking|AG1:AU", "images"]
]);
const states = new Map();

export async function readLocalOrders(spreadsheetId, sheet, range, readLive) {
  const name = snapshots.get(sheet + "|" + range);
  if (spreadsheetId !== workbookId || !name) {
    return {rows: await readLive(spreadsheetId, sheet, range), fallback: false};
  }
  if (!states.has(name)) {
    states.set(name, {
      snapshot: readFile(new URL("./" + name + "-snapshot.json", import.meta.url), "utf8").then(JSON.parse).catch(() => null),
      lastAttempt: 0
    });
  }
  const state = states.get(name);
  const snapshot = await state.snapshot;
  if (!snapshot) return {rows: await readLive(spreadsheetId, sheet, range), fallback: false};
  if (!state.refresh && Date.now() - state.lastAttempt >= refreshInterval) {
    state.lastAttempt = Date.now();
    state.refresh = readLive(spreadsheetId, sheet, range).then(rows => {
      if (rows.length > 1 && rows[0][0] && rows[0][1]) {
        state.latest = {rows, capturedAt: new Date().toISOString(), fallback: false};
      }
    }).catch(error => console.warn("[sheet fallback]", sheet, error.message))
      .finally(() => { state.refresh = undefined; });
  }
  return state.latest || {...snapshot, fallback: true};
}
