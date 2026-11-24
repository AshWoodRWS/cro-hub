import { describe, it, expect } from "vitest";
import {
  combineRates,
  fiscalYear,
  fy27Targets,
  reportingWindow,
  rate,
  defaultTarget,
  sampleAnalytics,
} from "@/lib/cro-data";
import { mergeTracker, validateTracker, trackerFields, type Mapping } from "@/lib/tracker";
const mapping = Object.fromEntries(trackerFields.map((f) => [f, f])) as Mapping;
const row = {
  site: "RWS",
  projectId: "p1",
  optimizelyId: "42",
  title: "Contact form",
  launched: "2026-10-01",
  completed: "2026-11-01",
  outcome: "Positive",
  implemented: "true",
  significant: "true",
  type: "A/B test",
  notes: "Roll out",
};
describe("CRO reporting rules", () => {
  it("does not reuse FY27 targets in FY26", () =>
    expect(defaultTarget(2026, "Combined", "launches")).toBeNull());
  it("leaves unspecified site-level targets unconfigured", () =>
    expect(defaultTarget(2027, "RWS", "completed")).toBeNull());
  it("preserves compatible combined enquiry and session counts", () => {
    const combined = sampleAnalytics({ site: "Combined" }).current;
    const rws = sampleAnalytics({ site: "RWS" }).current;
    const trados = sampleAnalytics({ site: "Trados" }).current;
    expect(combined.sessions).toBe(rws.sessions + trados.sessions);
    expect(combined.enquiries).toBe(rws.enquiries + trados.enquiries);
    expect(combined.conversion).toBeCloseTo(
      ((rws.enquiries + trados.enquiries) / (rws.sessions + trados.sessions)) * 100,
    );
  });
  it("starts the fiscal year on 1 October and ends 30 September", () => {
    expect(fiscalYear(new Date("2026-09-30"))).toBe(2026);
    expect(fiscalYear(new Date("2026-10-01"))).toBe(2027);
  });
  it("seeds FY27 launches as 300 combined, 180 RWS and 120 Trados", () =>
    expect(fy27Targets.launches).toEqual({ Combined: 300, RWS: 180, Trados: 120 }));
  it("sets FY27 completed target to 250", () => expect(fy27Targets.completed.Combined).toBe(250));
  it("sets positive targets to 80 combined, 50 RWS and 30 Trados", () =>
    expect(fy27Targets.positive).toEqual({ Combined: 80, RWS: 50, Trados: 30 }));
  it("sets significant target to 60", () => expect(fy27Targets.significant.Combined).toBe(60));
  it("sets personalisation target to 12", () =>
    expect(fy27Targets.personalisation.Combined).toBe(12));
  it("sets sitewide conversion target to 1.67%", () =>
    expect(fy27Targets.conversion.Combined).toBe(1.67));
  it("combines compatible counts rather than averaging rates", () =>
    expect(
      combineRates([
        { numerator: 10, denominator: 100, definition: "enquiry/sessions" },
        { numerator: 20, denominator: 1000, definition: "enquiry/sessions" },
      ]),
    ).toBeCloseTo((30 / 1100) * 100));
  it("does not combine incompatible definitions", () =>
    expect(
      combineRates([
        { numerator: 10, denominator: 100, definition: "users" },
        { numerator: 20, denominator: 1000, definition: "sessions" },
      ]),
    ).toBeNull());
  it("does not invent a rate when denominator is zero", () => expect(rate(5, 0)).toBeNull());
  it("matches comparison window duration", () => {
    const p = reportingWindow({ period: "last-week" });
    expect(p.days).toBe(7);
    expect(p.comparisonStart.toISOString().slice(0, 10)).toBe("2026-11-09");
  });
  it("reimport keeps totals and decisions intact", () => {
    const parsed = validateTracker([row], mapping).valid;
    expect(mergeTracker(parsed, parsed)).toEqual(parsed);
    expect(mergeTracker(parsed, parsed)).toHaveLength(1);
  });
  it("flags ambiguous duplicate IDs", () =>
    expect(validateTracker([row, row], mapping).errors).toHaveLength(1));
  it("rejects invalid calendar dates", () =>
    expect(validateTracker([{ ...row, launched: "2026-02-30" }], mapping).errors).toHaveLength(1));
  it("keeps tracker-only records visible", () =>
    expect(validateTracker([{ ...row, optimizelyId: "" }], mapping).valid[0]?.sourceId).toContain(
      "tracker:RWS",
    ));
});
