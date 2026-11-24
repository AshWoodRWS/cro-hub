/**
 * Optimizely -> private Google Sheet sync (read-only).
 *
 * Optimizely REST API -> this script -> Google Sheet -> Lovable dashboard.
 *
 * Credential: Script Properties key OPTIMIZELY_API_TOKEN (a Personal Access Token,
 * sent as "Authorization: Bearer <token>"). It is never written to a cell, log or error.
 *
 * Paste into the bound script of the target spreadsheet (Extensions > Apps Script),
 * then run setupTabs() once.
 */

var TABS = {
  MAP: 'OptimizelyCampaignMap',
  RESULTS: 'OptimizelyResults',
  STATUS: 'OptimizelySyncStatus',
};

var HEADERS = {
  MAP: ['dashboard_campaign_id', 'optimizely_project_id', 'experiment_id', 'display_name', 'enabled'],
  RESULTS: [
    'snapshot_at', 'experiment_id', 'window_start', 'window_end',
    'metric_order', 'metric_id', 'metric_name', 'metric_role',
    'variation_id', 'variation_label', 'is_baseline',
    'visitors', 'conversions', 'metric_value', 'rate',
    'lift', 'lift_status', 'significance', 'visitors_remaining',
    'is_most_conclusive', 'confidence_threshold',
  ],
  STATUS: ['experiment_id', 'last_attempt', 'last_successful_refresh', 'status', 'error'],
};

// Columns that must stay text so Sheets never reformats IDs or timestamps.
var TEXT_COLUMNS = {
  MAP: ['dashboard_campaign_id', 'optimizely_project_id', 'experiment_id'],
  RESULTS: ['snapshot_at', 'experiment_id', 'window_start', 'window_end', 'metric_id', 'variation_id'],
  STATUS: ['experiment_id', 'last_attempt', 'last_successful_refresh'],
};

var API_BASE = 'https://api.optimizely.com/v2';
var TOKEN_PROPERTY = 'OPTIMIZELY_API_TOKEN';
var DAILY_HOUR = 6; // local script time zone

/* ------------------------------ menu & setup ------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Optimizely')
    .addItem('Refresh now', 'refreshNow')
    .addItem('Set up tabs', 'setupTabs')
    .addItem('Install daily trigger', 'installDailyTrigger')
    .addToUi();
}

/** Creates the three tabs with exact headers and placeholder mapping rows. Safe to re-run. */
function setupTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['MAP', 'RESULTS', 'STATUS'].forEach(function (key) {
    var sh = ss.getSheetByName(TABS[key]) || ss.insertSheet(TABS[key]);
    var headers = HEADERS[key];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    TEXT_COLUMNS[key].forEach(function (name) {
      var col = headers.indexOf(name) + 1;
      sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  });

  var map = ss.getSheetByName(TABS.MAP);
  if (map.getLastRow() < 2) {
    // enabled = FALSE and non-numeric IDs, so these placeholders are never sent to the API.
    map.getRange(2, 1, 3, 5).setValues([
      ['REPLACE_CAMPAIGN_ID_1', 'REPLACE_PROJECT_ID', 'REPLACE_EXPERIMENT_ID_A', 'Example: Homepage hero test', 'FALSE'],
      ['REPLACE_CAMPAIGN_ID_1', 'REPLACE_PROJECT_ID', 'REPLACE_EXPERIMENT_ID_B', 'Example: Homepage CTA test', 'FALSE'],
      ['REPLACE_CAMPAIGN_ID_2', 'REPLACE_PROJECT_ID', 'REPLACE_EXPERIMENT_ID_C', 'Example: Pricing page test', 'FALSE'],
    ]);
  }
  SpreadsheetApp.flush();
}

/** Installs one daily trigger (replaces any existing one for this script). */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshAllScheduled') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshAllScheduled').timeBased().everyDays(1).atHour(DAILY_HOUR).create();
}

/* ------------------------------ entry points ------------------------------ */

function refreshAllScheduled() {
  runRefresh_();
}

