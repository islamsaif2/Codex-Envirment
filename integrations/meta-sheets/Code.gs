/** Meta platforms importer. Install beside GA4EgyptImporter.gs; run syncMetaPlatforms. */
var MP4_ = Object.freeze({
  appId: '1692565939119813', apiVersion: 'v27.0', handler: 'syncMetaPlatforms',
  configKey: 'META_PLATFORMS_CONFIG_V1', tokenKey: 'META_PLATFORMS_AUTH_V1', stateKey: 'META_PLATFORMS_LOGIN_V1', jobKey: 'META_PLATFORMS_JOB_V1',
  spreadsheetId: '1bWPoTD6FZ7vr2cfYcxxvXSbehhEwqWamao5Vgu5kR3E', sheetId: 1312404467,
  headers: ['Day', 'Amount spent', 'CTR (link click-through rate)', 'Landing page views', 'Purchases', 'Platform', 'Placement']
});

/** Setup, manual refresh, recurring refresh and recovery use this one entry point. */
function syncMetaPlatforms(event) {
  var props = PropertiesService.getUserProperties(), lock = LockService.getScriptLock(), config;
  if (!lock.tryLock(20000)) { config = ga4ReadJson_(props, MP4_.configKey) || {}; mp4Continue_(config, props, 120000); return; }
  try {
    config = ga4ReadJson_(props, MP4_.configKey) || {};
    mp4RemoveContinuation_(config);
    var secret = PropertiesService.getScriptProperties().getProperty('META_PLATFORMS_APP_SECRET');
    var redirect = mp4Redirect_();
    mp4Values_([{range: "'Automation Settings'!AO13", values: [[redirect]]}]);
    if (!secret) { mp4Status_('One-time app setup required: add META_PLATFORMS_APP_SECRET in Apps Script properties and register the callback URL shown above.'); console.log('Meta app setup is needed. Callback URL: ' + redirect); return; }
    var auth = ga4ReadJson_(props, MP4_.tokenKey);
    if (!auth || !auth.accessToken || (auth.expiresAt && auth.expiresAt <= Date.now() + 60000)) {
      var login = mp4LoginUrl_(props);
      mp4Values_([{range: "'Automation Settings'!AO12", values: [[login]]}]);
      mp4Status_('Open the Facebook login link in AO12. After login, choose an ad account in AO10 and run syncMetaPlatforms.');
      console.log('Open Automation Settings!AO12 to log in to Facebook.'); return;
    }
    var options = Sheets.Spreadsheets.Values.get(MP4_.spreadsheetId, "'Automation Settings'!AO10:AO24", {valueRenderOption: 'FORMATTED_VALUE'}).values || [];
    var value = function (i) { return String(options[i] && options[i][0] || ''); }, label = value(0);
    var hours = Number(value(12));
    if ([1,2,4,6,8,12].indexOf(hours) < 0 || value(6) !== 'Raw Ga4 & Meta Ads Data' || value(7) !== 'AM:AS' || value(8) !== '2' || value(9) !== '3' || value(13) !== '1') throw Error('Restore Meta export coordinates and a valid refresh interval in Automation Settings!AN:AO.');
    var id = (label.match(/\[(act_\d+)\]/) || [])[1];
    if (!id) { mp4Accounts_(auth, props); mp4Status_('Choose your ad account in AO10, then run syncMetaPlatforms. No account is selected automatically.'); return; }
    if (config.accountId && config.accountId !== id) throw Error('This export is already connected to another ad account. Restore its selection to avoid mixing accounts.');
    var account = mp4Graph_(id, {fields: 'id,name,currency,timezone_name'}, auth.accessToken);
    if (account.id !== id || !account.timezone_name || !account.currency) throw Error('The selected Meta ad account could not be validated.');
    if (config.scheduleHours && config.scheduleHours !== hours) { mp4DeleteTrigger_(config.scheduleId); delete config.scheduleId; }
    var today = ga4Day_(new Date(), account.timezone_name);
    config.accountId = id; config.timeZone = account.timezone_name; config.currency = account.currency; config.scheduleHours = hours; config.startDate = config.startDate || ga4ShiftDay_(today, -1);
    if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getUniqueId() === config.scheduleId; })) config.scheduleId = ScriptApp.newTrigger(MP4_.handler).timeBased().everyHours(hours).create().getUniqueId();
    props.setProperty(MP4_.configKey, JSON.stringify(config));
    mp4Values_([{range: "'Automation Settings'!AO11", values: [[account.currency]]}, {range: "'Automation Settings'!AO24", values: [[account.timezone_name]]}]);
    mp4Continue_(config, props, 7 * 60000);
    var started = Date.now(), job = ga4ReadJson_(props, MP4_.jobKey);
    if (!job || job.today !== today || job.accountId !== id) { job = {today: today, accountId: id, cycleId: Utilities.getUuid()}; props.setProperty(MP4_.jobKey, JSON.stringify(job)); }
    var ledger = mp4Ledger_(id), existing = mp4Read_(), counts = {}, completed = {};
    existing.forEach(function (r) { counts[r[0]] = (counts[r[0]] || 0) + 1; }); ledger.forEach(function (r) { completed[r.day] = r; });
    var queue = ga4Days_(config.startDate, today).filter(function (day) { var item = completed[day]; return (!item || item.count !== (counts[day] || 0) || day >= ga4ShiftDay_(today, -1)) && (!item || item.cycleId !== job.cycleId || item.count !== (counts[day] || 0)); }).sort().reverse();
    while (queue.length) {
      if (Date.now() - started > 220000) { mp4Status_('Continuing automatically; ' + queue.length + ' dates remaining.'); mp4Continue_(config, props, 60000); return; }
      var day = queue[0]; mp4Status_('Importing ' + day + '; ' + queue.length + ' dates remaining.');
      var rows = mp4FetchDay_(id, day, auth.accessToken, started);
      if (!rows) { mp4Continue_(config, props, 60000); return; }
      mp4Publish_(config, day, rows, job);
      queue.shift();
    }
    var stamp = Utilities.formatDate(new Date(), config.timeZone, 'yyyy-MM-dd HH:mm:ss');
    mp4Values_([{range: "'Automation Settings'!AO30:AO32", values: [[stamp], ['Import cycle complete.'], ['Today is partial. Only yesterday and today are refreshed; older conversions may revise later.']]}, {range: "'Raw Ga4 & Meta Ads Data'!AM1", values: [['Meta platforms · ' + account.name + '\nLast updated ' + stamp]]}]);
    props.deleteProperty(MP4_.jobKey); mp4RemoveContinuation_(config); props.setProperty(MP4_.configKey, JSON.stringify(config));
    console.log('Meta platforms complete. Every ' + hours + ' hours; yesterday and today.');
  } catch (error) {
    if (error.reconnect) props.deleteProperty(MP4_.tokenKey);
    mp4Status_('Import stopped: ' + String(error.message || error).slice(0, 700));
    if (error.temporary || ga4ErrorKind_(String(error.message || error)) === 'temporary') mp4Continue_(config || {}, props, 10 * 60000);
    else { mp4RemoveContinuation_(config || {}); props.setProperty(MP4_.configKey, JSON.stringify(config || {})); }
    throw error;
  } finally { lock.releaseLock(); }
}
function mp4Redirect_() { return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback'; }
function mp4Values_(data) { Sheets.Spreadsheets.Values.batchUpdate({valueInputOption: 'RAW', data: data}, MP4_.spreadsheetId); }
function mp4Status_(text) { mp4Values_([{range: "'Automation Settings'!AO31", values: [[text]]}]); }
function mp4DeleteTrigger_(id) { if (id) ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getUniqueId() === id) ScriptApp.deleteTrigger(t); }); }
function mp4RemoveContinuation_(config) { mp4DeleteTrigger_(config.continuationId); delete config.continuationId; }
function mp4Continue_(config, props, delay) { mp4RemoveContinuation_(config); config.continuationId = ScriptApp.newTrigger(MP4_.handler).timeBased().after(delay).create().getUniqueId(); props.setProperty(MP4_.configKey, JSON.stringify(config)); }
function mp4Query_(params) { return Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&'); }
function mp4LoginUrl_(props) {
  var nonce = Utilities.getUuid(), state = ScriptApp.newStateToken().withMethod('metaPlatformsAuthCallback').withArgument('mp4nonce', nonce).withTimeout(3600).createToken();
  props.setProperty(MP4_.stateKey, JSON.stringify({nonce: nonce, expiresAt: Date.now() + 3600000}));
  var parameters = {client_id: MP4_.appId, redirect_uri: mp4Redirect_(), response_type: 'code', state: state, scope: 'ads_read'};
  var loginConfig = PropertiesService.getScriptProperties().getProperty('META_PLATFORMS_LOGIN_CONFIG_ID');
  if (loginConfig) { parameters.config_id = loginConfig; delete parameters.scope; }
  return 'https://www.facebook.com/' + MP4_.apiVersion + '/dialog/oauth?' + mp4Query_(parameters);
}
/** Google invokes this callback after Facebook login; do not run it manually. */
function metaPlatformsAuthCallback(event) {
  var props = PropertiesService.getUserProperties(), lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return HtmlService.createHtmlOutput('Another automation is running. Run syncMetaPlatforms again to restart login.');
  try {
    var p = event && event.parameter || {}, state = ga4ReadJson_(props, MP4_.stateKey);
    if (!state || state.expiresAt < Date.now() || !p.mp4nonce || p.mp4nonce !== state.nonce) throw Error('Login expired or invalid. Run syncMetaPlatforms to start again.');
    props.deleteProperty(MP4_.stateKey);
    if (p.error || !p.code) throw Error('Facebook login was not completed. Run syncMetaPlatforms to try again.');
    var secret = PropertiesService.getScriptProperties().getProperty('META_PLATFORMS_APP_SECRET');
    if (!secret) throw Error('The Meta app secret is missing from Script Properties.');
    var short = mp4TokenRequest_({client_id: MP4_.appId, client_secret: secret, redirect_uri: mp4Redirect_(), code: p.code});
    var token = mp4TokenRequest_({grant_type: 'fb_exchange_token', client_id: MP4_.appId, client_secret: secret, fb_exchange_token: short.access_token});
    if (!token.access_token || !Number.isFinite(Number(token.expires_in)) || Number(token.expires_in) <= 0) throw Error('Meta did not return a usable expiring login.');
    var auth = {accessToken: token.access_token, expiresAt: Date.now() + Number(token.expires_in) * 1000};
    props.setProperty(MP4_.tokenKey, JSON.stringify(auth));
    mp4Accounts_(auth, props);
    mp4Values_([{range: "'Automation Settings'!AO12", values: [['Connected — run syncMetaPlatforms to reconnect when needed.']]}]);
    mp4Status_('Facebook connected. Choose your ad account in AO10, then run syncMetaPlatforms.');
    return HtmlService.createHtmlOutput('<h2>Facebook connected</h2><p>Return to Automation Settings, choose your ad account in AO10, then run <b>syncMetaPlatforms</b>.</p>');
  } catch (error) { mp4Status_(String(error.message || error)); return HtmlService.createHtmlOutput('<p>Connection could not finish. See Automation Settings!AO31 for the next step.</p>'); }
  finally { lock.releaseLock(); }
}
function mp4TokenRequest_(params) {
  // Never log this request or its response: it contains credentials.
  var response; try { response = UrlFetchApp.fetch('https://graph.facebook.com/' + MP4_.apiVersion + '/oauth/access_token', {method: 'post', payload: params, muteHttpExceptions: true, followRedirects: false}); } catch (ignored) { throw Error('Meta login exchange could not be reached. Start login again.'); }
  var json; try { json = JSON.parse(response.getContentText()); } catch (ignored) { throw Error('Meta returned an unreadable login response.'); }
  if (response.getResponseCode() !== 200 || json.error) throw Error('Meta rejected the login exchange. Check the app secret, callback URL and login configuration, then reconnect.');
  return json;
}
function mp4Graph_(path, params, token) {
  if (!/^(me\/adaccounts|act_\d+(\/insights)?)$/.test(path)) throw Error('Unexpected Meta API endpoint.');
  var secret = PropertiesService.getScriptProperties().getProperty('META_PLATFORMS_APP_SECRET');
  if (!secret) throw Error('Meta app setup is missing.');
  var signature = Utilities.computeHmacSha256Signature(token, secret).map(function (n) { return ('0' + ((n + 256) % 256).toString(16)).slice(-2); }).join('');
  var query = Object.assign({}, params, {appsecret_proof: signature}), response;
  for (var attempt = 0; attempt < 4; attempt++) {
    try { response = UrlFetchApp.fetch('https://graph.facebook.com/' + MP4_.apiVersion + '/' + path + '?' + mp4Query_(query), {headers: {Authorization: 'Bearer ' + token}, muteHttpExceptions: true, followRedirects: false}); }
    catch (ignored) { var networkError = Error('Meta API is temporarily unreachable. Previous rows retained.'); networkError.temporary = true; if (attempt === 3) throw networkError; Utilities.sleep(Math.pow(2, attempt) * 1000); continue; }
    var json; try { json = JSON.parse(response.getContentText()); } catch (ignored) { json = {}; }
    if (response.getResponseCode() === 200 && !json.error) return json;
    var code = Number(json.error && json.error.code), temporary = response.getResponseCode() === 429 || response.getResponseCode() >= 500 || [1,2,4,17,32,613,80004].indexOf(code) >= 0 || Boolean(json.error && json.error.is_transient);
    var error = Error(code === 190 ? 'Facebook login expired or was revoked. Run syncMetaPlatforms and reconnect.' : temporary ? 'Meta API temporarily unavailable or rate limited. Previous rows retained.' : 'Meta API rejected the request (code ' + (code || response.getResponseCode()) + '). Check ads_read permission, account access and supported breakdowns.');
    error.temporary = temporary; error.reconnect = code === 190;
    if (!temporary || attempt === 3) throw error;
    Utilities.sleep(Math.pow(2, attempt) * 1000);
  }
}
function mp4Accounts_(auth, props) {
  var accounts = [], after, seen = {};
  do {
    var params = {fields: 'id,name,currency,timezone_name', limit: '100'}; if (after) params.after = after;
    var page = mp4Graph_('me/adaccounts', params, auth.accessToken);
    if (!Array.isArray(page.data)) throw Error('Meta returned an invalid account list.');
    accounts = accounts.concat(page.data);
    after = page.paging && page.paging.next && page.paging.cursors && page.paging.cursors.after;
    if (after && seen[after]) throw Error('Meta account pagination repeated.'); if (after) seen[after] = true;
  } while (after);
  var labels = accounts.filter(function (a) { return /^act_\d+$/.test(a.id); }).map(function (a) { return String(a.name || 'Ad account') + ' [' + a.id + ']'; });
  if (!labels.length) throw Error('No ad accounts were returned. Check ads_read and your account permissions.');
  Sheets.Spreadsheets.batchUpdate({requests: [{setDataValidation: {range: {sheetId: 1748260321, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 40, endColumnIndex: 41}, rule: {condition: {type: 'ONE_OF_LIST', values: labels.map(function (v) { return {userEnteredValue: v}; })}, strict: true, showCustomUi: true}}}]}, MP4_.spreadsheetId);
  // Leave the selection blank: only the user chooses the destination account.
}
function mp4Request_(day, after) {
  var p = {fields: 'date_start,date_stop,spend,inline_link_click_ctr,actions', level: 'account', breakdowns: 'publisher_platform,platform_position', time_range: JSON.stringify({since: day, until: day}), time_increment: '1', use_unified_attribution_setting: 'true', limit: '500'};
  if (after) p.after = after; return p;
}
function mp4Action_(actions, types) {
  if (actions !== undefined && !Array.isArray(actions)) throw Error('Invalid Meta action metrics.');
  for (var i = 0; i < types.length; i++) { var match = (actions || []).filter(function (a) { return a.action_type === types[i]; }); if (match.length > 1) throw Error('Duplicate Meta action type.'); if (match.length) return mp4Number_(match[0].value, false); }
  return '';
}
function mp4Number_(value, optional) { if (value === '' || value === null || value === undefined) { if (optional) return ''; throw Error('Missing Meta metric.'); } var n = Number(value); if (!Number.isFinite(n) || n < 0) throw Error('Invalid Meta metric.'); return n; }
function mp4Labels_(platform, placement) {
  var platforms = {facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', unknown: 'Uncategorized'};
  var common = {feed: 'Feed', right_hand_column: 'Right column', search: 'Search results', instream_video: 'In-stream video', instream_video_mobile: 'In-stream video', facebook_reels_overlay: 'Overlay ads in reels', explore: 'Explore', explore_home: 'Explore home', unknown: 'Uncategorized'};
  var specific = {facebook: {reels: 'Facebook Reels', facebook_reels: 'Facebook Reels', story: 'Facebook Stories'}, instagram: {reels: 'Instagram Reels', story: 'Instagram Stories'}};
  return [platforms[platform] || platform, (specific[platform] || {})[placement] || common[placement] || placement];
}
function mp4Row_(row, day) {
  if (row.date_start !== day || row.date_stop !== day || !row.publisher_platform || !row.platform_position) throw Error('Meta returned an unexpected date/platform/placement.');
  var labels = mp4Labels_(row.publisher_platform, row.platform_position), ctr = mp4Number_(row.inline_link_click_ctr, true);
  return [day, mp4Number_(row.spend, false), ctr === '' ? '' : ctr / 100, mp4Action_(row.actions, ['landing_page_view']), mp4Action_(row.actions, ['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase','onsite_conversion.purchase']), labels[0], labels[1]];
}
function mp4FetchDay_(id, day, token, started) {
  var after, rows = [], seen = {}, cursors = {};
  do {
    if (Date.now() - started > 220000) return null;
    var page = mp4Graph_(id + '/insights', mp4Request_(day, after), token);
    if (!Array.isArray(page.data)) throw Error('Meta returned an invalid insights report. Previous rows retained.');
    page.data.forEach(function (r) { var row = mp4Row_(r, day), key = JSON.stringify([row[0],row[5],row[6]]); if (seen[key]) throw Error('Duplicate Meta platform/placement. Previous rows retained.'); seen[key] = true; rows.push(row); });
    after = page.paging && page.paging.next && page.paging.cursors && page.paging.cursors.after;
    if (page.paging && page.paging.next && !after) throw Error('Meta pagination is incomplete. Previous rows retained.');
    if (after && cursors[after]) throw Error('Meta pagination repeated.'); if (after) cursors[after] = true;
  } while (after);
  return rows.sort(function (a,b) { return a[5].localeCompare(b[5]) || a[6].localeCompare(b[6]); });
}
function mp4Read_() {
  var raw = Sheets.Spreadsheets.Values.get(MP4_.spreadsheetId, "'Raw Ga4 & Meta Ads Data'!AM3:AS", {valueRenderOption: 'UNFORMATTED_VALUE'}).values || [];
  return mp4Normalize_(raw);
}
function mp4Normalize_(rows) {
  var seen = {}; return rows.filter(function (r) { return r[0] !== '' && r[0] !== null && r[0] !== undefined; }).map(function (r) {
    var row = r.slice(0,7); row[0] = typeof row[0] === 'number' ? new Date(Date.UTC(1899,11,30) + Math.round(row[0]) * 86400000).toISOString().slice(0,10) : String(row[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0])) throw Error('Unexpected date in the existing Meta export.');
    for (var i=1;i<7;i++) if (row[i] === undefined || row[i] === null) row[i]='';
    var key = JSON.stringify([row[0],row[5],row[6]]); if (seen[key]) throw Error('Duplicate existing Meta day/platform/placement.'); seen[key]=true; return row;
  });
}
function mp4Ledger_(id) { return (Sheets.Spreadsheets.DeveloperMetadata.search({dataFilters:[{developerMetadataLookup:{metadataKey:'META_PLATFORMS_'+id,metadataLocation:{sheetId:MP4_.sheetId},locationMatchingStrategy:'EXACT_LOCATION'}}]},MP4_.spreadsheetId).matchedDeveloperMetadata || []).map(function (m) { var value=JSON.parse(m.developerMetadata.metadataValue); value.metadataId=m.developerMetadata.metadataId; return value; }); }
function mp4Publish_(config, day, fresh, job) {
  var raw = Sheets.Spreadsheets.Values.get(MP4_.spreadsheetId, "'Raw Ga4 & Meta Ads Data'!AM3:AS", {valueRenderOption:'UNFORMATTED_VALUE'}).values || [];
  var existing=mp4Normalize_(raw), merged=existing.filter(function(r){return r[0]!==day;}).concat(fresh).sort(function(a,b){return b[0].localeCompare(a[0])||a[5].localeCompare(b[5])||a[6].localeCompare(b[6]);});
  var capacity=SpreadsheetApp.openById(MP4_.spreadsheetId).getSheetById(MP4_.sheetId).getMaxRows();
  if(merged.length+2>capacity)throw Error('The raw tab has no remaining Meta export capacity.');
  var previous=mp4Ledger_(config.accountId).filter(function(r){return r.day===day;})[0];
  var value=JSON.stringify({day:day,count:fresh.length,cycleId:job.cycleId,importedAt:new Date().toISOString(),note:day===job.today?'Today is partial.':'Yesterday refreshed.'});
  var metadata=previous?{updateDeveloperMetadata:{dataFilters:[{developerMetadataLookup:{metadataId:previous.metadataId}}],developerMetadata:{metadataValue:value},fields:'metadataValue'}}:{createDeveloperMetadata:{developerMetadata:{metadataKey:'META_PLATFORMS_'+config.accountId,metadataValue:value,location:{sheetId:MP4_.sheetId},visibility:'DOCUMENT'}}};
  Sheets.Spreadsheets.batchUpdate({requests:[
    {updateCells:{start:{sheetId:MP4_.sheetId,rowIndex:1,columnIndex:38},rows:[ga4Cells_(MP4_.headers)],fields:'userEnteredValue'}},
    {updateCells:{range:{sheetId:MP4_.sheetId,startRowIndex:2,endRowIndex:Math.max(raw.length,merged.length,1)+2,startColumnIndex:38,endColumnIndex:45},rows:merged.map(ga4ExportCells_),fields:'userEnteredValue'}},
    {repeatCell:{range:{sheetId:MP4_.sheetId,startRowIndex:2,endRowIndex:Math.max(merged.length+2,3),startColumnIndex:38,endColumnIndex:39},cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'yyyy-mm-dd'}}},fields:'userEnteredFormat.numberFormat'}},
    {repeatCell:{range:{sheetId:MP4_.sheetId,startRowIndex:2,endRowIndex:Math.max(merged.length+2,3),startColumnIndex:39,endColumnIndex:40},cell:{userEnteredFormat:{numberFormat:{type:'NUMBER',pattern:config.currency==='EGP'?'"E£"#,##0.00':'#,##0.00'}}},fields:'userEnteredFormat.numberFormat'}},
    {repeatCell:{range:{sheetId:MP4_.sheetId,startRowIndex:2,endRowIndex:Math.max(merged.length+2,3),startColumnIndex:40,endColumnIndex:41},cell:{userEnteredFormat:{numberFormat:{type:'PERCENT',pattern:'0.00%'}}},fields:'userEnteredFormat.numberFormat'}}, metadata
  ]},MP4_.spreadsheetId);
}
