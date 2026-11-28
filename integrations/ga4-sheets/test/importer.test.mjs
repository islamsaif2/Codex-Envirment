import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function context(extra = {}) {
  const c = vm.createContext({console, Utilities: {sleep() {}, getUuid: () => 'cycle-1', formatDate: (date, zone) => new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(date)}, ...extra});
  vm.runInContext(source, c);
  return c;
}
function apiRow(day = '20261127', region = '', values = [4, 4, 0, 0, 466.5618398, 8.25, 343, 0]) {
  return {dimensionValues: [{value: day}, {value: region}], metricValues: values.map(value => ({value: String(value)}))};
}
function report(c, rows, rowCount = rows.length, metadata = {}) {
  return {dimensionHeaders: [{name: 'date'}, {name: 'region'}], metricHeaders: c.GA4_.metrics.map(name => ({name})), rows, rowCount, metadata};
}
function props(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {getProperty: key => store.get(key) ?? null, setProperty(key, value) {store.set(key, value); return this;}, deleteProperty(key) {store.delete(key); return this;}, store};
}

test('matches the user example, preserves unknown regions and uses seconds per session', () => {
  const c = context();
  const row = plain(c.ga4Row_(apiRow(), '2026-11-27'));
  assert.deepEqual(row, ['2026-11-27', 4, 4, 0, 0, 466.5618398, 8.25, 343, 0, '', 85.75]);
  const other = plain(c.ga4Row_(apiRow('20261127', 'Al-Qalyubia Governorate', [44, 41, 23, 14, 421.938569, 16.47727273, 5260, 3 / 44]), '2026-11-27'));
  assert.equal(other[10], 5260 / 44);
  assert.equal(other[8], 3 / 44);
  assert.equal(c.ga4Row_(apiRow('20261127', '', [0, 0, 0, 0, 0, 0, 0, 0]), '2026-11-27')[10], '');
});

test('filters Egypt at the API, requests the exact metrics and orders newest date first', () => {
  const c = context(), request = plain(c.ga4Request_('2026-11-27', 1000));
  assert.equal(request.dimensionFilter.filter.fieldName, 'countryId');
  assert.equal(request.dimensionFilter.filter.stringFilter.value, 'EG');
  assert.deepEqual(request.dateRanges, [{startDate: '2026-11-27', endDate: '2026-11-27'}]);
  assert.deepEqual(request.metrics.map(x => x.name), plain(c.GA4_.metrics));
  assert.equal(request.orderBys[0].desc, true);
  assert.equal(request.offset, 1000);
});

test('rolling refresh includes today and seven completed days, repairs older gaps and missing rows', () => {
  const c = context();
  const ledger = c.ga4Days_('2026-11-01', '2026-11-28').map(day => [day, '', day === '2026-11-07' ? 0 : 1, '', 'old']);
  const rows = ledger.filter(r => r[0] !== '2026-11-03' && r[2] > 0).map(r => [r[0]]);
  const queue = plain(c.ga4Queue_('2026-11-28', '2026-11-01', ledger, rows));
  assert.equal(queue.length, 9);
  assert.equal(queue[0], '2026-11-28');
  assert.equal(queue.at(-1), '2026-11-03');
  assert.ok(!queue.includes('2026-11-07'), 'a successfully empty day is not a missing import');
  assert.ok(queue.includes('2026-11-21'));
});

test('a revised date replaces its full region set, moves older dates down and is idempotent', () => {
  const c = context();
  const old = [c.ga4Row_(apiRow('20261126', 'Cairo'), '2026-11-26'), c.ga4Row_(apiRow('20261127', 'Removed region'), '2026-11-27')];
  const fresh = [c.ga4Row_(apiRow('20261127', 'Cairo'), '2026-11-27'), c.ga4Row_(apiRow('20261127', 'Alexandria'), '2026-11-27')];
  const merged = plain(c.ga4MergeDay_(old, '2026-11-27', fresh));
  assert.deepEqual(merged.map(r => [r[0], r[9]]), [['2026-11-27', 'Alexandria'], ['2026-11-27', 'Cairo'], ['2026-11-26', 'Cairo']]);
  assert.deepEqual(plain(c.ga4MergeDay_(merged, '2026-11-27', fresh)), merged);
  assert.equal(c.ga4MergeDay_(merged, '2026-11-27', []).length, 1);
});