function refreshNow() {
  var s = runRefresh_();
  var msg = 'Optimizely refresh finished.\nExperiments: ' + s.total +
    '\nSucceeded: ' + s.ok + '\nFailed: ' + s.failed + '\nSkipped (invalid ID): ' + s.skipped;
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/**
 * Diagnostic: logs only the field NAMES (no values) of one experiment's response, so you can
 * confirm the shape this script expects. Run from the editor: inspectExperimentShape('123456').
 */
function inspectExperimentShape(experimentId) {
  var token = getToken_();
  var res = fetchWithRetry_(API_BASE + '/experiments/' + encodeURIComponent(String(experimentId)) + '/results', token);
  var code = res.getResponseCode();
  if (code !== 200) { Logger.log('HTTP ' + code); return; }
  var body = JSON.parse(res.getContentText());
  Logger.log('top-level keys: ' + Object.keys(body).join(', '));
  var m = (body.metrics || [])[0];
  if (m) {
    Logger.log('metric keys: ' + Object.keys(m).join(', '));
    var vk = Object.keys(m.results || {})[0];
    if (vk) {
      Logger.log('variation result keys: ' + Object.keys(m.results[vk]).join(', '));
      Logger.log('lift keys: ' + Object.keys(m.results[vk].lift || {}).join(', '));
    }
  }
}

/* ------------------------------ core refresh ------------------------------ */

function runRefresh_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another refresh is already running.');
  try {
    var token = getToken_(); // throws before anything is written if missing
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var experiments = readEnabledExperiments_(ss); // unique, in map order
    var statusById = readStatus_(ss);
    var newResults = {}; // experiment_id -> rows (only for successful fetches)
    var now = new Date().toISOString();
    var summary = { total: 0, ok: 0, failed: 0, skipped: 0 };
    var abortStatus = null; // set to 'auth_error' or 'rate_limited' to stop the run

    experiments.forEach(function (exp) {
      var prev = statusById[exp.id] || {};
      var st = {
        last_attempt: now,
        last_successful_refresh: prev.last_successful_refresh || '',
        status: '',
        error: '',
      };

      if (!/^\d+$/.test(exp.id)) {
        st.status = 'invalid_id';
        st.error = 'experiment_id must be numeric';
        statusById[exp.id] = st;
        summary.skipped++;
        return;
      }
      summary.total++;

      if (abortStatus) {
        st.status = abortStatus;
        st.error = abortStatus === 'auth_error'
          ? 'Not attempted: authentication failed earlier in this run'
          : 'Not attempted: rate limited earlier in this run';
        statusById[exp.id] = st;
        summary.failed++;
        return;
      }

      try {
        var res = fetchWithRetry_(API_BASE + '/experiments/' + encodeURIComponent(exp.id) + '/results', token);
        var code = res.getResponseCode();
        if (code === 200) {
          var body = JSON.parse(res.getContentText());
          newResults[exp.id] = parseResults_(exp.id, body, now);
          st.status = 'ok';
          st.last_successful_refresh = now;
          summary.ok++;
        } else {
          st.status = statusForHttp_(code);
          st.error = errorFor_(code, res);
          if (code === 401) abortStatus = 'auth_error';
          if (code === 429) abortStatus = 'rate_limited';
          summary.failed++;
        }
      } catch (err) {
        st.status = 'error';
        st.error = sanitize_(err && err.message ? err.message : err);
        summary.failed++;
      }
      statusById[exp.id] = st;
    });

    // Write once, at the end. Failed experiments keep their previous results rows.
    writeResults_(ss, newResults);
    writeStatus_(ss, statusById);
    Logger.log('Refresh done: ' + JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function getToken_() {
  var t = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!t) throw new Error('Script Property ' + TOKEN_PROPERTY + ' is not set.');
  return t;
}

/* --------------------------------- API ----------------------------------- */

function fetchWithRetry_(url, token) {
  var attempt = 0;
  while (true) {
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    });
    var code = res.getResponseCode();
    if ((code === 429 || code >= 500) && attempt < 2) {
      var wait = retryAfterSeconds_(res);
      Utilities.sleep(Math.min(wait === null ? 5 * (attempt + 1) : wait, 30) * 1000);
      attempt++;
      continue;
    }
    return res;
  }
}

