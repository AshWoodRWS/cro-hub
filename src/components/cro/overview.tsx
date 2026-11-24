import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronRight,
  CircleCheck,
  FlaskConical,
  Info,
  MousePointer2,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { experiments, number, percent, sampleAnalytics, fy27Targets } from "@/lib/cro-data";
import { useFilters } from "./shell";
import { Sparkline, PerformanceChart } from "./charts";
import { useWorkspace } from "./workspace";
export function Overview() {
  const filters = useFilters(),
    { current, previous } = sampleAnalytics(filters);
  const { rows } = useWorkspace();
  const live = experiments.filter(
    (e) =>
      e.status === "Running" &&
      (!filters.site || filters.site === "Combined" || e.site === filters.site),
  );
  const scoped = rows.filter(
    (r) => !filters.site || filters.site === "Combined" || r.site === filters.site,
  );
  const metrics = [
    {
      label: "Sessions",
      value: number(current.sessions),
      change: (current.sessions / previous.sessions - 1) * 100,
      unit: "%",
      icon: Users,
      metric: "sessions",
      source: "GA4",
    },
    {
      label: "Enquiry form fills",
      value: number(current.enquiries),
      change: (current.enquiries / previous.enquiries - 1) * 100,
      unit: "%",
      icon: MousePointer2,
      metric: "enquiries",
      source: "GA4",
    },
    {
      label: "Sitewide conversion",
      value: percent(current.conversion),
      change: current.conversion - previous.conversion,
      unit: "pp",
      icon: ChartNoAxesCombined,
      metric: "conversion",
      source: "GA4",
    },
    {
      label: "Contact page conversion",
      value: percent(current.contactConversion),
      change: current.contactConversion - previous.contactConversion,
      unit: "pp",
      icon: TrendingUp,
      metric: "contact",
      source: "GA4",
    },
    {
      label: "Running experiments",
      value: String(live.length),
      change: null,
      unit: "",
      icon: FlaskConical,
      metric: "running",
      source: "Optimizely",
    },
  ];
  const site = filters.site ?? "Combined";
  const launches = fy27Targets.launches[site];
  const positive = fy27Targets.positive[site];
  return (
    <>
      <div className="metric-grid">
        {metrics.map((m, i) => (
          <Link
            key={m.label}
            to={m.metric === "running" ? "/experiments" : "/analytics"}
            search={{ ...filters, metric: m.metric }}
            className="metric-card"
          >
            <div className="metric-label">
              <span>{m.label}</span>
              <m.icon size={15} />
            </div>
            <div className="metric-value">{m.value}</div>
            <div className="metric-bottom">
              {m.change !== null ? (
                <span className={m.change >= 0 ? "positive-change" : "negative-change"}>
                  <ArrowUpRight size={13} />
                  {m.change >= 0 ? "+" : ""}
                  {m.change.toFixed(m.unit === "pp" ? 2 : 1)}
                  {m.unit === "pp" ? " pp" : "%"}
                  <span className="change-caption"> vs previous</span>
                </span>
              ) : (
                <span className="muted-text">
                  Across {site === "Combined" ? "both sites" : site}
                </span>
              )}
              <Sparkline index={i} />
            </div>
            <div className="metric-source">
              {m.source} <span>· sample</span>
              <ChevronRight size={12} />
            </div>
          </Link>
        ))}
      </div>
      <div className="overview-middle">
        <PerformanceChart />
        <section className="report-section scorecard">
          <div className="section-heading">
            <div>
              <div className="flex items-center gap-2">
                <Target size={17} className="text-primary" />
                <h2>FY27 at a glance</h2>
              </div>
              <p>1 Oct 2026 – 30 Sep 2027</p>
            </div>
            <span className="badge badge-primary">FY27</span>
          </div>
          <div className="fy-summary">
            <span className="fy-amount">{scoped.length}</span>
            <span>
              experiments launched
              <br />
              <strong>of {launches} target</strong>
            </span>
          </div>
          <KPIBar label="Launches" actual={scoped.length} target={launches} />
          <KPIBar
            label="Positive outcomes"
            actual={scoped.filter((r) => r.outcome === "Positive").length}
            target={positive}
          />
          <KPIBar label="Sitewide conversion" actual={current.conversion} target={1.67} rate />
          <div className="scorecard-note">
            <Info size={14} />
            <span>Sample progress. Targets from the FY27 programme.</span>
          </div>
          <Button variant="quiet" asChild className="w-full">
            <Link to="/history" search={filters}>
              View full scorecard <ArrowRight />
            </Link>
          </Button>
        </section>
      </div>
      <section className="report-section live-section">
        <div className="section-heading">
          <div className="flex items-center gap-3">
            <h2>Live experiments</h2>
            <span className="count-badge">{live.length}</span>
          </div>
          <Button asChild variant="link" size="sm">
            <Link to="/experiments" search={filters}>
              View all experiments <ArrowRight />
            </Link>
          </Button>
        </div>
        <ExperimentTable rows={live.slice(0, 4)} />
        <div className="table-footnote">
          <Info size={13} />
          <span>
            Early trends are not final outcomes. Significance shown is illustrative, not a live
            Optimizely result.
          </span>
        </div>
      </section>
      <div className="source-strip">
        <div>
          <span className="source-symbol">
            <ChartNoAxesCombined size={16} />
          </span>
          <strong>Google Analytics 4</strong>
          <span className="connection-note">Not connected</span>
        </div>
        <div>
          <span className="source-symbol">
            <FlaskConical size={16} />
          </span>
          <strong>Optimizely</strong>
          <span className="connection-note">Not connected</span>
        </div>
        <div>
          <span className="source-symbol">
            <Target size={16} />
          </span>
          <strong>Experiment tracker</strong>
          <span className="connection-note">Sample records</span>
        </div>
        <Button asChild variant="link" size="sm">
          <Link to="/sources" search={filters}>
            Manage sources <ArrowRight />
          </Link>
        </Button>
      </div>
    </>
  );
}
export function KPIBar({
  label,
  actual,
  target,
  rate: asRate = false,
}: {
  label: string;
  actual: number;
  target: number | null;
  rate?: boolean;
}) {
  const progress = target ? (actual / target) * 100 : 0;
  return (
    <div className="kpi-bar">
      <div className="flex justify-between">
        <span>{label}</span>
        <strong>
          {asRate ? percent(actual) : actual}
          <span>
            {" "}
            / {target === null || target === 0 ? "Not set" : asRate ? percent(target) : target}
          </span>
        </strong>
      </div>
      <progress value={Math.min(progress, 100)} max={100} />
      <span className="kpi-percent">
        {target ? `${progress.toFixed(1)}% to target` : "Target not configured"}
      </span>
    </div>
  );
}
export function ExperimentTable({ rows }: { rows: typeof experiments }) {
  const filters = useFilters();
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Experiment</th>
            <th>Site</th>
            <th>Status</th>
            <th className="numeric">Visitors</th>
            <th className="numeric">Relative uplift</th>
            <th className="numeric">Significance</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>
                <Link
                  to="/experiments"
                  search={{ ...filters, metric: e.id }}
                  className="experiment-title"
                >
                  {e.title}
                </Link>
                <small>
                  {e.page} <span>·</span> {e.type}
                </small>
              </td>
              <td>
                <span className={`site-badge ${e.site === "Trados" ? "trados" : ""}`}>
                  {e.site}
                </span>
              </td>
              <td>
                <span className={`status ${e.status.toLowerCase()}`}>
                  <i />
                  {e.status}
                </span>
              </td>
              <td className="numeric">{number(e.visitors)}</td>
              <td className={`numeric ${e.uplift >= 0 ? "positive-change" : "negative-change"}`}>
                {e.uplift > 0 ? "+" : ""}
                {e.uplift}%
              </td>
              <td className="numeric">
                {e.significant === null ? "Unavailable" : `${e.significant}%`}
              </td>
              <td>
                <Button asChild variant="quiet" size="icon">
                  <Link
                    aria-label={`View ${e.title}`}
                    to="/experiments"
                    search={{ ...filters, metric: e.id }}
                  >
                    <ArrowUpRight />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty-state">
          <FlaskConical />
          <h3>No experiments in this view</h3>
          <p>There are no matching sample experiments for these filters.</p>
        </div>
      )}
    </div>
  );
}