test('rejects missing numbers, invalid dates, out-of-range rates and duplicate source rows', () => {
  const c = context();
  const bad = apiRow(); bad.metricValues[1].value = '';
  assert.throws(() => c.ga4Row_(bad, '2026-11-27'), /Missing GA4/);
  assert.throws(() => c.ga4Row_(apiRow(), '2026-11-26'), /outside/);
  assert.throws(() => c.ga4Row_(apiRow('20261127', '', [4, 4, 0, 0, 1, 1, 1, 20]), '2026-11-27'), /bounce rate/);
  const row = c.ga4Row_(apiRow(), '2026-11-27');
  assert.throws(() => c.ga4MergeDay_([row, row], '2026-11-28', []), /Duplicate/);
});

test('pagination is complete and carries thresholding, sampling and data-loss warnings', () => {
  const c = context(); let calls = 0;
  c.AnalyticsData = {Properties: {runReport(request) {
    calls++; assert.equal(request.offset, calls - 1);
    return report(c, [apiRow('20261127', calls === 1 ? 'Cairo' : 'Alexandria')], 2, {subjectToThresholding: true, dataLossFromOtherRow: true, samplingMetadatas: [{}]});
  }}};
  const result = c.ga4FetchDay_({propertyId: '123'}, '2026-11-27', Date.now());
  assert.equal(result.rows.length, 2); assert.equal(result.notes.length, 3);
});

test('pagination changing underneath the import never publishes an incomplete day', () => {
  const c = context(); let calls = 0;
  c.AnalyticsData = {Properties: {runReport() {calls++; return report(c, [apiRow('20261127', 'R' + calls)], calls === 1 ? 2 : 3);}}};
  assert.throws(() => c.ga4FetchDay_({propertyId: '123'}, '2026-11-27', Date.now()), /changed during pagination/);
  c.AnalyticsData.Properties.runReport = () => report(c, [], 2);
  assert.throws(() => c.ga4FetchDay_({propertyId: '123'}, '2026-11-27', Date.now()), /before all rows/);
});

test('time budget yields before requesting another page and leaves publication to a later run', () => {
  const c = context(); let called = false;
  c.AnalyticsData = {Properties: {runReport() {called = true;}}};
  assert.equal(c.ga4FetchDay_({propertyId: '123'}, '2026-11-27', Date.now() - 300000), null);
  assert.equal(called, false);
});

test('retry policy retries temporary failures and does not retry permission failures', () => {
  const c = context(); let count = 0;
  assert.equal(c.ga4Call_(() => {if (++count < 3) throw Error('503 backend error'); return 'ok';}, Date.now()), 'ok');
  assert.equal(count, 3); count = 0;
  assert.throws(() => c.ga4Call_(() => {count++; throw Error('403 permission denied');}, Date.now()), /permission/);
  assert.equal(count, 1);
});

test('property timezone controls day boundaries and shifting is independent of DST', () => {
  const c = context();
  assert.equal(c.ga4Day_(new Date('2026-11-27T22:30:00Z'), 'Africa/Cairo'), '2026-11-28');
  assert.equal(c.ga4ShiftDay_('2026-03-01', -1), '2026-02-28');
  assert.equal(c.ga4ShiftDay_('2024-03-01', -1), '2024-02-29');
});

