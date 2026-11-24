import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  FlaskConical,
  Globe2,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { presets, reportingWindow, type Filters, type Site } from "@/lib/cro-data";
export const navigation = [
  { title: "Overview", to: "/" as const, icon: LayoutDashboard },
  { title: "Analytics", to: "/analytics" as const, icon: BarChart3 },
  { title: "Experiments", to: "/experiments" as const, icon: FlaskConical },
  { title: "History & KPIs", to: "/history" as const, icon: Target },
  { title: "Data Sources", to: "/sources" as const, icon: Database },
  { title: "Recommendations", to: "/recommendations" as const, icon: Sparkles },
];
export function useFilters(): Filters {
  return useRouterState({ select: (s) => s.location.search });
}
export function useFilterUpdate() {
  const navigate = useNavigate();
  return (patch: Partial<Filters>) =>
    navigate({ to: ".", search: (old) => ({ ...old, ...patch }) });
}
export function Shell({ children }: { children: ReactNode }) {
  const filters = useFilters(),
    update = useFilterUpdate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false),
    [help, setHelp] = useState(false),
    [dates, setDates] = useState(false),
    [start, setStart] = useState("2026-11-09"),
    [end, setEnd] = useState("2026-11-15"),
    [error, setError] = useState("");
  const window = reportingWindow(filters);
  const site = filters.site ?? "Combined";
  return (
    <div className={`workspace-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="workspace-sidebar">
        <Link to="/" search={filters} className="brand">
          <span className="brand-mark">
            <Activity size={21} />
          </span>
          {!collapsed && (
            <span>
              CRO <span className="text-gradient">Hub</span>
            </span>
          )}
        </Link>
        {!collapsed && <div className="workspace-label">RWS & TRADOS PROGRAMME</div>}
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <Button
              asChild
              variant="nav"
              key={item.title}
              data-active={path === item.to}
              className="nav-item"
              title={collapsed ? item.title : undefined}
            >
              <Link to={item.to} search={filters}>
                <item.icon />
                <span className={collapsed ? "hidden" : ""}>{item.title}</span>
                {!collapsed && path === item.to && <span className="nav-active-dot" />}
              </Link>
            </Button>
          ))}
        </nav>
        {!collapsed && (
          <div className="sidebar-score">
            <div className="flex items-center gap-2">
              <Target size={16} />
              <span>Built for better outcomes.</span>
            </div>
            <p>
              One programme. Two sites.
              <br />A clearer picture.
            </p>
            <div className="flex gap-2">
              <span className="site-logo">rws</span>
              <span className="site-logo trados-logo">trados</span>
            </div>
          </div>
        )}
        <div className="sidebar-bottom">
          <Button
            variant="nav"
            className="nav-item"
            onClick={() => setHelp(true)}
            title="Reporting definitions"
          >
            <CircleHelp />
            {!collapsed && "Reporting definitions"}
          </Button>
          <div className="sidebar-user">
            <span className="avatar">CR</span>
            {!collapsed && (
              <div>
                <strong>CRO team</strong>
                <small>Sample workspace</small>
              </div>
            )}
            <Button
              variant="quiet"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.to === path)?.title ?? "Report"}</strong>
          </div>
          <div className="topbar-right">
            <span className="private-label">
              <ShieldCheck size={14} /> Internal programme
            </span>
            <span className="avatar small">CR</span>
          </div>
        </header>
        <main className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">CRO PROGRAMME</div>
              <h1>{navigation.find((n) => n.to === path)?.title ?? "Report"}</h1>
              <p>
                {path === "/"
                  ? "Website performance, experiments and targets. All in one place."
                  : path === "/analytics"
                    ? "A closer look at how your websites are performing."
                    : path === "/experiments"
                      ? "Every experiment. From first signal to final outcome."
                      : path === "/history"
                        ? "The decisions behind the data. The progress ahead."
                        : path === "/recommendations"
                          ? "Prioritized optimization actions, grounded in selected evidence."
                          : "Connections, reporting definitions and programme settings."}
              </p>
            </div>
            <span className="sample-badge">
              <span />
              Sample data
            </span>
          </div>
          <div className="filterbar">
            <div className="site-control">
              <Globe2 size={16} />
              <span>Site</span>
              <div className="site-segment" role="group" aria-label="Select site">
                {(["Combined", "RWS", "Trados"] as Site[]).map((s) => (
                  <Button
                    variant="quiet"
                    key={s}
                    size="sm"
                    data-selected={site === s}
                    onClick={() => update({ site: s })}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
            <div className="date-control">
              <CalendarDays size={16} />
              <select
                aria-label="Reporting period"
                value={filters.period ?? "complete-week"}
                onChange={(e) =>
                  e.target.value === "custom" ? setDates(true) : update({ period: e.target.value })
                }
              >
                {presets.map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="filter-divider" />
              <span>{window.label}</span>
              <ChevronDown size={14} />
            </div>
          </div>
          <div className="comparison-line">
            <span>
              Compared with{" "}
              {window.comparisonStart.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}{" "}
              –{" "}
              {window.comparisonEnd.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className={window.provisional ? "provisional-note" : "complete-note"}>
              {window.provisional
                ? "Provisional reporting window"
                : "Latest complete reporting window"}{" "}
              <Check size={12} />
            </span>
          </div>
          {children}
          <footer className="page-footer">
            <span>
              CRO Hub <span>·</span> RWS & Trados
            </span>
            <span>Sample data · Live sources not connected</span>
          </footer>
        </main>
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reporting definitions</DialogTitle>
          </DialogHeader>
          <div className="definition-list">
            <p>
              <strong>Sitewide conversion rate</strong>Enquiry form submission events ÷ sessions ×
              100. Provisional definition awaiting Looker reconciliation.
            </p>
            <p>
              <strong>Contact page conversion rate</strong>Enquiries in contact-page sessions ÷
              contact-page sessions × 100.
            </p>
            <p>
              <strong>Relative change vs absolute change</strong>Relative change = (current ÷
              previous − 1) × 100. Absolute conversion change is shown in percentage points.
            </p>
            <p>
              <strong>Combined reporting</strong>Compatible counts are summed before calculating a
              rate. Experiment uplifts are never summed.
            </p>
            <p>
              <strong>Fiscal year</strong>1 October – 30 September. FY27 ends on 30 September 2027.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={dates} onOpenChange={setDates}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom reporting dates</DialogTitle>
          </DialogHeader>
          <label className="label">
            Start date
            <input
              className="input mt-2"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="label">
            End date
            <input
              className="input mt-2"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {error && <p className="text-destructive">{error}</p>}
          <Button
            onClick={() => {
              try {
                reportingWindow({ period: "custom", start, end });
                update({ period: "custom", start, end });
                setDates(false);
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Invalid dates");
              }
            }}
          >
            Apply dates <ArrowUpRight />
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
