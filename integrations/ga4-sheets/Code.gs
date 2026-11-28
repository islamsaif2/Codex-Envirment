/** GA4 Egypt importer. Run only syncGA4. Google manages authorization. */
var GA4_ = Object.freeze({
  version: 1, configKey: 'GA4_EGYPT_CONFIG_V1', stateKey: 'GA4_EGYPT_JOB_V1',
  handler: 'syncGA4', marker: 'ULTRAMEDIX_GA4_IMPORTER', pageSize: 1000,
  budgetMs: 240000, refreshDays: 7, scheduleHours: 12,
  destinationSpreadsheetId: '1bWPoTD6FZ7vr2cfYcxxvXSbehhEwqWamao5Vgu5kR3E',
  setupKey: 'GA4_EGYPT_SETUP_V1',
  headers: ['Day', 'Sessions', 'Engaged sessions', 'Add to carts', 'Checkouts',
    'Average session duration', 'Views per session', 'User engagement',
    'Bounce rate', 'Region', 'Average Engaged time per session'],
  metrics: ['sessions', 'engagedSessions', 'addToCarts', 'checkouts',
    'averageSessionDuration', 'screenPageViewsPerSession', 'userEngagementDuration', 'bounceRate']
});

/** The only public entry point: setup, manual refresh, scheduled refresh and resume. */
function syncGA4(event) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    var busyMessage = 'Another project automation is holding the lock. No GA4 data was changed; run syncGA4 again shortly.';
    console.log(busyMessage);
    return {message: busyMessage};
  }
  var props = PropertiesService.getUserProperties();
  var config;
  try {
    config = ga4ReadJson_(props, GA4_.configKey);
    if (event && event.action === 'connect') {
      if (config) throw Error('Already connected. Run syncGA4 to refresh or continue.');
      config = ga4Connect_(event, props);
    }
    if (!config) {
      if (event && event.triggerUid) throw Error('Setup is incomplete. Run syncGA4 manually in the bound spreadsheet.');
      var setup = ga4ShowSetup_(props);
      if (!setup.config) return setup;
      config = setup.config;
    }
    ga4EnsureSchedule_(config, props, event);
    var outcome = ga4Run_(config, props, Date.now());
    return {message: outcome.pending ? 'Import is continuing automatically. Run syncGA4 anytime to continue manually.' : 'Import complete. Automatic refresh is scheduled every 12 hours.', sheetName: config.sheetName};
  } catch (error) {
    var message = String(error && error.message || error);
    if (config) {
      var kind = ga4ErrorKind_(message);
      ga4LogFailure_(config, message, kind);
      if (kind === 'temporary') ga4SetContinuation_(config, props, 10 * 60000);
      else ga4RemoveContinuation_(config, props);
    }
    console.error(message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function ga4ReadJson_(props, key) {
  var value = props.getProperty(key);
  return value ? JSON.parse(value) : null;
}
function ga4SaveConfig_(config, props) { props.setProperty(GA4_.configKey, JSON.stringify(config)); }
function ga4Day_(date, zone) { return Utilities.formatDate(date, zone, 'yyyy-MM-dd'); }
function ga4ShiftDay_(day, amount) {
  var date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function ga4Days_(from, through) {
  var days = [];
  for (var day = from; day <= through; day = ga4ShiftDay_(day, 1)) days.push(day);
  return days;
}
function ga4ErrorKind_(message) {
  if (/429|500|502|503|504|quota|rate.limit|resource.exhausted|timed?.?out|timeout|temporar|backend.error|internal.error|service.unavailable|too many times|changed during pagination|during pagination\. Retry|pagination ended before/i.test(message)) return 'temporary';
  if (/permission|unauthori[sz]ed|forbidden|invalid.grant|access.denied|insufficient|sign.in|authorization|401|403/i.test(message)) return 'authorization';
  return 'configuration';
}
function ga4Call_(fn, started) {
  for (var attempt = 0; ; attempt++) {
    try { return fn(); }
    catch (error) {
      if (ga4ErrorKind_(String(error.message || error)) !== 'temporary' || attempt >= 3 || Date.now() - started > GA4_.budgetMs - 20000) throw error;
      Utilities.sleep(Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 300));
    }
  }
}

function ga4Properties_() {
  var rows = [], token;
  do {
    var params = {pageSize: 200};
    if (token) params.pageToken = token;
    var page = AnalyticsAdmin.AccountSummaries.list(params);
    (page.accountSummaries || []).forEach(function (account) {
      (account.propertySummaries || []).forEach(function (property) {
        if (/^properties\/\d+$/.test(property.property)) rows.push({id: property.property.split('/')[1], name: property.displayName, account: account.displayName});
      });
    });
    token = page.nextPageToken;
  } while (token);
  return rows.sort(function (a, b) { return (a.account + a.name).localeCompare(b.account + b.name); });
}
function ga4Destination_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  if (!GA4_.destinationSpreadsheetId) throw Error('Set destinationSpreadsheetId at the top of this script for a standalone project.');
  return SpreadsheetApp.openById(GA4_.destinationSpreadsheetId);
}
function ga4SetupTab_(properties, props) {
  var ss = ga4Destination_();
  var saved = ga4ReadJson_(props, GA4_.setupKey);
  var sheet = saved && saved.spreadsheetId === ss.getId() ? ss.getSheetById(saved.sheetId) : null;
  if (!sheet) {
    sheet = ga4OwnedSheet_(ss, 'GA4 Import Setup', 'setup');
    sheet.getRange(1, 1, 8, 2).setValues([
      ['GA4 Import Setup', 'Google authorization is already handled by Apps Script.'],
      ['Instructions', 'Select your property in B3, then run syncGA4 again.'],
      ['GA4 property', ''], ['Optional history start (YYYY-MM-DD)', ''],
      ['Country', 'Egypt'], ['Schedule', 'Every 12 hours'],
      ['Output layout', 'Headers B2:L2; newest data B3:L in a separate data tab.'],
      ['Setup status', 'Waiting for your property selection.']
    ]);
    sheet.getRange('B4').setNumberFormat('@');
    sheet.setColumnWidth(1, 260); sheet.setColumnWidth(2, 620);
    sheet.getRange('A1:B1').setBackground('#174b6b').setFontColor('#ffffff').setFontWeight('bold');
    sheet.getRange('B3:B4').setBackground('#fff2cc');
    sheet.getRange('A1:B8').setWrap(true);
    props.setProperty(GA4_.setupKey, JSON.stringify({spreadsheetId: ss.getId(), sheetId: sheet.getSheetId()}));
  }
  var options = properties.map(function (p) { return p.name + ' [' + p.id + '] / ' + p.account; });
  sheet.getRange('B3').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(options, true).setAllowInvalid(false).build());
  var selected = String(sheet.getRange('B3').getValue() || '');
  var index = options.indexOf(selected);
  if (index !== -1) {
    var start = sheet.getRange('B4').getValue();
    if (start instanceof Date) start = Utilities.formatDate(start, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    sheet.getRange('B8').setValue('Connecting and importing selected property...');
    var config = ga4Connect_({propertyId: properties[index].id, startDate: String(start || '')}, props);
    sheet.getRange('B8').setValue('Connected. Data: ' + config.sheetName + '. Schedule is installed by syncGA4.');
    return {config: config};
  }
  var message = 'Select your GA4 property in GA4 Import Setup!B3, then run syncGA4 again. ' + ss.getUrl() + '#gid=' + sheet.getSheetId();
  console.log(message);
  return {message: message};
}
function ga4ShowSetup_(props) {
  var properties = ga4Properties_();
  if (!properties.length) throw Error('This Google account has no accessible GA4 properties. Sign in with a Google account that has Viewer access to your GA4 property.');
  if (props.getProperty(GA4_.setupKey)) return ga4SetupTab_(properties, props);
  var ui;
  try { ui = SpreadsheetApp.getUi(); }
  catch (error) {
    if (!/Cannot call SpreadsheetApp\.getUi\(\) from this context/i.test(String(error.message || error))) throw error;
    return ga4SetupTab_(properties, props);
  }
  var data = JSON.stringify(properties).replace(/</g, '\\u003c');
  var html = '<!doctype html><html><head><base target="_top"><style>' +
    'body{font:14px Arial,sans-serif;color:#163047;padding:18px}h2{font-size:20px}label{display:block;margin:18px 0 6px}select,input,button{box-sizing:border-box;width:100%;padding:10px}button{margin-top:20px;background:#145b8c;color:white;border:0;border-radius:5px;cursor:pointer}p{line-height:1.5}.note{color:#536574}#status{white-space:pre-wrap}</style></head><body>' +
    '<h2>Connect GA4 to Sheets</h2><p>Your Google authorization is managed by Apps Script. No API key or token is needed.</p>' +
    '<label for="property">GA4 account / property</label><select id="property"></select>' +
    '<label for="start">Optional history start date</label><input id="start" type="date"><p class="note">Leave empty to start with today and the previous 7 days. Choose an earlier date for an initial backfill.</p>' +
    '<p>Country: Egypt<br>Schedule: every 12 hours<br>Refresh: today + previous 7 days<br>Header: B2:L2<br>Newest data: B3:L, older data moves down within this range</p>' +
    '<p class="note">Creates separate GA4 data, sync status and field catalogue tabs. Existing tabs stay untouched.</p>' +
    '<button id="connect">Connect and import</button><p id="status" role="status"></p><script>' +
    'var properties=' + data + ';properties.forEach(function(p){var o=document.createElement("option");o.value=p.id;o.textContent=p.account+" / "+p.name+" ("+p.id+")";document.getElementById("property").appendChild(o)});' +
    'document.getElementById("connect").onclick=function(){var b=this;b.disabled=true;document.getElementById("status").textContent="Checking property and starting import. You can leave this sidebar open.";' +
    'google.script.run.withSuccessHandler(function(r){document.getElementById("status").textContent=r.message+"\\nData tab: "+(r.sheetName||"");}).withFailureHandler(function(e){b.disabled=false;document.getElementById("status").textContent=e.message;}).syncGA4({action:"connect",propertyId:document.getElementById("property").value,startDate:document.getElementById("start").value});};' +
    '</script></body></html>';
  ui.showSidebar(HtmlService.createHtmlOutput(html).setTitle('GA4 Egypt import'));
  return {message: 'Choose your GA4 property in the sidebar.'};
}

function ga4Request_(day, offset) {
  return {
    dateRanges: [{startDate: day, endDate: day}],
    dimensions: [{name: 'date'}, {name: 'region'}],
    metrics: GA4_.metrics.map(function (name) { return {name: name}; }),
    dimensionFilter: {filter: {fieldName: 'countryId', stringFilter: {matchType: 'EXACT', value: 'EG', caseSensitive: true}}},
    orderBys: [{dimension: {dimensionName: 'date'}, desc: true}, {dimension: {dimensionName: 'region'}}],
    limit: GA4_.pageSize, offset: offset, returnPropertyQuota: true
  };
}
function ga4OwnedSheet_(ss, name, propertyId, isData) {
  var started = Date.now();
  var sheetId = ga4Call_(function () {
    // Read back on every retry: a timed-out create may already have committed.
    var metadata = Sheets.Spreadsheets.get(ss.getId(), {fields: 'sheets(properties(sheetId,title),developerMetadata(metadataKey,metadataValue))'});
    var found = (metadata.sheets || []).filter(function (s) { return s.properties.title === name; })[0];
    if (found) {
      var owned = (found.developerMetadata || []).some(function (m) { return m.metadataKey === GA4_.marker && m.metadataValue === propertyId; });
      if (!owned && name === 'GA4 Fields - ' + propertyId) {
        // Compatibility with the previous version's interrupted create: only an empty field catalogue can be recovered.
        var contents = Sheets.Spreadsheets.Values.get(ss.getId(), "'" + name.replace(/'/g, "''") + "'!A:D");
        if (!(contents.values || []).some(function (r) { return r.some(function (v) { return v !== ''; }); })) {
          Sheets.Spreadsheets.batchUpdate({requests: [{createDeveloperMetadata: {developerMetadata: {metadataKey: GA4_.marker, metadataValue: propertyId, visibility: 'DOCUMENT', location: {sheetId: found.properties.sheetId}}}}]}, ss.getId());
          owned = true;
        }
      }
      if (!owned) throw Error('A tab named "' + name + '" already exists and is not owned by this importer. Rename it before setup.');
      return found.properties.sheetId;
    }
    var id = Math.floor(Math.random() * 2000000000) + 1;
    // Creation and ownership are atomic, avoiding an orphan if a request times out.
    Sheets.Spreadsheets.batchUpdate({requests: [
      {addSheet: {properties: {sheetId: id, title: name, gridProperties: {rowCount: isData ? 20000 : 1000, columnCount: isData ? 12 : 26}}}},
      {createDeveloperMetadata: {developerMetadata: {metadataKey: GA4_.marker, metadataValue: propertyId, visibility: 'DOCUMENT', location: {sheetId: id}}}}
    ]}, ss.getId());
    return id;
  }, started);
  return ga4Call_(function () {
    var sheet = SpreadsheetApp.openById(ss.getId()).getSheetById(sheetId);
    if (!sheet) throw Error('Service unavailable: newly created tab is not visible yet.');
    return sheet;
  }, started);
}
function ga4Connect_(event, props) {
  var id = String(event.propertyId || '');
  if (!/^\d+$/.test(id)) throw Error('Select a valid GA4 property.');
  var property = AnalyticsAdmin.Properties.get('properties/' + id);
  var zone = property.timeZone;
  if (!zone) throw Error('GA4 property timezone is unavailable.');
  var today = ga4Day_(new Date(), zone), start = event.startDate || ga4ShiftDay_(today, -GA4_.refreshDays);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || isNaN(Date.parse(start + 'T12:00:00Z')) || ga4ShiftDay_(start, 0) !== start || start > today || start < '2005-01-01') throw Error('Choose a valid history date up to today.');
  var ss = ga4Destination_();
  var prefix = 'GA4 Egypt - ' + id;
  var config = {version: GA4_.version, propertyId: id, propertyName: property.displayName, timeZone: zone,
    spreadsheetId: ss.getId(), startDate: start, sheetName: prefix, logName: 'GA4 Sync - ' + id, catalogueName: 'GA4 Fields - ' + id};
  // Validate actual property metadata and the whole query before creating a schedule.
  var metadata = AnalyticsData.Properties.getMetadata('properties/' + id + '/metadata');
  var catalogue = [['Kind', 'API name', 'Display name', 'Description']];
  (metadata.dimensions || []).forEach(function (x) { catalogue.push(['Dimension', x.apiName, x.uiName || '', x.description || '']); });
  (metadata.metrics || []).forEach(function (x) { catalogue.push(['Metric', x.apiName, x.uiName || '', x.description || '']); });
  var fields = ga4OwnedSheet_(ss, config.catalogueName, id);
  if (fields.getMaxRows() < catalogue.length) fields.insertRowsAfter(fields.getMaxRows(), catalogue.length - fields.getMaxRows());
  Sheets.Spreadsheets.batchUpdate({requests: [{updateCells: {range: {sheetId: fields.getSheetId(), startRowIndex: 0, endRowIndex: Math.max(catalogue.length, fields.getLastRow()), startColumnIndex: 0, endColumnIndex: 4}, rows: catalogue.map(ga4Cells_), fields: 'userEnteredValue'}}]}, ss.getId());
  fields.setFrozenRows(1);
  var metricNames = (metadata.metrics || []).map(function (x) { return x.apiName; });
  var dimensionNames = (metadata.dimensions || []).map(function (x) { return x.apiName; });
  var missing = GA4_.metrics.filter(function (name) { return metricNames.indexOf(name) === -1; }).concat(['date', 'region', 'countryId'].filter(function (name) { return dimensionNames.indexOf(name) === -1; }));
  if (missing.length) throw Error('Missing GA4 fields: ' + missing.join(', ') + '. See the GA4 Fields tab for the property catalogue. No import schedule was created.');
  var query = ga4Request_(today, 0);
  var compatible = AnalyticsData.Properties.checkCompatibility({dimensions: query.dimensions, metrics: query.metrics, dimensionFilter: query.dimensionFilter}, 'properties/' + id);
  var incompatible = ga4IncompatibleRequested_(compatible, query);
  if (incompatible.length) throw Error('GA4 rejected requested fields: ' + incompatible.join(', ') + '. See the GA4 Fields tab; no import schedule was created.');
  var dataSheet = ga4OwnedSheet_(ss, config.sheetName, id, true);
  var logSheet = ga4OwnedSheet_(ss, config.logName, id);
  config.sheetId = dataSheet.getSheetId(); config.logSheetId = logSheet.getSheetId();
  ga4InitializeSheets_(dataSheet, logSheet, config);
  ga4SaveConfig_(config, props);
  return config;
}
function ga4IncompatibleRequested_(response, query) {
  var wanted = query.dimensions.concat(query.metrics).map(function (x) { return x.name; });
  // checkCompatibility also lists other fields that could be added to a report.
  return (response.dimensionCompatibilities || []).concat(response.metricCompatibilities || []).filter(function (x) {
    var name = (x.dimensionMetadata || x.metricMetadata || {}).apiName;
    return wanted.indexOf(name) !== -1 && x.compatibility === 'INCOMPATIBLE';
  }).map(function (x) { return (x.dimensionMetadata || x.metricMetadata).apiName; });
}
function ga4InitializeSheets_(data, log, config) {
  data.getRange(2, 2, 1, GA4_.headers.length).setValues([GA4_.headers]);
  data.setFrozenRows(2);
  data.getRange('B:B').setNumberFormat('@');
  data.getRange('C:F').setNumberFormat('0');
  data.getRange('G:I').setNumberFormat('0.##########');
  data.getRange('J:J').setNumberFormat('0%');
  data.getRange('L:L').setNumberFormat('0.##');
  data.getRange(2, 2, 1, 11).setBackground('#174b6b').setFontColor('#ffffff').setFontWeight('bold');
  data.setColumnWidth(2, 115); data.setColumnWidth(11, 235);
  data.setColumnWidths(3, 8, 150); data.setColumnWidth(12, 230);
  log.getRange(1, 1, 5, 2).setValues([
    ['GA4 sync status', 'Connected; first import pending'], ['Property', config.propertyId + ' / ' + config.propertyName],
    ['Property timezone', config.timeZone], ['Schedule', 'Every 12 hours; today + previous 7 days'], ['Last completed cycle (UTC)', '']
  ]);
  log.getRange(7, 1, 1, 5).setValues([['Day', 'Last successful import (UTC)', 'Rows returned', 'Quality notes', 'Cycle ID']]);
  log.setFrozenRows(7); log.setColumnWidths(1, 5, 190); log.setColumnWidth(4, 420);
}

function ga4EnsureSchedule_(config, props, event) {
  var triggers = ScriptApp.getProjectTriggers();
  var schedule = triggers.filter(function (t) { return t.getUniqueId() === config.scheduleId; });
  if (!schedule.length) {
    config.scheduleId = ScriptApp.newTrigger(GA4_.handler).timeBased().everyHours(GA4_.scheduleHours).create().getUniqueId();
    ga4SaveConfig_(config, props);
  }
  // Only delete our known one-off trigger, never unrelated project triggers.
  if (event && event.triggerUid && String(event.triggerUid) === String(config.continuationId)) ga4RemoveContinuation_(config, props);
}
function ga4RemoveContinuation_(config, props) {
  if (config.continuationId) {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getUniqueId() === config.continuationId) ScriptApp.deleteTrigger(t); });
    delete config.continuationId;
    ga4SaveConfig_(config, props);
  }
}
function ga4SetContinuation_(config, props, delay) {
  ga4RemoveContinuation_(config, props);
  config.continuationId = ScriptApp.newTrigger(GA4_.handler).timeBased().after(delay).create().getUniqueId();
  ga4SaveConfig_(config, props);
}
function ga4Status_(ss, config, message) { ss.getSheetById(config.logSheetId).getRange('B1').setValue(message); }
function ga4LogFailure_(config, message, kind) {
  try {
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    ga4Status_(ss, config, (kind === 'authorization' ? 'Reconnect required: ' : 'Import stopped: ') + message.slice(0, 1200));
  } catch (ignored) { console.error('Could not write sync status: ' + String(ignored)); }
}
function ga4ReadLedger_(sheet) {
  return sheet.getLastRow() < 8 ? [] : sheet.getRange(8, 1, sheet.getLastRow() - 7, 5).getValues().filter(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(String(r[0])); });
}
function ga4ReadData_(sheet) {
  var lastRow = sheet.getLastRow();
  return lastRow < 3 ? [] : sheet.getRange(3, 2, lastRow - 2, 11).getValues().filter(function (r) { return r.some(function (v) { return v !== ''; }); });
}
function ga4Queue_(today, startDate, ledger, dataRows) {
  var completed = {};
  ledger.forEach(function (r) { completed[String(r[0])] = Number(r[2]); });
  var actual = {};
  dataRows.forEach(function (r) { actual[String(r[0])] = (actual[String(r[0])] || 0) + 1; });
  return ga4Days_(startDate, today).filter(function (day) {
    return day >= ga4ShiftDay_(today, -GA4_.refreshDays) || completed[day] === undefined || (actual[day] || 0) !== completed[day];
  }).sort().reverse();
}
function ga4Run_(config, props, started) {
  var ss = SpreadsheetApp.openById(config.spreadsheetId);
  var data = ss.getSheetById(config.sheetId), log = ss.getSheetById(config.logSheetId);
  if (!data || !log) throw Error('An importer tab was deleted. Restore it from Sheet version history before running again.');
  var today = ga4Day_(new Date(), config.timeZone);
  var job = ga4ReadJson_(props, GA4_.stateKey);
  // A new property day restarts the unfinished day's download with fresh API results.
  if (!job || job.today !== today || job.propertyId !== config.propertyId) {
    job = {propertyId: config.propertyId, today: today, cycleId: Utilities.getUuid()};
    props.setProperty(GA4_.stateKey, JSON.stringify(job));
  }
  // Keep checkpoints small even for years of backfill. The atomic daily ledger is the cursor.
  var ledger = ga4ReadLedger_(log);
  var existing = ga4ReadData_(data);
  var cycleDone = {};
  ledger.forEach(function (r) { if (String(r[4]) === job.cycleId) cycleDone[String(r[0])] = true; });
  job.queue = ga4Queue_(today, config.startDate, ledger, existing).filter(function (day) { return !cycleDone[day]; });
  // A hard timeout cannot run finally/catch: this watchdog resumes after the 6-minute platform limit.
  ga4SetContinuation_(config, props, 7 * 60000);
  while (job.queue.length) {
    if (Date.now() - started >= GA4_.budgetMs) {
      ga4Status_(ss, config, 'Continuing automatically; ' + job.queue.length + ' day(s) remaining.');
      ga4SetContinuation_(config, props, 60000);
      return {pending: true};
    }
    var day = job.queue[0];
    ga4Status_(ss, config, 'Importing ' + day + '; ' + job.queue.length + ' day(s) remaining. Today is provisional.');
    var result = ga4FetchDay_(config, day, started);
    if (!result) {
      ga4SetContinuation_(config, props, 60000);
      ga4Status_(ss, config, 'Continuing automatically from ' + day + '. Previous published rows retained.');
      return {pending: true};
    }
    ga4PublishDay_(ss, data, log, day, result, job);
    job.queue.shift();
  }
  ga4Status_(ss, config, 'Import cycle complete. Today and recent days remain provisional; check quality notes below.');
  log.getRange('B5').setValue(new Date().toISOString());
  props.deleteProperty(GA4_.stateKey);
  ga4RemoveContinuation_(config, props);
  return {pending: false};
}
function ga4Quality_(metadata) {
  var notes = [];
  if (metadata && metadata.subjectToThresholding) notes.push('Subject to GA4 privacy thresholding; values may be withheld.');
  if (metadata && metadata.dataLossFromOtherRow) notes.push('GA4 reports data loss from the other row.');
  if (metadata && (metadata.samplingMetadatas || []).length) notes.push('GA4 reports sampled data.');
  return notes;
}
function ga4FetchDay_(config, day, started) {
  var offset = 0, rows = [], expected = null, notes = [], keys = {};
  while (true) {
    if (Date.now() - started >= GA4_.budgetMs) return null;
    var response = ga4Call_(function () { return AnalyticsData.Properties.runReport(ga4Request_(day, offset), 'properties/' + config.propertyId); }, started);
    if (!response || !Array.isArray(response.dimensionHeaders) || !Array.isArray(response.metricHeaders)) throw Error('GA4 returned an invalid report. Previous published rows retained.');
    if (response.dimensionHeaders.map(function (x) { return x.name; }).join(',') !== 'date,region' || response.metricHeaders.map(function (x) { return x.name; }).join(',') !== GA4_.metrics.join(',')) throw Error('GA4 report columns changed unexpectedly.');
    var count = Number(response.rowCount || 0);
    if (!Number.isInteger(count) || count < 0) throw Error('Invalid GA4 row count.');
    if (expected === null) expected = count;
    if (expected !== count) throw Error('GA4 data changed during pagination. Run syncGA4 to retry this day safely.');
    notes = notes.concat(ga4Quality_(response.metadata));
    var page = response.rows || [];
    page.forEach(function (r) {
      var row = ga4Row_(r, day), key = row[0] + '\u0000' + row[9];
      if (keys[key]) throw Error('Duplicate GA4 day/region during pagination. Retry this day.');
      keys[key] = true; rows.push(row);
    });
    offset += page.length;
    if (offset >= expected) break;
    if (!page.length) throw Error('GA4 pagination ended before all rows were downloaded.');
  }
  if (rows.length !== expected) throw Error('GA4 report is incomplete. Previous published rows retained.');
  return {rows: rows, notes: Array.from(new Set(notes))};
}
function ga4Row_(r, day) {
  if (!r.dimensionValues || r.dimensionValues.length !== 2 || !r.metricValues || r.metricValues.length !== GA4_.metrics.length) throw Error('Incomplete GA4 row.');
  if (r.dimensionValues[0].value !== day.replace(/-/g, '')) throw Error('GA4 returned a row outside the requested day.');
  var v = r.metricValues.map(function (m) {
    if (m.value === undefined || m.value === null || String(m.value).trim() === '') throw Error('Missing GA4 metric; refusing to substitute zero.');
    var value = Number(m.value);
    if (!isFinite(value) || value < 0) throw Error('Invalid GA4 metric.');
    return value;
  });
  if (v[7] > 1) throw Error('GA4 bounce rate is outside 0–1.');
  return [day, v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], String(r.dimensionValues[1].value || ''), v[0] ? v[6] / v[0] : ''];
}
function ga4MergeDay_(existing, day, fresh) {
  var seen = {};
  var rows = existing.filter(function (r) { return String(r[0]) !== day; }).concat(fresh);
  rows.forEach(function (r) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r[0]))) throw Error('Unexpected date in the importer output. Restore the data tab or remove manual edits before retrying.');
    var key = r[0] + '\u0000' + r[9];
    if (seen[key]) throw Error('Duplicate day/region in existing output. Remove manual duplicates before retrying.');
    seen[key] = true;
  });
  return rows.sort(function (a, b) { return String(b[0]).localeCompare(String(a[0])) || String(a[9]).localeCompare(String(b[9])); });
}
function ga4Cells_(row) {
  return {values: row.map(function (v) { return {userEnteredValue: typeof v === 'number' ? {numberValue: v} : {stringValue: String(v)}}; })};
}
function ga4PublishDay_(ss, data, log, day, result, job) {
  var existing = ga4ReadData_(data);
  var merged = ga4MergeDay_(existing, day, result.rows);
  var ledger = ga4ReadLedger_(log).filter(function (r) { return String(r[0]) !== day; });
  var notes = (day === job.today ? ['Today is partial.'] : []).concat(result.notes);
  ledger.push([day, new Date().toISOString(), result.rows.length, notes.join(' ') || 'No API quality flags; recent dates can still change.', job.cycleId]);
  ledger.sort(function (a, b) { return String(b[0]).localeCompare(String(a[0])); });
  var requests = [];
  var requiredDataRows = Math.max(merged.length + 2, data.getLastRow(), 3);
  var requiredLogRows = Math.max(ledger.length + 7, log.getLastRow(), 8);
  if (requiredDataRows > data.getMaxRows()) throw Error('GA4 data tab capacity reached. Increase its row capacity, then run syncGA4 to continue. The importer never inserts entire rows during refresh.');
  if (requiredLogRows > log.getMaxRows()) requests.push({appendDimension: {sheetId: log.getSheetId(), dimension: 'ROWS', length: requiredLogRows - log.getMaxRows()}});
  // Values, removal of obsolete rows and completion ledger commit atomically.
  requests.push({updateCells: {range: {sheetId: data.getSheetId(), startRowIndex: 2, endRowIndex: requiredDataRows, startColumnIndex: 1, endColumnIndex: 12}, rows: merged.map(ga4Cells_), fields: 'userEnteredValue'}});
  requests.push({updateCells: {range: {sheetId: log.getSheetId(), startRowIndex: 7, endRowIndex: requiredLogRows, startColumnIndex: 0, endColumnIndex: 5}, rows: ledger.map(ga4Cells_), fields: 'userEnteredValue'}});
  SpreadsheetApp.flush();
  Sheets.Spreadsheets.batchUpdate({requests: requests}, ss.getId());
}
