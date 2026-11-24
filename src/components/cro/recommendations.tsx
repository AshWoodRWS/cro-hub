import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  Sparkles,
  Square,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { experiments, number, percent } from "@/lib/cro-data";
import {
  buildEvidence,
  metricOptions,
  readRecommendationStream,
  recommendationFilters,
  type RecommendationEvidence,
  type RecommendationEvent,
  type RecommendationSelection,
} from "@/lib/recommendations";
import { useFilters } from "./shell";

type CompleteEvent = Extract<RecommendationEvent, { type: "complete" }>;
export function Recommendations() {
  const filters = useFilters();
  const [metrics, setMetrics] = useState<RecommendationSelection["metrics"]>([
    "sessions",
    "enquiries",
    "conversion",
  ]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [reasoning, setReasoning] = useState(""),
    [characters, setCharacters] = useState(0),
    [stopped, setStopped] = useState(false);
  const [result, setResult] = useState<CompleteEvent | null>(null),
    [generatedSelection, setGeneratedSelection] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const available = experiments.filter(
    (e) => !filters.site || filters.site === "Combined" || e.site === filters.site,
  );
  const experimentIds = selectedIds.filter((id) => available.some((e) => e.id === id));
  const selection: RecommendationSelection = {
    filters: recommendationFilters(filters),
    metrics,
    experimentIds,
  };
  let evidence: RecommendationEvidence | undefined;
  let selectionError = "";
  try {
    if (metrics.length + experimentIds.length) evidence = buildEvidence(selection);
  } catch (e) {
    selectionError = e instanceof Error ? e.message : "Invalid selection.";
  }
  const signature = JSON.stringify(selection);
  async function generate() {
    if (loading || !evidence) return;
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError("");
    setStopped(false);
    setReasoning("");
    setCharacters(0);
    setResult(null);
    setGeneratedSelection(signature);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
        signal: controller.signal,
      });
      await readRecommendationStream(response, (event) => {
        if (event.type === "reasoning") setReasoning((old) => old + event.text);
        if (event.type === "progress") setCharacters(event.characters);
        if (event.type === "complete") setResult(event);
      });
    } catch (e) {
      if (controller.signal.aborted) setStopped(true);
      else setError(e instanceof Error ? e.message : "Recommendations could not be generated.");
    } finally {
      setLoading(false);
      abort.current = null;
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5 mb-6">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-primary" />
          <div>
            <strong className="text-sm">Selected evidence</strong>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.length} metrics · {experimentIds.length} experiment results ·{" "}
              {filters.site ?? "Combined"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Lovable AI · Uses workspace credits</span>
          {loading ? (
            <Button variant="quiet" onClick={() => abort.current?.abort()}>
              <Square />
              Stop
            </Button>
          ) : (
            <Button onClick={generate} disabled={!evidence || Boolean(selectionError)}>
              <Sparkles />
              Generate recommendations
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(290px,0.9fr)_minmax(0,1.4fr)] gap-6 items-start">
        <div>
          <section className="report-section">
            <div className="section-heading">
              <h2>Dashboard metrics</h2>
              <Button
                variant="link"
                size="sm"
                disabled={loading}
                onClick={() =>
                  setMetrics(
                    metrics.length === metricOptions.length ? [] : metricOptions.map((m) => m.id),
                  )
                }
              >
                {metrics.length === metricOptions.length ? "Clear" : "Select all"}
              </Button>
            </div>
            <div className="divide-y divide-border">
              {metricOptions.map((m) => {
                const item = evidence?.metrics.find((e) => e.id === `metric:${m.id}`);
                return (
                  <label key={m.id} className="flex items-start gap-3 py-4 cursor-pointer">
                    <Checkbox
                      aria-label={`Select ${m.label}`}
                      checked={metrics.includes(m.id)}
                      disabled={loading}
                      onCheckedChange={(checked) =>
                        setMetrics((old) =>
                          checked ? [...old, m.id] : old.filter((id) => id !== m.id),
                        )
                      }
                    />
                    <span className="flex-1 min-w-0">
                      <span className="flex justify-between gap-3 text-xs font-medium">
                        <span>{m.label}</span>
                        {item && (
                          <span className="tabular-nums">
                            {m.unit === "percent" ? percent(item.current) : number(item.current)}
                          </span>
                        )}
                      </span>
                      <span className="block text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                        {m.definition}
                      </span>
                      {item && (
                        <span className="block text-[10px] text-muted-foreground mt-1">
                          Previous:{" "}
                          {m.unit === "percent" ? percent(item.previous) : number(item.previous)} ·
                          GA4 sample
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
          <section className="report-section">
            <div className="section-heading">
              <h2>Experiment results</h2>
              <span className="count-badge">{experimentIds.length} selected</span>
            </div>
            <div className="max-h-[430px] overflow-y-auto divide-y divide-border">
              {available.map((e) => (
                <label key={e.id} className="flex items-start gap-3 py-4 cursor-pointer">
                  <Checkbox
                    aria-label={`Select experiment ${e.title}`}
                    disabled={loading}
                    checked={experimentIds.includes(e.id)}
                    onCheckedChange={(checked) =>
                      setSelectedIds((old) =>
                        checked ? [...old, e.id] : old.filter((id) => id !== e.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium leading-relaxed">{e.title}</span>
                    <span className="flex flex-wrap gap-2 items-center mt-2">
                      <span className="site-badge">{e.site}</span>
                      <span className={`status ${e.status.toLowerCase()}`}>
                        <i />
                        {e.status}
                      </span>
                    </span>
                    <span className="block mt-2 text-[10px] text-muted-foreground">
                      {number(e.visitors)} visitors · {e.uplift > 0 ? "+" : ""}
                      {e.uplift}% relative uplift
                    </span>
                    <span className="block mt-1 text-[10px] text-muted-foreground">
                      Significance: {e.significant === null ? "unavailable" : `${e.significant}%`} ·
                      Optimizely sample
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>
        <section className="report-section" aria-live="polite">
          <div className="section-heading">
            <h2>Prioritized next actions</h2>
            <span className="badge badge-primary">AI-powered</span>
          </div>
          <div className="flex items-start gap-2 border-b border-border pb-4 mb-4 text-[11px] text-muted-foreground leading-relaxed">
            <AlertTriangle className="size-4 shrink-0 text-primary" />
            <span>
              Sample evidence only. Live GA4 and Optimizely sources are not connected. Analyst
              review is required before action.
            </span>
          </div>
          {selectionError && <p className="error-line">{selectionError}</p>}
          {error && (
            <div
              role="alert"
              className="border border-destructive/30 rounded-md p-4 text-xs text-destructive leading-relaxed"
            >
              <strong className="block mb-1">Recommendations unavailable</strong>
              {error}
            </div>
          )}
          {loading && (
            <div className="py-8">
              <div className="flex items-center gap-3 text-sm">
                <LoaderCircle className="size-4 animate-spin text-primary" />
                <span>
                  {characters
                    ? "Preparing prioritized recommendations…"
                    : "Analyzing selected evidence…"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {evidence?.reportingWindow} · {metrics.length + experimentIds.length} evidence items
              </p>
            </div>
          )}
          {(loading || stopped) && reasoning && (
            <details className="border-t border-border py-4">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                Analysis summary
              </summary>
              <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap mt-3">
                {reasoning}
              </p>
            </details>
          )}
          {stopped && (
            <p className="text-xs text-muted-foreground py-4">
              Generation stopped. No final recommendations were accepted.
            </p>
          )}
          {!loading && !error && !stopped && !result && (
            <div className="empty-state">
              <Sparkles />
              <h3>No recommendations yet</h3>
              <p>
                {evidence
                  ? "Select the evidence to include in your CRO review."
                  : "No evidence selected."}
              </p>
            </div>
          )}
          {result && (
            <>
              {signature !== generatedSelection && (
                <p className="text-xs text-muted-foreground border-b border-border pb-3 mb-4">
                  Selection changed. These recommendations reflect the evidence submitted
                  previously.
                </p>
              )}
              <p className="text-xs leading-relaxed mb-4">{result.report.summary}</p>
              <div className="text-[10px] text-muted-foreground mb-5">
                {result.evidence.site} · {result.evidence.reportingWindow} · Generated{" "}
                {new Date(result.generatedAt).toLocaleString("en-GB")}
                <br />
                Compared with {result.evidence.comparisonWindow}
              </div>
              <ol className="divide-y divide-border">
                {result.report.recommendations.map((r, index) => (
                  <li key={index} className="py-5 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm leading-relaxed font-semibold">
                        <span className="text-primary mr-2">{index + 1}.</span>
                        {r.title}
                      </h3>
                      <span
                        className={`badge ${r.priority === "High" ? "badge-primary" : r.priority === "Medium" ? "badge-info" : "badge-outline"} shrink-0`}
                      >
                        {r.priority}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed mt-3">{r.action}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                      {r.rationale}
                    </p>
                    <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground mt-3">
                      <span>
                        Effort: <strong>{r.effort}</strong>
                      </span>
                      <span>
                        Evidence confidence: <strong>{r.confidence}</strong>
                      </span>
                    </div>
                    <p className="text-xs mt-3 leading-relaxed">
                      <strong>Expected impact:</strong> {r.expectedImpact}
                    </p>
                    <p className="text-xs mt-2 leading-relaxed">
                      <strong>Validate next:</strong> {r.validation}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {r.evidenceIds.map((id) => {
                        const metric = result.evidence.metrics.find((m) => m.id === id),
                          experiment = result.evidence.experiments.find((e) => e.id === id);
                        return (
                          <Button key={id} size="sm" variant="quiet" asChild>
                            <Link
                              to={metric ? "/analytics" : "/experiments"}
                              search={{
                                ...result.evidence.filters,
                                site: result.evidence.site,
                                metric: metric
                                  ? id.replace("metric:", "")
                                  : id.replace("experiment:", ""),
                              }}
                            >
                              <span className="max-w-[250px] truncate">
                                {metric?.label ?? experiment?.title ?? id}
                              </span>
                              <ArrowUpRight />
                            </Link>
                          </Button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="border-t border-border pt-4 mt-2">
                <h3 className="text-xs flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" />
                  Evidence limits
                </h3>
                <ul className="list-disc pl-4 text-[11px] text-muted-foreground leading-relaxed mt-3 space-y-2">
                  {result.report.limitations.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