function retryAfterSeconds_(res) {
  var headers = res.getHeaders();
  for (var k in headers) {
    if (String(k).toLowerCase() === 'retry-after') {
      var n = parseInt(headers[k], 10);
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

function statusForHttp_(code) {
  if (code === 401) return 'auth_error';
  if (code === 403) return 'forbidden';
  if (code === 404) return 'not_found';
  if (code === 429) return 'rate_limited';
  return 'error';
}

function errorFor_(code, res) {
  var base = {
    401: 'HTTP 401: token missing, invalid or expired',
    403: 'HTTP 403: token cannot access this experiment or project',
    404: 'HTTP 404: experiment not found (check experiment_id)',
    429: 'HTTP 429: rate limited by Optimizely',
  }[code] || 'HTTP ' + code;
  try {
    var m = JSON.parse(res.getContentText()).message;
    if (m && typeof m === 'string') base += ' - ' + m;
  } catch (e) { /* ignore non-JSON bodies */ }
  return sanitize_(base);
}

/** Removes the token and any bearer string, collapses whitespace, caps length. */
function sanitize_(msg) {
  var s = String(msg === undefined || msg === null ? '' : msg);
  var t = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (t) s = s.split(t).join('[redacted]');
  s = s.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [redacted]');
  return s.replace(/\s+/g, ' ').slice(0, 200);
}

/* -------------------------------- parsing -------------------------------- */

function blank_(v) {
  return v === undefined || v === null ? '' : v;
}

/**
 * Builds one row per metric x variation from /experiments/{id}/results.
 * Uses Optimizely's reported statistics unchanged; missing values stay blank.
 * Metric role: taken from the API if any metric states one; otherwise the first metric
 * (Optimizely lists the primary first) is labelled "primary" and the rest are left blank.
 */
function parseResults_(experimentId, body, snapshotAt) {
  var metrics = Array.isArray(body.metrics) ? body.metrics : [];
  var reachVars = (body.reach && body.reach.variations) || {};
  var rows = [];

  var anyExplicit = metrics.some(function (m) { return !!(m.metric_role || m.role); });
  var ranked = metrics.map(function (m, i) {
    var role = m.metric_role || m.role || '';
    if (!role && i === 0 && !anyExplicit) role = 'primary';
    return { m: m, i: i, role: String(role) };
  });
  ranked.sort(function (a, b) {
    return roleRank_(a.role) - roleRank_(b.role) || a.i - b.i;
  });

  ranked.forEach(function (r, order) {
    var m = r.m;
    var results = m.results || {};
    var ids = Object.keys(results).sort(function (a, b) {
      return (results[b] && results[b].is_baseline ? 1 : 0) - (results[a] && results[a].is_baseline ? 1 : 0);
    });
    ids.forEach(function (vid) {
      var v = results[vid] || {};
      var lift = v.lift || {};
      var label = v.name || (reachVars[vid] && reachVars[vid].name) || '';
      rows.push([
        snapshotAt,
        String(experimentId),
        blank_(body.start_time),
        blank_(body.end_time),
        order + 1,
        blank_(m.event_id === undefined ? '' : String(m.event_id)),
        blank_(m.name || m.display_title),
        r.role,
        String(vid),
        label,
        v.is_baseline === true ? 'TRUE' : (v.is_baseline === false ? 'FALSE' : ''),
        blank_(v.samples),
        blank_(v.total_count),
        blank_(v.value),
        blank_(v.rate),
        blank_(lift.value),
        blank_(lift.lift_status),
        blank_(lift.significance),
        blank_(lift.visitors_remaining),
        lift.is_most_conclusive === true ? 'TRUE' : (lift.is_most_conclusive === false ? 'FALSE' : ''),
        blank_(body.confidence_threshold),
      ]);
    });
  });
  return rows;
}

function roleRank_(role) {
  var r = String(role).toLowerCase();
  if (r === 'primary') return 0;
  if (r === 'secondary') return 1;
  if (r === 'monitoring') return 2;
  return 3;
}

/* ------------------------------ sheet helpers ---------------------------- */

function isTrue_(v) {
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || v === true;
}

/** Unique enabled experiment IDs from the map tab, in sheet order. */
function readEnabledExperiments_(ss) {
  var sh = ss.getSheetByName(TABS.MAP);
  if (!sh) throw new Error('Tab ' + TABS.MAP + ' not found. Run setupTabs().');
  var last = sh.getLastRow();
  if (last < 2) return [];
  var h = HEADERS.MAP;
  var data = sh.getRange(2, 1, last - 1, h.length).getValues();
  var iExp = h.indexOf('experiment_id');
  var iOn = h.indexOf('enabled');
  var seen = {};
  var out = [];
  data.forEach(function (row) {
    var id = String(row[iExp]).trim();
    if (!id || !isTrue_(row[iOn]) || seen[id]) return;
    seen[id] = true;
    out.push({ id: id });
  });
  return out;
}

function readStatus_(ss) {
  var sh = ss.getSheetByName(TABS.STATUS);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var h = HEADERS.STATUS;
  sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues().forEach(function (r) {
    var id = String(r[0]).trim();
    if (!id) return;
    out[id] = {
      last_attempt: String(r[1] || ''),
      last_successful_refresh: String(r[2] || ''),
      status: String(r[3] || ''),
      error: String(r[4] || ''),
    };
  });
  return out;
}

function writeStatus_(ss, statusById) {
  var sh = ss.getSheetByName(TABS.STATUS);
  var h = HEADERS.STATUS;
  var rows = Object.keys(statusById).map(function (id) {
    var s = statusById[id];
    return [id, s.last_attempt, s.last_successful_refresh, s.status, s.error];
  });
  replaceBody_(sh, h.length, rows);
}

/** Replaces the snapshot for each successfully fetched experiment; keeps all other rows. */
function writeResults_(ss, newByExp) {
  var sh = ss.getSheetByName(TABS.RESULTS);
  var width = HEADERS.RESULTS.length;
  var iExp = HEADERS.RESULTS.indexOf('experiment_id');
  var existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues() : [];
  var kept = existing.filter(function (r) {
    return !Object.prototype.hasOwnProperty.call(newByExp, String(r[iExp]));
  });
  var all = kept;
  Object.keys(newByExp).forEach(function (id) { all = all.concat(newByExp[id]); });
  replaceBody_(sh, width, all);
}

function replaceBody_(sh, width, rows) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, width).clearContent();
  if (rows.length) {
    if (sh.getMaxRows() < rows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 1 - sh.getMaxRows());
    sh.getRange(2, 1, rows.length, width).setValues(rows);
  }
}
