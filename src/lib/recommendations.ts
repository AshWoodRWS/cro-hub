import { z } from "zod";
import { experiments, sampleAnalytics, reportingWindow, type Filters } from "./cro-data";

export const metricOptions = [
  { id: "sessions", label: "Sessions", definition: "All website sessions", unit: "count" },
  {
    id: "enquiries",
    label: "Enquiry form fills",
    definition: "Enquiry submission events",
    unit: "count",
  },
  {
    id: "conversion",
    label: "Sitewide conversion rate",
    definition: "Enquiry submission events / sessions × 100",
    unit: "percent",
  },
  {
    id: "contactConversion",
    label: "Contact page conversion rate",
    definition: "Enquiries in contact-page sessions / contact-page sessions × 100",
    unit: "percent",
  },
  {
    id: "bounce",
    label: "Bounce rate",
    definition: "GA4 non-engaged sessions / sessions × 100",
    unit: "percent",
  },
] as const;
const metricId = z.enum(["sessions", "enquiries", "conversion", "contactConversion", "bounce"]);
export const selectionSchema = z
  .object({
    filters: z
      .object({
        site: z.enum(["Combined", "RWS", "Trados"]).optional(),
        period: z
          .enum([
            "complete-week",
            "this-week",
            "last-week",
            "mtd",
            "previous-month",
            "fytd",
            "custom",
          ])
          .optional(),
        start: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        end: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .strict(),
    metrics: z.array(metricId).max(5),
    experimentIds: z.array(z.string().max(30)).max(30),
  })
  .strict()
  .refine(
    (s) => s.metrics.length + s.experimentIds.length > 0,
    "Select at least one metric or experiment.",
  );
export type RecommendationSelection = z.infer<typeof selectionSchema>;
export function recommendationFilters(filters: Filters): RecommendationSelection["filters"] {
  const periods = [
    "complete-week",
    "this-week",
    "last-week",
    "mtd",
    "previous-month",
    "fytd",
    "custom",
  ];
  return selectionSchema.parse({
    filters: {
      site: filters.site ?? "Combined",
      period: periods.includes(filters.period ?? "") ? filters.period : "complete-week",
      ...(filters.start ? { start: filters.start } : {}),
      ...(filters.end ? { end: filters.end } : {}),
    },
    metrics: ["sessions"],
    experimentIds: [],
  }).filters;
}
export const recommendationSchema = z
  .object({
    summary: z.string(),
    recommendations: z.array(
      z
        .object({
          title: z.string(),
          priority: z.enum(["High", "Medium", "Low"]),
          action: z.string(),
          rationale: z.string(),
          evidenceIds: z.array(z.string()),
          expectedImpact: z.string(),
          effort: z.enum(["Low", "Medium", "High"]),
          confidence: z.enum(["Low", "Medium", "High"]),
          validation: z.string(),
        })
        .strict(),
    ),
    limitations: z.array(z.string()),
  })
  .strict();
export type RecommendationReport = z.infer<typeof recommendationSchema>;
export interface MetricEvidence {
  id: string;
  label: string;
  source: string;
  current: number;
  previous: number;
  absoluteChange: number;
  relativeChange: number | null;
  definition: string;
  unit: string;
  numerator: number | null;
  denominator: number | null;
}
export function buildEvidence(input: RecommendationSelection) {
  const selection = selectionSchema.parse(input);
  const filters: Filters = {
    site: selection.filters.site ?? "Combined",
    period: selection.filters.period ?? "complete-week",
    ...(selection.filters.start ? { start: selection.filters.start } : {}),
    ...(selection.filters.end ? { end: selection.filters.end } : {}),
  };
  if (filters.period === "custom" && (!filters.start || !filters.end))
    throw new Error("Custom reporting requires both dates.");
  for (const date of [filters.start, filters.end])
    if (
      date &&
      (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    )
      throw new Error("Choose valid calendar dates.");
  if (reportingWindow(filters).days > 366)
    throw new Error("Choose a reporting window of at most one year.");
  const analytics = sampleAnalytics(filters);
  const selectedExperiments = experiments.filter((e) => selection.experimentIds.includes(e.id));
  if (selectedExperiments.length !== new Set(selection.experimentIds).size)
    throw new Error("An experiment is unavailable. Refresh the selection.");
  if (
    selectedExperiments.some(
      (e) =>
        selection.filters.site &&
        selection.filters.site !== "Combined" &&
        e.site !== selection.filters.site,
    )
  )
    throw new Error("Selected experiments must belong to the selected site.");
  const metrics: MetricEvidence[] = metricOptions
    .filter((m) => selection.metrics.includes(m.id))
    .map((m) => {
      const current = analytics.current[m.id],
        previous = analytics.previous[m.id];
      return {
        id: `metric:${m.id}`,
        label: m.label,
        source: "GA4 sample",
        current,
        previous,
        absoluteChange: current - previous,
        relativeChange: previous ? (current / previous - 1) * 100 : null,
        definition: m.definition,
        unit: m.unit,
        numerator:
          m.id === "conversion"
            ? analytics.current.enquiries
            : m.id === "contactConversion"
              ? analytics.current.contactEnquiries
              : null,
        denominator:
          m.id === "conversion"
            ? analytics.current.sessions
            : m.id === "contactConversion"
              ? analytics.current.contactSessions
              : null,
      };
    });
  return {
    dataMode: "sample" as const,
    filters,
    site: selection.filters.site ?? "Combined",
    reportingWindow: analytics.window.label,
    comparisonWindow: `${analytics.window.comparisonStart.toISOString().slice(0, 10)} – ${analytics.window.comparisonEnd.toISOString().slice(0, 10)}`,
    provisional: analytics.window.provisional,
    freshness: "Synthetic snapshot; no live source sync",
    metrics,
    experiments: selectedExperiments.map((e) => ({
      id: `experiment:${e.id}`,
      source: "Optimizely sample",
      title: e.title,
      site: e.site,
      page: e.page,
      status: e.status,
      type: e.type,
      start: e.start,
      end: e.end,
      visitors: e.visitors,
      baselineRate: 1.62,
      relativeUplift: e.uplift,
      reportedSignificance: e.significant,
      outcome: e.outcome,
      implemented: e.implemented,
    })),
  };
}
export type RecommendationEvidence = ReturnType<typeof buildEvidence>;
export function validateRecommendationReport(
  input: unknown,
  evidence: RecommendationEvidence,
): RecommendationReport {
  const report = recommendationSchema.parse(input);
  const allowed = new Set([...evidence.metrics, ...evidence.experiments].map((e) => e.id));
  if (!report.recommendations.length || report.recommendations.length > 5)
    throw new Error("The model did not return one to five recommendations.");
  for (const item of report.recommendations) {
    if (!item.evidenceIds.length || item.evidenceIds.some((id) => !allowed.has(id)))
      throw new Error(
        "The model cited evidence outside your selection. No recommendations were accepted.",
      );
  }
  const priority = { High: 0, Medium: 1, Low: 2 };
  return {
    ...report,
    recommendations: [...report.recommendations].sort(
      (a, b) => priority[a.priority] - priority[b.priority],
    ),
  };
}
export type RecommendationEvent =
  | { type: "reasoning"; text: string }
  | { type: "progress"; characters: number }
  | {
      type: "complete";
      report: RecommendationReport;
      evidence: RecommendationEvidence;
      generatedAt: string;
      model: string;
    }
  | { type: "error"; status: number; message: string };

export async function readRecommendationStream(
  response: Response,
  onEvent: (event: RecommendationEvent) => void,
) {
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("No recommendation stream was returned.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    completed = false;
  const parseLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as RecommendationEvent;
    onEvent(event);
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "complete") completed = true;
  };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      pending += decoder.decode(chunk.value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) parseLine(line);
    }
    pending += decoder.decode();
    parseLine(pending);
    if (!completed) throw new Error("The response ended before recommendations were ready.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