test('writes only B3:L and commits data plus completion ledger in one atomic batch', () => {
  const c = context(); let captured;
  const older = c.ga4Row_(apiRow('20261126', 'Cairo'), '2026-11-26');
  const fresh = c.ga4Row_(apiRow('20261127', '=IMPORTDATA("bad")'), '2026-11-27');
  const data = {getLastRow: () => 3, getMaxRows: () => 20000, getSheetId: () => 10, getRange(row, col) {assert.equal(row, 3); assert.equal(col, 2); return {getValues: () => [older]};}};
  const log = {getLastRow: () => 7, getMaxRows: () => 1000, getSheetId: () => 11};
  c.SpreadsheetApp = {flush() {}};
  c.Sheets = {Spreadsheets: {batchUpdate(body) {captured = plain(body);}}};
  c.ga4PublishDay_({getId: () => 'sheet'}, data, log, '2026-11-27', {rows: [fresh], notes: []}, {today: '2026-11-28', cycleId: 'cycle'});
  assert.equal(captured.requests.length, 2);
  const update = captured.requests[0].updateCells;
  assert.deepEqual(update.range, {sheetId: 10, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 12});
  assert.equal(update.rows[0].values[9].userEnteredValue.stringValue, '=IMPORTDATA("bad")');
  assert.equal(update.rows[1].values[0].userEnteredValue.stringValue, '2026-11-26');
  assert.equal(captured.requests[1].updateCells.range.startRowIndex, 7);
  assert.ok(!captured.requests.some(r => r.insertDimension || r.appendDimension));
});

test('capacity exhaustion stops before writing or inserting entire data rows', () => {
  const c = context(); let wrote = false;
  c.Sheets = {Spreadsheets: {batchUpdate() {wrote = true;}}};
  const data = {getLastRow: () => 2, getMaxRows: () => 2, getSheetId: () => 10};
  const log = {getLastRow: () => 7, getMaxRows: () => 1000, getSheetId: () => 11};
  assert.throws(() => c.ga4PublishDay_({getId: () => 'sheet'}, data, log, '2026-11-27', {rows: [c.ga4Row_(apiRow(), '2026-11-27')], notes: []}, {today: '2026-11-28', cycleId: 'cycle'}), /capacity/);
  assert.equal(wrote, false);
});

test('one 12-hour schedule and one continuation are retained without touching unrelated triggers', () => {
  const c = context(), p = props(); let seq = 0;
  let triggers = [{getUniqueId: () => 'unrelated'}], intervals = [];
  c.ScriptApp = {getProjectTriggers: () => triggers, deleteTrigger(t) {triggers = triggers.filter(x => x !== t);}, newTrigger(handler) {
    assert.equal(handler, 'syncGA4'); const b = {timeBased: () => b, everyHours(h) {intervals.push(h); return b;}, after() {return b;}, create() {const id = 'trigger-' + ++seq, t = {getUniqueId: () => id}; triggers.push(t); return t;}}; return b;
  }};
  const cfg = {};
  c.ga4EnsureSchedule_(cfg, p); c.ga4EnsureSchedule_(cfg, p);
  c.ga4SetContinuation_(cfg, p, 60000); c.ga4SetContinuation_(cfg, p, 60000);
  assert.deepEqual(intervals, [12]); assert.equal(triggers.length, 3);
  c.ga4RemoveContinuation_(cfg, p); assert.equal(triggers.length, 2);
  assert.ok(triggers.some(t => t.getUniqueId() === 'unrelated'));
});

test('hard-stop recovery skips atomically completed days and resumes missing days', () => {
  const c = context(), p = props({GA4_EGYPT_JOB_V1: JSON.stringify({propertyId: '123', today: '2026-11-28', cycleId: 'interrupted'})});
  const ledger = c.ga4Days_('2026-11-21', '2026-11-28').map(day => [day, '', 0, '', day >= '2026-11-27' ? 'interrupted' : 'old']);
  const log = {getRange(name) {return {setValue() {}};}};
  const data = {}, ss = {getSheetById: id => id === 10 ? data : log};
  c.SpreadsheetApp = {openById: () => ss};
  c.ga4ReadLedger_ = () => ledger; c.ga4ReadData_ = () => [];
  c.ga4Day_ = () => '2026-11-28'; c.ga4SetContinuation_ = () => {}; c.ga4RemoveContinuation_ = () => {}; c.ga4Status_ = () => {};
  const fetched = [];
  c.ga4FetchDay_ = (cfg, day) => {fetched.push(day); return {rows: [], notes: []};};
  c.ga4PublishDay_ = () => {};
  const result = c.ga4Run_({propertyId: '123', startDate: '2026-11-21', spreadsheetId: 'sheet', sheetId: 10, logSheetId: 11}, p, Date.now());
  assert.equal(result.pending, false); assert.equal(fetched.length, 6);
  assert.equal(fetched[0], '2026-11-26'); assert.equal(p.getProperty('GA4_EGYPT_JOB_V1'), null);
});

