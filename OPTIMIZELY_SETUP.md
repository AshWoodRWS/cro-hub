# Optimizely reporting integration: setup

Optimizely REST API → Google Apps Script (`OptimizelySync.gs`) → private Google Sheet → Lovable dashboard.

## 1. Credential type

The REST API (`https://api.optimizely.com/v2`) needs a **Personal Access Token**, sent as `Authorization: Bearer <token>`. Create one in Optimizely under Profile → API Access (or Settings → API Access).

An **SDK key** (used by Feature Experimentation SDKs) is a different credential and will not work against `/v2/experiments/{id}/results`.

Never paste the token into chat, a cell or code. If a token has already been pasted anywhere visible, revoke it in Optimizely and create a new one.

## 2. Tab headers (exact)

`setupTabs()` creates these. ID and timestamp columns are formatted as plain text so Sheets cannot reformat them.

**OptimizelyCampaignMap**

```
dashboard_campaign_id | optimizely_project_id | experiment_id | display_name | enabled
```

**OptimizelyResults** (one row per experiment, metric and variation; latest successful snapshot)

```
snapshot_at | experiment_id | window_start | window_end | metric_order | metric_id | metric_name | metric_role | variation_id | variation_label | is_baseline | visitors | conversions | metric_value | rate | lift | lift_status | significance | visitors_remaining | is_most_conclusive | confidence_threshold
```

**OptimizelySyncStatus**

```
experiment_id | last_attempt | last_successful_refresh | status | error
```

Status values: `ok`, `auth_error`, `forbidden`, `not_found`, `rate_limited`, `error`, `invalid_id`. A mapped experiment with no status row yet is "pending".

## 3. Setup steps

1. Create a **private** Google Sheet (do not share by link).
2. Extensions → Apps Script. Replace the default code with the contents of `OptimizelySync.gs`. Save.
3. Project Settings (gear) → Script Properties → Add property: name `OPTIMIZELY_API_TOKEN`, value = your token. Save.
4. In the editor, select `setupTabs` → Run. Approve the permissions prompt (Sheets, external requests, triggers).
5. Open `OptimizelyCampaignMap`. Replace the three placeholder rows:
   - `dashboard_campaign_id`: the stable campaign ID your dashboard already uses.
   - `optimizely_project_id` and `experiment_id`: numeric IDs, from the Optimizely URL or API.
   - `display_name`: label shown in the dashboard.
   - `enabled`: `TRUE` to sync. Placeholders are `FALSE` and non-numeric, so they never call the API.
   - A campaign can have several rows (several experiments) or none.
6. Run the first sync: reload the sheet, then Optimizely menu → Refresh now (or run `refreshNow`).
7. Check `OptimizelySyncStatus` shows `ok` and `OptimizelyResults` has rows.
8. Install the daily trigger: Optimizely menu → Install daily trigger (or run `installDailyTrigger`). It runs about 06:00 in the script's time zone. Check the time zone under Project Settings.

Behaviour: each unique experiment is fetched once per run; a successful fetch replaces that experiment's rows; a failed fetch keeps its last good rows and only updates the status. A 401 stops the run. A 429 retries twice (honouring Retry-After), then stops. Errors are sanitised (token stripped, 200 characters max). Results use Optimizely's default reporting window; `window_start` and `window_end` are what the API returned.

If your first run looks wrong, run `inspectExperimentShape('<experiment_id>')` and read the Execution log. It prints field names only, no values.

## 4. Lovable dashboard

**Important:** the project export I was given does not contain a Google Sheets connection, a GA4 reporting integration, a campaign selector or campaign IDs. It is all labelled sample data, so I could not wire the Optimizely tabs into those existing pieces. Paste the prompt below into Lovable (where the GA4 integration lives):

```
Add a read-only Optimizely section to the dashboard, using the same Google Sheets
connection and campaign selector as the GA4 reporting. Do not change GA4 behaviour.

Data (private Google Sheet, read server-side only, never from browser code):
- OptimizelyCampaignMap: dashboard_campaign_id, optimizely_project_id, experiment_id,
  display_name, enabled
- OptimizelyResults: snapshot_at, experiment_id, window_start, window_end, metric_order,
  metric_id, metric_name, metric_role, variation_id, variation_label, is_baseline,
  visitors, conversions, metric_value, rate, lift, lift_status, significance,
  visitors_remaining, is_most_conclusive, confidence_threshold
- OptimizelySyncStatus: experiment_id, last_attempt, last_successful_refresh, status, error
Treat every ID and timestamp column as text. Treat blank cells as missing, never as zero.

Behaviour:
- When a campaign is selected, take its enabled rows from OptimizelyCampaignMap and show
  only those experiment_ids. Switching campaigns updates immediately.
- Several experiments: tabs or separate sections, ordered as in the map, labelled with
  display_name. No rows: show "No Optimizely experiments linked to this campaign."
- Per experiment show: display_name, experiment_id, reporting window (window_start to
  window_end), and "Last refreshed" from last_successful_refresh.
- Results table: primary metric first (metric_order), then others; per metric one row per
  variation with baseline marked, visitors, conversions/metric_value, rate, lift,
  significance. Show Optimizely's reported statistics unchanged; do not recompute them.
  Blank stays "-".
- States: no status row or no results = "Pending first sync"; last_successful_refresh older
  than 36 hours = "Stale" with the date; status other than ok = show last good results with
  a banner and the sanitised error.
- If the published app cannot read the private sheet at runtime, read it through an
  authenticated server-side route (service account or the Sheets connector identity, with
  the sheet shared only with that identity). Never expose credentials to the browser.
```

## 5. Verification status

Nothing below has been run against real systems. I had no Optimizely token, no Apps Script runtime, no Sheet and no access to your Lovable project.

Done:
- Apps Script syntax check, and a parser test on mock data (primary metric first, baseline first, missing statistics stay blank, role inference).

Needs your access or real mappings:
1. **Response shape.** Field names (`reach`, `metrics[].results[variation_id]`, `samples`, `total_count`, `rate`, `lift.significance`, `start_time`, `end_time`) come from my knowledge of the API, not a live response. Run `inspectExperimentShape` on one real experiment and compare. Metric role may not be returned; if not, the first metric is labelled "primary" and the others are left blank.
2. **Compare against Optimizely.** For one experiment, check the primary metric and each variation (visitors, conversions, rate, lift, significance) against the Optimizely results page for the same window.
3. **Switching campaigns.** After real mappings exist, select two campaigns in the dashboard and confirm the experiment IDs shown match the map.
4. **Private Sheet access** from the published Lovable app.
5. **Daily trigger** actually fires (check Triggers and Executions the next morning).
6. **Rate-limit and error paths** (a wrong ID should show `not_found`; a bad token `auth_error`).
