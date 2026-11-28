/** GA4 page analysis. Uses the authorized GA4EgyptImporter.gs helpers. */
var GP4_ = Object.freeze({
  configKey: 'GA4_PAGES_CONFIG_V1', jobKey: 'GA4_PAGES_JOB_V1', handler: 'syncGA4Pages',
  sheetName: 'D by D Pages Analysis', sheetId: 685733836,
  headers: ['Day', 'Page title', 'Sessions', 'Engaged sessions', 'Engagement rate', 'Bounce rate', 'Average session duration', 'Total users', 'New users', 'Page path', 'Old Users'],
  dimensions: ['date', 'pageTitle', 'pagePath'],
  metrics: ['sessions', 'engagedSessions', 'engagementRate', 'bounceRate', 'averageSessionDuration', 'totalUsers', 'newUsers']
});

/** One function for connection, manual refresh, the 12-hour schedule and continuation. */
function syncGA4Pages(event) {
  var props = PropertiesService.getUserProperties(), started = Date.now();
  var lock = LockService.getScriptLock(), config = ga4ReadJson_(props, GP4_.configKey);
  if (!lock.tryLock(20000)) {
    config = config || {};
    gp4Continue_(config, props, 120000);
    console.log('Another automation is running. Page analysis will retry in approximately 2 minutes.');
    return;
  }
  try {
    var connected = ga4ReadJson_(props, GA4_.configKey);
    if (!connected) throw Error('Connect the existing GA4 importer first using syncGA4.');
    config = Object.assign({}, config || {}, {spreadsheetId: connected.spreadsheetId,
      propertyId: connected.propertyId, timeZone: connected.timeZone, sheetId: GP4_.sheetId, sheetName: GP4_.sheetName});
    var settings = Sheets.Spreadsheets.Values.get(config.spreadsheetId, "'Automation Settings'!AL10:AL24", {valueRenderOption: 'FORMATTED_VALUE'}).values || [];
    var input = function (n) { return settings[n] && String(settings[n][0] || ''); };
    if (input(0) !== String(config.propertyId) || input(1) !== 'Egypt' || input(6) !== GP4_.sheetName || input(7) !== 'A:K' || input(8) !== '2' || input(9) !== '4') throw Error('Restore the page-analysis property and export coordinates in Automation Settings!AK:AL.');
    var hours = Number(input(12)), days = Number(input(13)), start = input(2), today = ga4Day_(new Date(), config.timeZone);
    if ([1, 2, 4, 6, 8, 12].indexOf(hours) < 0 || !Number.isInteger(days) || days < 1 || days > 30 || !/^\d{4}-\d{2}-\d{2}$/.test(start) || ga4ShiftDay_(start, 0) !== start || start > today) throw Error('Choose valid page-analysis schedule, refresh window and history date.');
    if (config.scheduleHours && config.scheduleHours !== hours) gp4DeleteTrigger_(config.scheduleId);
    config.startDate = start; config.scheduleHours = hours; config.refreshDays = days;
    var ss = SpreadsheetApp.openById(config.spreadsheetId), sheet = ss.getSheetById(config.sheetId);
    if (!sheet || sheet.getName() !== GP4_.sheetName) throw Error('Page-analysis destination is missing or renamed.');
    if (!config.validated) {
      var query = gp4Request_(today, 0);
      var metadata = AnalyticsData.Properties.getMetadata('properties/' + config.propertyId + '/metadata');
      var available = (metadata.dimensions || []).concat(metadata.metrics || []).map(function (m) { return m.apiName; });
      GP4_.dimensions.concat(GP4_.metrics).forEach(function (name) { if (available.indexOf(name) < 0) throw Error('GA4 field unavailable: ' + name); });
      var compatibility = AnalyticsData.Properties.checkCompatibility({dimensions: query.dimensions, metrics: query.metrics, dimensionFilter: query.dimensionFilter}, 'properties/' + config.propertyId);
      if (ga4IncompatibleRequested_(compatibility, query).length) throw Error('GA4 page-analysis fields are incompatible.');
      config.validated = true;
    }
    gp4Migrate_(config, sheet);
    if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getUniqueId() === config.scheduleId; })) config.scheduleId = ScriptApp.newTrigger(GP4_.handler).timeBased().everyHours(hours).create().getUniqueId();
    props.setProperty(GP4_.configKey, JSON.stringify(config));
    gp4Continue_(config, props, 7 * 60000);
    var job = ga4ReadJson_(props, GP4_.jobKey);
    if (!job || job.today !== today || job.propertyId !== config.propertyId || job.startDate !== start || job.refreshDays !== days) {
      job = {today: today, propertyId: config.propertyId, startDate: start, refreshDays: days, cycleId: Utilities.getUuid()};
      props.setProperty(GP4_.jobKey, JSON.stringify(job));
    }
    var ledger = ga4MetadataLedger_(config), existing = gp4Read_(config);
    var done = {}; ledger.forEach(function (r) { if (r[4] === job.cycleId) done[r[0]] = true; });
    var queue = ga4Queue_(today, start, ledger, existing, days).filter(function (d) { return !done[d]; });
    while (queue.length) {
      if (Date.now() - started > GA4_.budgetMs - 20000) { gp4Status_(config, 'Continuing automatically; ' + queue.length + ' dates remaining.'); gp4Continue_(config, props, 60000); return; }
      var day = queue[0]; gp4Status_(config, 'Importing ' + day + '; ' + queue.length + ' dates remaining.');
      var result = gp4Fetch_(config, day, started);
      if (!result) { gp4Continue_(config, props, 60000); return; }
      existing = gp4Read_(config);
      var plan = gp4Publication_(config, existing, day, result.rows);
      var previous = ga4MetadataLedger_(config).filter(function (r) { return r[0] === day; })[0];
      var notes = (day === today ? ['Today is partial.'] : []).concat(result.notes);
      var requests = plan.requests;
      var capacity = Sheets.Spreadsheets.get(config.spreadsheetId, {fields: 'sheets.properties'}).sheets.filter(function (s) { return s.properties.sheetId === config.sheetId; })[0].properties.gridProperties.rowCount;
      if (plan.requiredRows > capacity) requests.unshift({appendDimension: {sheetId: config.sheetId, dimension: 'ROWS', length: Math.max(100, plan.requiredRows - capacity)}});
      requests.push(ga4LedgerRequest_(config, [day, new Date().toISOString(), result.rows.length, notes.join(' ') || 'No API quality flags.', job.cycleId], previous));
      Sheets.Spreadsheets.batchUpdate({requests: requests}, config.spreadsheetId);
      queue.shift();
    }
    var stamp = Utilities.formatDate(new Date(), config.timeZone, 'yyyy-MM-dd HH:mm:ss');
    Sheets.Spreadsheets.Values.batchUpdate({valueInputOption: 'RAW', data: [
      {range: "'Automation Settings'!AL30:AL32", values: [[stamp], ['Import cycle complete.'], ['Today is partial; recent dates can change.']]},
      {range: "'D by D Pages Analysis'!A1", values: [['Pages analysis · Egypt\nLast updated ' + stamp]]}
    ]}, config.spreadsheetId);
    props.deleteProperty(GP4_.jobKey); gp4DeleteTrigger_(config.continuationId); delete config.continuationId;
    props.setProperty(GP4_.configKey, JSON.stringify(config));
    console.log('Page analysis complete. Every ' + hours + ' hours; today + previous ' + days + ' days.');
  } catch (error) {
    if (config && config.spreadsheetId) { try { gp4Status_(config, 'Import stopped: ' + String(error.message || error).slice(0, 900)); } catch (ignored) {} }
    if (ga4ErrorKind_(String(error.message || error)) === 'temporary') gp4Continue_(config || {}, props, 10 * 60000);
    else { gp4DeleteTrigger_(config && config.continuationId); if (config) { delete config.continuationId; props.setProperty(GP4_.configKey, JSON.stringify(config)); } }
    throw error;
  } finally { lock.releaseLock(); }
}
function gp4DeleteTrigger_(id) { if (id) ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getUniqueId() === id) ScriptApp.deleteTrigger(t); }); }
function gp4Continue_(config, props, delay) {
  gp4DeleteTrigger_(config.continuationId);
  config.continuationId = ScriptApp.newTrigger(GP4_.handler).timeBased().after(delay).create().getUniqueId();
  props.setProperty(GP4_.configKey, JSON.stringify(config));
}
function gp4Status_(config, message) { Sheets.Spreadsheets.Values.update({values: [[message]]}, config.spreadsheetId, "'Automation Settings'!AL31", {valueInputOption: 'RAW'}); }
function gp4Request_(day, offset) {
  return {dateRanges: [{startDate: day, endDate: day}], dimensions: GP4_.dimensions.map(function (name) { return {name: name}; }),
    metrics: GP4_.metrics.map(function (name) { return {name: name}; }),
    dimensionFilter: {filter: {fieldName: 'countryId', stringFilter: {matchType: 'EXACT', value: 'EG'}}},
    orderBys: [{dimension: {dimensionName: 'date'}, desc: true}, {dimension: {dimensionName: 'pagePath'}}, {dimension: {dimensionName: 'pageTitle'}}],
    offset: String(offset), limit: String(GA4_.pageSize), keepEmptyRows: false};
}
function gp4Row_(row, day) {
  if (!row.dimensionValues || row.dimensionValues.length !== 3 || !row.metricValues || row.metricValues.length !== 7 || row.dimensionValues[0].value !== day.replace(/-/g, '')) throw Error('Incomplete or unexpected page-analysis row.');
  var m = row.metricValues.map(function (v) { if (v.value === undefined || String(v.value).trim() === '' || !isFinite(Number(v.value)) || Number(v.value) < 0) throw Error('Invalid GA4 page metric.'); return Number(v.value); });
  if (m[2] > 1 || m[3] > 1) throw Error('GA4 engagement/bounce rate outside 0–1.');
  return [day, String(row.dimensionValues[1].value || ''), m[0], m[1], m[2], m[3], m[4], m[5], m[6], String(row.dimensionValues[2].value || ''), m[5] - m[6]];
}
function gp4Key_(r) { return JSON.stringify([r[0], r[1], r[9]]); }
function gp4Fetch_(config, day, started) {
  var rows = [], offset = 0, expected = null, keys = {}, notes = [];
  while (true) {
    if (Date.now() - started >= GA4_.budgetMs - 15000) return null;
    var response = ga4Call_(function () { return AnalyticsData.Properties.runReport(gp4Request_(day, offset), 'properties/' + config.propertyId); }, started);
    if ((response.dimensionHeaders || []).map(function (r) { return r.name; }).join(',') !== GP4_.dimensions.join(',') || (response.metricHeaders || []).map(function (r) { return r.name; }).join(',') !== GP4_.metrics.join(',')) throw Error('GA4 page-analysis columns changed unexpectedly.');
    var count = Number(response.rowCount || 0); if (!Number.isInteger(count) || count < 0) throw Error('Invalid GA4 row count.');
    if (expected === null) expected = count;
    if (count !== expected) throw Error('GA4 data changed during pagination.');
    var page = response.rows || [];
    page.forEach(function (r) { var row = gp4Row_(r, day), key = gp4Key_(row); if (keys[key]) throw Error('Duplicate GA4 page during pagination. Retry this day.'); keys[key] = true; rows.push(row); });
    notes = notes.concat(ga4Quality_(response.metadata)); offset += page.length;
    if (offset >= expected) break;
    if (!page.length) throw Error('GA4 pagination ended before all rows arrived.');
  }
  if (rows.length !== expected) throw Error('Incomplete page-analysis report.');
  rows.sort(function (a, b) { return b[2] - a[2] || a[9].localeCompare(b[9]) || a[1].localeCompare(b[1]); });
  return {rows: rows, notes: Array.from(new Set(notes))};
}
function gp4Read_(config) {
  var rows = Sheets.Spreadsheets.Values.get(config.spreadsheetId, "'D by D Pages Analysis'!A4:K", {valueRenderOption: 'UNFORMATTED_VALUE'}).values || [];
  return gp4Normalize_(rows);
}
function gp4Normalize_(rows) {
  var seen = {}, previous;
  return rows.filter(function (r) { return r[0] !== '' && r[0] !== null && r[0] !== undefined; }).map(function (r) {
    var row = r.slice(0, 11); row[0] = typeof row[0] === 'number' ? new Date(Date.UTC(1899, 11, 30) + Math.round(row[0]) * 86400000).toISOString().slice(0, 10) : String(row[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0]) || (previous && previous < row[0])) throw Error('Page-analysis dates must be valid and newest first.');
    previous = row[0]; var key = gp4Key_(row); if (seen[key]) throw Error('Duplicate existing page day/title/path.'); seen[key] = true;
    row[10] = typeof row[7] === 'number' && typeof row[8] === 'number' ? row[7] - row[8] : '';
    return row;
  });
}
function gp4Migrate_(config, sheet) {
  var marker = Sheets.Spreadsheets.DeveloperMetadata.search({dataFilters: [{developerMetadataLookup: {metadataKey: 'GA4_PAGES_LAYOUT_V1', metadataLocation: {sheetId: config.sheetId}, locationMatchingStrategy: 'EXACT_LOCATION'}}]}, config.spreadsheetId);
  if ((marker.matchedDeveloperMetadata || []).length) return;
  var raw = Sheets.Spreadsheets.Values.get(config.spreadsheetId, "'D by D Pages Analysis'!A3:J", {valueRenderOption: 'UNFORMATTED_VALUE'}).values || [];
  var rows = gp4Normalize_(raw);
  if (rows.length !== raw.length) throw Error('Existing page export has internal blank rows; repair before migration.');
  var requests = [], end = rows.length + 3;
  if (end > sheet.getMaxRows()) requests.push({appendDimension: {sheetId: config.sheetId, dimension: 'ROWS', length: Math.max(100, end - sheet.getMaxRows())}});
  if (rows.length) requests.push({copyPaste: {source: {sheetId: config.sheetId, startRowIndex: 2, endRowIndex: rows.length + 2, startColumnIndex: 0, endColumnIndex: 11}, destination: {sheetId: config.sheetId, startRowIndex: 3, endRowIndex: end, startColumnIndex: 0, endColumnIndex: 11}, pasteType: 'PASTE_VALUES'}});
  requests.push({updateCells: {range: {sheetId: config.sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 11}, fields: 'userEnteredValue'}});
  requests.push({updateCells: {start: {sheetId: config.sheetId, rowIndex: 1, columnIndex: 0}, rows: [ga4Cells_(GP4_.headers)], fields: 'userEnteredValue'}});
  requests.push({createDeveloperMetadata: {developerMetadata: {metadataKey: 'GA4_PAGES_LAYOUT_V1', metadataValue: 'row4', location: {sheetId: config.sheetId}, visibility: 'DOCUMENT'}}});
  requests.push({repeatCell: {range: {sheetId: config.sheetId, startRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1}, cell: {userEnteredFormat: {numberFormat: {type: 'DATE', pattern: 'yyyy-mm-dd'}}}, fields: 'userEnteredFormat.numberFormat'}});
  Sheets.Spreadsheets.batchUpdate({requests: requests}, config.spreadsheetId);
  console.log('Page-analysis history moved to row 4; ' + rows.length + ' rows preserved.');
}
function gp4Publication_(config, existing, day, fresh) {
  var first = existing.findIndex(function (r) { return r[0] <= day; }); if (first < 0) first = existing.length;
  var count = 0; while (first + count < existing.length && existing[first + count][0] === day) count++;
  var delta = fresh.length - count, tail = first + count, requests = [];
  var range = function (start, end) { return {sheetId: config.sheetId, startRowIndex: start + 3, endRowIndex: end + 3, startColumnIndex: 0, endColumnIndex: 11}; };
  if (delta && tail < existing.length) requests.push({copyPaste: {source: range(tail, existing.length), destination: range(tail + delta, existing.length + delta), pasteType: 'PASTE_VALUES'}});
  if (fresh.length) requests.push({updateCells: {range: range(first, first + fresh.length), rows: fresh.map(ga4ExportCells_), fields: 'userEnteredValue'}});
  if (delta < 0) requests.push({updateCells: {range: range(existing.length + delta, existing.length), fields: 'userEnteredValue'}});
  return {requests: requests, requiredRows: existing.length + delta + 3};
}