test('manifest uses Google-managed read-only analytics authorization without API keys or stored tokens', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../appsscript.json', import.meta.url)));
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/analytics.readonly'));
  assert.equal(manifest.dependencies.enabledAdvancedServices.length, 3);
  assert.ok(!/UrlFetchApp|access_token|refresh_token|client_secret|api_key/.test(source));
  const publics = [...source.matchAll(/^function (\w+)\(/gm)].map(m => m[1]).filter(n => !n.endsWith('_'));
  assert.deepEqual(publics, ['syncGA4']);
});

test('standalone project without a spreadsheet UI falls back to the setup tab', () => {
  const c = context(), p = props(); let fallback = 0;
  c.ga4Properties_ = () => [{id: '123', name: 'Ultramedix', account: 'Account'}];
  c.SpreadsheetApp = {getUi() {throw Error('Cannot call SpreadsheetApp.getUi() from this context.');}};
  c.ga4SetupTab_ = (properties, store) => {fallback++; assert.equal(properties[0].id, '123'); assert.equal(store, p); return {message: 'Select B3'};};
  assert.equal(c.ga4ShowSetup_(p).message, 'Select B3');
  assert.equal(fallback, 1);
});

test('standalone destination uses the configured spreadsheet; a bound project keeps its own spreadsheet', () => {
  const c = context(); let id;
  c.SpreadsheetApp = {getActiveSpreadsheet: () => null, openById(value) {id = value; return 'standalone';}};
  assert.equal(c.ga4Destination_(), 'standalone');
  assert.equal(id, c.GA4_.destinationSpreadsheetId);
  c.SpreadsheetApp.getActiveSpreadsheet = () => 'bound';
  assert.equal(c.ga4Destination_(), 'bound');
});

test('setup property dropdown validates actual accessible choices and connects on the same entry flow', () => {
  const c = context(), p = props({GA4_EGYPT_SETUP_V1: JSON.stringify({spreadsheetId: 'destination', sheetId: 77})});
  const writes = []; let options;
  const sheet = {getSheetId: () => 77, getLastRow: () => 8, getLastColumn: () => 2, getMaxRows: () => 100, getMaxColumns: () => 2, getRange(a1) {return {setDataValidation() {}, getValue: () => a1 === 'B3' ? 'Ultramedix [123] / Main' : '', setValue(v) {writes.push([a1, v]);}};}};
  c.ga4Destination_ = () => ({getId: () => 'destination', getSheetById: () => sheet, getSheetByName: () => null});
  c.SpreadsheetApp = {newDataValidation() {const b = {requireValueInList(values) {options = plain(values); return b;}, setAllowInvalid() {return b;}, build() {return b;}}; return b;}};
  c.ga4Connect_ = event => {assert.equal(event.propertyId, '123'); return {sheetName: 'GA4 Egypt - 123'};};
  assert.equal(c.ga4SetupTab_([{id: '123', name: 'Ultramedix', account: 'Main'}], p).config.sheetName, 'GA4 Egypt - 123');
  assert.deepEqual(options, ['Ultramedix [123] / Main']); assert.equal(writes.at(-1)[0], 'B8');
});

