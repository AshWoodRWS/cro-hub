import { useMemo, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  FileUp,
  FlaskConical,
  KeyRound,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  experiments,
  number,
  percent,
  sampleAnalytics,
  fiscalYear,
  defaultTarget,
  type TargetMetric,
} from "@/lib/cro-data";
import {
  mergeTracker,
  parseCSV,
  trackerFields,
  trackerFY,
  validateTracker,
  type Mapping,
} from "@/lib/tracker";
import { useFilters } from "./shell";
import { PerformanceChart } from "./charts";
import { ExperimentTable, KPIBar } from "./overview";
import { useWorkspace } from "./workspace";
export function Analytics() {
  const filters = useFilters(),
    data = sampleAnalytics(filters);
  const [dimension, setDimension] = useState("Landing page");
  const rows =
    dimension === "Landing page"
      ? [
          ["/contact", 0.046, 0.162],
          ["/language-services", 0.19, 0.024],
          ["/products/trados-studio", 0.17, 0.029],
          ["/pricing", 0.11, 0.021],
          ["Paid: AI translation", 0.08, 0.037],
        ]
      : dimension === "Channel"
        ? [
            ["Organic Search", 0.41, 0.017],
            ["Paid Search", 0.24, 0.024],
            ["Direct", 0.18, 0.015],
            ["Referral", 0.08, 0.012],
            ["Paid Social", 0.05, 0.009],
          ]
        : dimension === "Session source / medium"
          ? [
              ["google / organic", 0.41, 0.017],
              ["google / cpc", 0.24, 0.024],
              ["(direct) / (none)", 0.18, 0.015],
              ["linkedin / paid-social", 0.05, 0.009],
            ]
          : dimension === "Device"
            ? [
                ["Desktop", 0.68, 0.021],
                ["Mobile", 0.29, 0.009],
                ["Tablet", 0.03, 0.013],
              ]
            : [
                ["United States", 0.29, 0.019],
                ["United Kingdom", 0.17, 0.018],
                ["Germany", 0.11, 0.016],
                ["France", 0.07, 0.014],
                ["India", 0.06, 0.01],
              ];
  return (
    <>
      <div className="analytics-summary">
        {[
          ["Sessions", number(data.current.sessions), "All sessions"],
          ["Enquiry form fills", number(data.current.enquiries), "enquiry_submit"],
          ["Bounce rate", percent(data.current.bounce), "GA4 bounce rate"],
          ["Sitewide conversion", percent(data.current.conversion), "Enquiries ÷ sessions"],
          [
            "Contact conversion",
            percent(data.current.contactConversion),
            "Contact enquiries ÷ sessions",
          ],
        ].map((x) => (
          <div className="summary-cell" key={x[0]}>
            <span>{x[0]}</span>
            <strong>{x[1]}</strong>
            <small>{x[2]}</small>
          </div>
        ))}
      </div>
      <PerformanceChart />
      <div className="analytics-grid">
        <section className="report-section">
          <div className="section-heading">
            <div>
              <h2>Performance breakdown</h2>
              <p>Sample priority reporting view</p>
            </div>
            <select
              className="report-select"
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
              aria-label="Breakdown dimension"
            >
              {["Landing page", "Channel", "Session source / medium", "Device", "Country"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>{dimension}</th>
                <th className="numeric">Sessions</th>
                <th className="numeric">Enquiries</th>
                <th className="numeric">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, share, cr]) => (
                <tr key={String(name)}>
                  <td>{name}</td>
                  <td className="numeric">
                    {number(Math.round(data.current.sessions * Number(share)))}
                  </td>
                  <td className="numeric">
                    {number(Math.round(data.current.sessions * Number(share) * Number(cr)))}
                  </td>
                  <td className="numeric">{percent(Number(cr) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="report-section realtime">
          <div className="section-heading">
            <div>
              <h2>Realtime</h2>
              <p>Last 30 minutes · separate from standard reports</p>
            </div>
            <span className="connection-note">Sample</span>
          </div>
          <div className="realtime-number">184</div>
          <p>
            Active users on{" "}
            {filters.site && filters.site !== "Combined" ? filters.site : "both sites"}
          </p>
          <div className="event-list">
            {[
              ["page_view", 642],
              ["enquiry_start", 22],
              ["enquiry_submit", 6],
              ["trial_click", 11],
            ].map(([n, c]) => (
              <div key={n}>
                <span>{n}</span>
                <strong>{c}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
export function Experiments() {
  const filters = useFilters();
  const [status, setStatus] = useState("All"),
    [type, setType] = useState("All"),
    [page, setPage] = useState("");
  const rows = experiments.filter(
    (e) =>
      (!filters.site || filters.site === "Combined" || e.site === filters.site) &&
      (status === "All" || e.status === status) &&
      (type === "All" || e.type === type) &&
      e.page.toLowerCase().includes(page.toLowerCase()),
  );
  const selected = rows.find((e) => e.id === filters.metric) ?? rows[0];
  return (
    <>
      <div className="filter-row">
        <select
          className="report-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
        >
          <option>All</option>
          <option>Running</option>
          <option>Paused</option>
          <option>Completed</option>
        </select>
        <select
          className="report-select"
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Experiment type"
        >
          <option>All</option>
          <option>A/B test</option>
          <option>Personalisation</option>
        </select>
        <input
          className="input page-search"
          placeholder="Filter by page"
          value={page}
          onChange={(e) => setPage(e.target.value)}
        />
      </div>
      <section className="report-section">
        <ExperimentTable rows={rows} />
      </section>
      {selected && (
        <section className="report-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">EXPERIMENT DETAIL · {selected.id}</span>
              <h2>{selected.title}</h2>
              <p>
                {selected.start} – {selected.end ?? "Running"} · Baseline: Original · Last sync:
                sample snapshot
              </p>
            </div>
            <Button variant="quiet" disabled>
              <ExternalLink />
              Optimizely link after connection
            </Button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Variation</th>
                <th className="numeric">Visitors</th>
                <th className="numeric">Conversions</th>
                <th className="numeric">Rate</th>
                <th className="numeric">Relative uplift</th>
                <th className="numeric">Significance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Original</td>
                <td className="numeric">{number(Math.round(selected.visitors / 2))}</td>
                <td className="numeric">{number(Math.round(selected.visitors * 0.0081))}</td>
                <td className="numeric">1.62%</td>
                <td className="numeric">Baseline</td>
                <td className="numeric">—</td>
              </tr>
              <tr>
                <td>Variation 1</td>
                <td className="numeric">{number(Math.round(selected.visitors / 2))}</td>
                <td className="numeric">
                  {number(Math.round(selected.visitors * 0.0081 * (1 + selected.uplift / 100)))}
                </td>
                <td className="numeric">{percent(1.62 * (1 + selected.uplift / 100))}</td>
                <td className="numeric">{selected.uplift}%</td>
                <td className="numeric">
                  {selected.significant === null ? "Unavailable" : `${selected.significant}%`}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="callout">
            <AlertTriangle />
            <span>
              Sample result only. Native results, freshness and experiment links require Optimizely
              access.
            </span>
          </div>
        </section>
      )}
    </>
  );
}
export function History() {
  const filters = useFilters(),
    { rows, targets, setTargets } = useWorkspace();
  const [fy, setFy] = useState(String(fiscalYear(new Date("2026-11-23")))),
    [outcome, setOutcome] = useState("All"),
    [implemented, setImplemented] = useState("All");
  const site = filters.site ?? "Combined";
  const view = rows.filter(
    (r) =>
      (site === "Combined" || r.site === site) &&
      String(trackerFY(r)) === fy &&
      (outcome === "All" || r.outcome === outcome) &&
      (implemented === "All" || String(r.implemented) === implemented),
  );
  const completed = view.filter((r) => r.completed);
  const positive = completed.filter((r) => r.outcome === "Positive").length;
  const significant = completed.filter((r) => r.significant).length;
  const target = (metric: TargetMetric) =>
    targets[`${fy}:${site}:${metric}`] ?? defaultTarget(Number(fy), site, metric);
  const values: { metric: TargetMetric; label: string; actual: number }[] = [
    { metric: "launches", label: "Launches", actual: view.length },
    { metric: "completed", label: "Completed tests", actual: completed.length },
    { metric: "positive", label: "Positive outcomes", actual: positive },
    { metric: "significant", label: "Significant results", actual: significant },
    {
      metric: "personalisation",
      label: "Personalisation experiences",
      actual: view.filter((r) => r.type === "Personalisation").length,
    },
    {
      metric: "implementations",
      label: "Implementations",
      actual: view.filter((r) => r.implemented).length,
    },
    {
      metric: "conversion",
      label: "Sitewide conversion",
      actual: sampleAnalytics(filters).current.conversion,
    },
  ];
  return (
    <>
      <div className="filter-row">
        <select className="report-select" value={fy} onChange={(e) => setFy(e.target.value)}>
          <option>2027</option>
          <option>2026</option>
        </select>
        <select
          className="report-select"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        >
          <option>All</option>
          <option>Positive</option>
          <option>Negative</option>
          <option>Inconclusive</option>
          <option>Pending</option>
        </select>
        <select
          className="report-select"
          value={implemented}
          onChange={(e) => setImplemented(e.target.value)}
        >
          <option value="All">All implementation states</option>
          <option value="true">Implemented</option>
          <option value="false">Not implemented</option>
        </select>
      </div>
      <div className="history-grid">
        <section className="report-section">
          <div className="section-heading">
            <div>
              <h2>FY{fy.slice(2)} scorecard</h2>
              <p>Baseline, target, actual and % to target</p>
            </div>
          </div>
          {values.map((item) => (
            <div key={item.metric}>
              <KPIBar
                label={item.label}
                actual={item.actual}
                target={target(item.metric)}
                rate={item.metric === "conversion"}
              />
              <label className="label target-input">
                Sample target
                <input
                  aria-label={`${item.label} target`}
                  className="input"
                  type="number"
                  min="0"
                  step={item.metric === "conversion" ? "0.01" : "1"}
                  value={target(item.metric) ?? ""}
                  placeholder="Not set"
                  onChange={(e) => {
                    const next = { ...targets };
                    if (e.target.value === "") delete next[`${fy}:${site}:${item.metric}`];
                    else next[`${fy}:${site}:${item.metric}`] = Math.max(0, Number(e.target.value));
                    setTargets(next);
                  }}
                />
              </label>
            </div>
          ))}
          <p className="muted-text">
            Baseline: not configured · Target edits are sample-session only.
          </p>
        </section>
        <section className="report-section">
          <h2>Outcome rates</h2>
          <div className="rate-card">
            <strong>{completed.length ? percent((positive / completed.length) * 100) : "—"}</strong>
            <span>
              Win rate · {positive} positive ÷ {completed.length} completed
            </span>
          </div>
          <div className="rate-card">
            <strong>
              {completed.length ? percent((significant / completed.length) * 100) : "—"}
            </strong>
            <span>
              Significance rate · {significant} significant ÷ {completed.length} completed
            </span>
          </div>
          <p className="muted-text">Denominator awaits confirmation during tracker mapping.</p>
        </section>
      </div>
      <section className="report-section">
        <h2>Historical records</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Experiment</th>
              <th>Site</th>
              <th>Launched</th>
              <th>Outcome</th>
              <th>Implemented</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.sourceId}>
                <td>
                  {r.title}
                  <small>{r.optimizelyId ? `Optimizely ${r.optimizelyId}` : "Tracker only"}</small>
                </td>
                <td>{r.site}</td>
                <td>{r.launched}</td>
                <td>{r.outcome}</td>
                <td>{r.implemented ? "Yes" : "No"}</td>
                <td>{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!view.length && (
          <div className="empty-state">
            <Database />
            <h3>No historical records</h3>
            <p>Try another filter or import tracker data.</p>
          </div>
        )}
      </section>
    </>
  );
}
export function Sources() {
  const { rows, setRows } = useWorkspace();
  const [configSite, setConfigSite] = useState("RWS");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [csv, setCsv] = useState<Record<string, string>[]>([]),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Mapping>(
      Object.fromEntries(trackerFields.map((f) => [f, f])) as Mapping,
    ),
    [message, setMessage] = useState("");
  const result = useMemo(() => validateTracker(csv, mapping), [csv, mapping]);
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = parseCSV(await file.text());
    setCsv(parsed.data);
    setHeaders(parsed.meta.fields ?? []);
    setMapping(
      Object.fromEntries(
        trackerFields.map((f) => [
          f,
          (parsed.meta.fields ?? []).find(
            (h) => h.toLowerCase().replace(/[^a-z]/g, "") === f.toLowerCase(),
          ) ?? "",
        ]),
      ) as Mapping,
    );
    setMessage("");
  }
  function importRows() {
    const before = rows.length;
    setRows(mergeTracker(rows, result.valid));
    setMessage(
      `${result.valid.length} valid rows applied. ${before} existing records retained or updated; repeat imports do not create duplicates.`,
    );
  }
  return (
    <>
      <div className="source-grid">
        {[
          {
            name: "Google Analytics 4",
            state: "Not connected",
            detail: "Property IDs, hostnames and enquiry events required",
            Icon: KeyRound,
          },
          {
            name: "Optimizely",
            state: "Not connected",
            detail: "Project IDs and read-only API access required",
            Icon: FlaskConical,
          },
          {
            name: "Experiment tracker",
            state: "Sample records",
            detail: `${rows.length} records in this session`,
            Icon: Database,
          },
        ].map(({ name, state, detail, Icon }) => (
          <section className="report-section source-card" key={String(name)}>
            <Icon />
            <h2>{String(name)}</h2>
            <span className="connection-note">{String(state)}</span>
            <p>{String(detail)}</p>
            <Button variant="quiet" disabled>
              <RefreshCw />
              Refresh unavailable
            </Button>
          </section>
        ))}
      </div>
      <section className="report-section">
        <div className="section-heading">
          <div>
            <h2>Tracker CSV import</h2>
            <p>
              Sample session only · Preview mappings and validate rows before import. Changes reset
              when the page reloads.
            </p>
          </div>
          <label className="upload-button">
            <FileUp />
            Choose CSV
            <input type="file" accept=".csv,text/csv" onChange={upload} />
          </label>
        </div>
        {headers.length ? (
          <>
            <div className="mapping-grid">
              {trackerFields.map((f) => (
                <label className="label" key={f}>
                  {f}
                  <select
                    className="input"
                    value={mapping[f]}
                    onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}
                  >
                    <option value="">Not mapped</option>
                    {headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="import-summary">
              <span>
                <CheckCircle2 />
                {result.valid.length} valid
              </span>
              <span>
                <AlertTriangle />
                {result.errors.length} need review
              </span>
            </div>
            {result.errors.slice(0, 5).map((e) => (
              <p key={e.row} className="error-line">
                Row {e.row}: {e.message}
              </p>
            ))}
            <Button onClick={importRows} disabled={!result.valid.length}>
              <Upload />
              Apply to sample workspace
            </Button>
          </>
        ) : (
          <div className="empty-state">
            <Upload />
            <h3>No tracker file selected</h3>
            <p>
              Use columns for site, project ID, Optimizely ID, title, ISO launch and completion
              dates, outcome, implementation, significance, type and notes.
            </p>
          </div>
        )}
        {message && <p className="success-line">{message}</p>}
      </section>
      <section className="report-section">
        <div className="section-heading">
          <div>
            <h2>Reporting mappings</h2>
            <p>Sample configuration · not saved to live sources</p>
          </div>
          <select
            aria-label="Mapping site"
            className="report-select"
            value={configSite}
            onChange={(e) => setConfigSite(e.target.value)}
          >
            <option>RWS</option>
            <option>Trados</option>
          </select>
        </div>
        <div className="mapping-grid">
          {[
            "GA4 property ID",
            "Hostname",
            "Enquiry event",
            "Contact page",
            "Paid page scope",
            "Optimizely project IDs",
          ].map((field) => (
            <label className="label" key={field}>
              {field}
              <input
                className="input mt-2"
                value={config[`${configSite}:${field}`] ?? ""}
                onChange={(e) =>
                  setConfig({ ...config, [`${configSite}:${field}`]: e.target.value })
                }
                placeholder="Not configured"
              />
            </label>
          ))}
        </div>
        <p className="muted-text">
          Sitewide: enquiry submission events / sessions. Contact: enquiries in contact-page
          sessions / contact-page sessions. Both definitions await Looker reconciliation.
        </p>
      </section>
      <section className="report-section">
        <h2>Configuration needed</h2>
        <ul className="config-list">
          <li>GA4 property IDs, hostnames, enquiry events and page scopes for RWS and Trados</li>
          <li>
            Optimizely project IDs and read-only API access, including personalisation availability
          </li>
          <li>A current tracker export and confirmed rate denominators</li>
          <li>Priority Looker reports with dates, filters and timezones for reconciliation</li>
          <li>Approved viewer and admin users</li>
        </ul>
      </section>
    </>
  );
}
