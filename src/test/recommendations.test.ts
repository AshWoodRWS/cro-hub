import { describe, it, expect } from "vitest";
import { APICallError } from "ai";
import {
  buildEvidence,
  selectionSchema,
  validateRecommendationReport,
  readRecommendationStream,
  type RecommendationSelection,
} from "@/lib/recommendations";
import { gatewayFailure } from "@/lib/ai/gateway-error.server";
const selection: RecommendationSelection = {
  filters: { site: "RWS", period: "complete-week" },
  metrics: ["conversion"],
  experimentIds: ["214801"],
};
const recommendation = {
  title: "Continue measurement",
  priority: "High" as const,
  action: "Collect more sample results.",
  rationale: "Running test is not final.",
  evidenceIds: ["experiment:214801"],
  expectedImpact: "Better decision quality.",
  effort: "Low" as const,
  confidence: "Low" as const,
  validation: "Check native results.",
};
const report = {
  summary: "Sample review",
  recommendations: [recommendation],
  limitations: ["Sample only"],
};
describe("CRO recommendation grounding", () => {
  it("sends only selected metrics and experiments", () => {
    const evidence = buildEvidence(selection);
    expect(evidence.metrics.map((m) => m.id)).toEqual(["metric:conversion"]);
    expect(evidence.experiments.map((e) => e.id)).toEqual(["experiment:214801"]);
  });
  it("rejects client-supplied reporting values", () =>
    expect(
      selectionSchema.safeParse({ ...selection, metricsData: { sessions: 9999 } }).success,
    ).toBe(false));
  it("requires evidence selection", () =>
    expect(
      selectionSchema.safeParse({ ...selection, metrics: [], experimentIds: [] }).success,
    ).toBe(false));
  it("preserves numerator and denominator for conversion", () => {
    const m = buildEvidence(selection).metrics[0];
    expect(m?.numerator).toBeGreaterThan(0);
    expect(m?.denominator).toBeGreaterThan(0);
    if (!m || m.denominator === null || m.numerator === null) throw new Error("Missing counts");
    expect(m.current).toBeCloseTo((m.numerator / m.denominator) * 100);
  });
  it("labels sources as sample rather than live", () => {
    const e = buildEvidence(selection);
    expect(e.dataMode).toBe("sample");
    expect(e.experiments[0]?.source).toBe("Optimizely sample");
  });
  it("rejects experiment selections from another site", () =>
    expect(() => buildEvidence({ ...selection, experimentIds: ["214802"] })).toThrow(
      "selected site",
    ));
  it("rejects nonexistent experiments", () =>
    expect(() => buildEvidence({ ...selection, experimentIds: ["not-real"] })).toThrow(
      "unavailable",
    ));
  it("rejects invalid custom dates", () =>
    expect(() =>
      buildEvidence({
        ...selection,
        filters: { period: "custom", start: "2026-02-30", end: "2026-03-10" },
      }),
    ).toThrow("calendar dates"));
  it("rejects empty custom dates", () =>
    expect(() => buildEvidence({ ...selection, filters: { period: "custom" } })).toThrow(
      "both dates",
    ));
  it("rejects citations outside selected evidence", () =>
    expect(() =>
      validateRecommendationReport(
        { ...report, recommendations: [{ ...recommendation, evidenceIds: ["experiment:214802"] }] },
        buildEvidence(selection),
      ),
    ).toThrow("outside your selection"));
  it("sorts recommendations by priority", () =>
    expect(
      validateRecommendationReport(
        { ...report, recommendations: [{ ...recommendation, priority: "Low" }, recommendation] },
        buildEvidence(selection),
      ).recommendations[0]?.priority,
    ).toBe("High"));
  it("passes valid citation-grounded recommendations", () =>
    expect(validateRecommendationReport(report, buildEvidence(selection))).toEqual(report));
  it("keeps running status and sample significance unmodified", () => {
    const e = buildEvidence(selection).experiments[0];
    expect(e?.status).toBe("Running");
    expect(e?.reportedSignificance).toBe(87.2);
    expect(e?.outcome).toBe("Pending");
  });
});
describe("Recommendation streaming and errors", () => {
  it("reads split frames and metadata before final output", async () => {
    const encoder = new TextEncoder();
    const final = {
      type: "complete",
      report,
      evidence: buildEvidence(selection),
      generatedAt: "2026-11-23",
      model: "openai/gpt-6-astra",
    };
    const line = JSON.stringify(final);
    const response = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode('{"type":"reasoning","text":"Checking evidence"}\n'));
          c.enqueue(encoder.encode('{"type":"progress","characters":10}\n' + line.slice(0, 40)));
          c.enqueue(encoder.encode(line.slice(40) + "\n"));
          c.close();
        },
      }),
    );
    const events: string[] = [];
    await readRecommendationStream(response, (e) => events.push(e.type));
    expect(events).toEqual(["reasoning", "progress", "complete"]);
  });
  it("rejects interrupted streams rather than accepting partial output", async () => {
    await expect(
      readRecommendationStream(new Response('{"type":"progress","characters":10}\n'), () => {}),
    ).rejects.toThrow("ended before");
  });
  it("surfaces safe denial reason without retrying", async () => {
    await expect(
      readRecommendationStream(
        Response.json({ message: "AI is disabled by your workspace admin" }, { status: 403 }),
        () => {},
      ),
    ).rejects.toThrow("disabled");
  });
  it("preserves 403 provider denial for persistent blocking", () => {
    const e = new APICallError({
      message: "Denied",
      url: "https://ai.gateway.lovable.dev/v1/responses",
      requestBodyValues: {},
      statusCode: 403,
      responseBody: JSON.stringify({ message: "Provider denied access", type: "permission_error" }),
    });
    expect(gatewayFailure(e)).toEqual({
      status: 403,
      message: "Provider denied access",
      type: "permission_error",
      pause: true,
    });
  });
  it("does not pause transient rate limiting", () => {
    const e = new APICallError({
      message: "Rate limited",
      url: "https://ai.gateway.lovable.dev/v1/responses",
      requestBodyValues: {},
      statusCode: 429,
    });
    expect(gatewayFailure(e).pause).toBe(false);
  });
});