test('a timed-out sheet creation is recovered by readback without creating a duplicate', () => {
  const c = context(); let created, creates = 0, reads = 0;
  c.Sheets = {Spreadsheets: {
    get() {reads++; return {sheets: created ? [created] : []};},
    batchUpdate(body) {
      creates++; const add = body.requests[0].addSheet.properties, marker = body.requests[1].createDeveloperMetadata.developerMetadata;
      created = {properties: add, developerMetadata: [marker]};
      throw Error('Service Spreadsheets timed out while accessing document');
    }
  }};
  const sheet = {id: 'recovered'};
  c.SpreadsheetApp = {openById: () => ({getSheetById: id => {assert.equal(id, created.properties.sheetId); return sheet;}})};
  assert.equal(c.ga4OwnedSheet_({getId: () => 'book'}, 'GA4 Egypt - 123', '123', true), sheet);
  assert.equal(creates, 1); assert.equal(reads, 2);
});

test('recovers only an empty legacy field catalogue and rejects unrelated existing tabs', () => {
  const c = context(); let marked = 0;
  c.Sheets = {Spreadsheets: {get: () => ({sheets: [{properties: {sheetId: 7, title: 'GA4 Fields - 123'}}]}), Values: {get: () => ({values: []})}, batchUpdate(body) {assert.ok(body.requests[0].createDeveloperMetadata); marked++;}}};
  c.SpreadsheetApp = {openById: () => ({getSheetById: () => 'recovered'})};
  assert.equal(c.ga4OwnedSheet_({getId: () => 'book'}, 'GA4 Fields - 123', '123'), 'recovered');
  assert.equal(marked, 1);
  c.Sheets.Spreadsheets.Values.get = () => ({values: [['Existing data']]});
  assert.throws(() => c.ga4OwnedSheet_({getId: () => 'book'}, 'GA4 Fields - 123', '123'), /not owned/);
});

test('compatibility response does not reject a valid report because unrelated optional fields are incompatible', () => {
  const c = context(), query = c.ga4Request_('2026-11-28', 0);
  const response = {dimensionCompatibilities: [{dimensionMetadata: {apiName: 'date'}, compatibility: 'COMPATIBLE'}, {dimensionMetadata: {apiName: 'unrelatedAudienceField'}, compatibility: 'INCOMPATIBLE'}], metricCompatibilities: [{metricMetadata: {apiName: 'sessions'}, compatibility: 'COMPATIBLE'}]};
  assert.deepEqual(plain(c.ga4IncompatibleRequested_(response, query)), []);
  response.metricCompatibilities.push({metricMetadata: {apiName: 'addToCarts'}, compatibility: 'INCOMPATIBLE'});
  assert.deepEqual(plain(c.ga4IncompatibleRequested_(response, query)), ['addToCarts']);
});

test('temporary setup failure queues the same function automatically after authorization and property selection', () => {
  const c = context(), p = props({GA4_EGYPT_SETUP_V1: '{}'}); let released = false, delay;
  c.PropertiesService = {getUserProperties: () => p};
  c.LockService = {getScriptLock: () => ({tryLock: () => true, releaseLock() {released = true;}})};
  c.ga4ClearSetupRetry_ = () => {};
  c.ga4ShowSetup_ = () => {throw Error('Service unavailable: newly created tab is not visible yet.');};
  c.ga4SetupRetry_ = (store, ms) => {assert.equal(store, p); delay = ms;};
  assert.match(c.syncGA4({triggerUid: 'setup-retry'}).message, /continuing automatically/);
  assert.equal(delay, 60000); assert.equal(released, true);
});

test('busy shared project lock schedules recovery without changing existing GA4 data', () => {
  const c = context(), p = props({GA4_EGYPT_CONFIG_V1: '{}'}); let delay;
  c.PropertiesService = {getUserProperties: () => p};
  c.LockService = {getScriptLock: () => ({tryLock(ms) {assert.equal(ms, 20000); return false;}})};
  c.ga4SetupRetry_ = (store, ms) => {assert.equal(store, p); delay = ms;};
  c.ga4Run_ = () => {throw Error('must not write while locked');};
  assert.match(c.syncGA4().message, /retry automatically/);
  assert.equal(delay, 120000);
});

test('support-tab compaction refuses to truncate values outside the generated layout', () => {
  const c = context(); let wrote = false;
  c.Sheets = {Spreadsheets: {batchUpdate() {wrote = true;}}};
  c.ga4CompactOwned_({getId: () => 'book'}, {getLastRow: () => 8, getLastColumn: () => 7}, 100, 2);
  assert.equal(wrote, false);
});

test('shared export preserves native Sheet dates and calculates the eleventh metric without formulas', () => {
  const c = context();
  const rows = c.ga4NormalizeSheetRows_([[], [46353, 4, 4, 0, 0, 466.5618398, 8.25, 343, 0, 'Cairo']]);
  assert.equal(rows[0][0], '2026-11-27'); assert.equal(rows[0][10], 85.75);
  const cells = plain(c.ga4ExportCells_(rows[0]));
  assert.equal(cells.values[0].userEnteredValue.numberValue, 46353);
  assert.equal(cells.values[10].userEnteredValue.numberValue, 85.75);
});

test('same-size refresh only writes its own date block in AX:BH', () => {
  const c = context();
  const rows = ['2026-11-28', '2026-11-27', '2026-11-26'].map(day => c.ga4Row_(apiRow(day.replaceAll('-', ''), 'Cairo'), day));
  const changed = rows[1].slice(); changed[1] = 6;
  const merged = c.ga4MergeDay_(rows, '2026-11-27', [changed]);
  const request = plain(c.ga4SharedPublication_({sheetId: 99}, rows, merged, '2026-11-27', [changed]));
  assert.deepEqual(request.updateCells.range, {sheetId: 99, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 49, endColumnIndex: 60});
  assert.equal(request.updateCells.rows.length, 1);
  assert.equal(request.updateCells.rows[0].values[1].userEnteredValue.numberValue, 6);
});

test('adding a new date moves existing GA4 history down only within AX:BH', () => {
  const c = context();
  const old = [c.ga4Row_(apiRow('20261127', 'Cairo'), '2026-11-27')];
  const fresh = [c.ga4Row_(apiRow('20261128', 'Cairo'), '2026-11-28')];
  const merged = c.ga4MergeDay_(old, '2026-11-28', fresh);
  const request = plain(c.ga4SharedPublication_({sheetId: 99}, old, merged, '2026-11-28', fresh));
  assert.deepEqual(request.updateCells.range, {sheetId: 99, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 49, endColumnIndex: 60});
  assert.equal(request.updateCells.rows.length, 2);
  assert.equal(request.updateCells.rows[1].values[0].userEnteredValue.numberValue, 46353);
  assert.ok(!request.insertDimension);
});

test('bookkeeping is embedded as metadata and updates the same daily record on replay', () => {
  const c = context(), config = {propertyId: '123', sheetId: 99};
  const row = ['2026-11-28', 'timestamp', 25, 'Today is partial.', 'cycle'];
  const create = plain(c.ga4LedgerRequest_(config, row));
  assert.equal(create.createDeveloperMetadata.developerMetadata.location.sheetId, 99);
  assert.deepEqual(JSON.parse(create.createDeveloperMetadata.developerMetadata.metadataValue), row);
  const update = plain(c.ga4LedgerRequest_(config, row, {metadataId: 12}));
  assert.equal(update.updateDeveloperMetadata.dataFilters[0].developerMetadataLookup.metadataId, 12);
  assert.ok(!update.createDeveloperMetadata);
});

test('shared publication commits data and completion metadata atomically and leaves BI untouched', () => {
  const c = context(); let body;
  const row = c.ga4Row_(apiRow(), '2026-11-27');
  c.ga4ReadData_ = () => [row]; c.ga4MetadataLedger_ = () => [];
  c.Sheets = {Spreadsheets: {batchUpdate(value) {body = plain(value);}}};
  c.ga4PublishSharedDay_({getMaxRows: () => 149709}, {propertyId: '123', sheetId: 99, spreadsheetId: 'book'}, '2026-11-27', {rows: [row], notes: []}, {today: '2026-11-28', cycleId: 'cycle'});
  assert.equal(body.requests.length, 2);
  assert.equal(body.requests[0].updateCells.range.endColumnIndex, 60);
  assert.ok(body.requests[1].createDeveloperMetadata);
});
