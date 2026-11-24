import Papa from "papaparse";
import { fiscalYear } from "./cro-data";
export interface TrackerRow {
  sourceId: string;
  site: "RWS" | "Trados";
  projectId: string;
  optimizelyId: string;
  title: string;
  launched: string;
  completed: string;
  outcome: string;
  implemented: boolean;
  significant: boolean;
  type: string;
  notes: string;
}
export const trackerFields = [
  "site",
  "projectId",
  "optimizelyId",
  "title",
  "launched",
  "completed",
  "outcome",
  "implemented",
  "significant",
  "type",
  "notes",
] as const;
export type Mapping = Record<(typeof trackerFields)[number], string>;
export function parseCSV(text: string) {
  return Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
}
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validateTracker(rows: Record<string, string>[], mapping: Mapping) {
  const valid: TrackerRow[] = [],
    errors: { row: number; message: string }[] = [],
    seen = new Set<string>();
  rows.forEach((row, i) => {
    const value = (key: keyof Mapping) => (row[mapping[key]] ?? "").trim();
    const site = value("site");
    const launched = value("launched"),
      completed = value("completed");
    if (site !== "RWS" && site !== "Trados") {
      errors.push({ row: i + 2, message: "Site must be RWS or Trados." });
      return;
    }
    if (
      !value("title") ||
      !validDate(launched) ||
      (completed && !validDate(completed)) ||
      (completed && completed < launched)
    ) {
      errors.push({
        row: i + 2,
        message: "Title and valid ISO dates required; completion cannot precede launch.",
      });
      return;
    }
    if (!["Positive", "Negative", "Inconclusive", "Pending"].includes(value("outcome"))) {
      errors.push({
        row: i + 2,
        message: "Outcome must be Positive, Negative, Inconclusive or Pending.",
      });
      return;
    }
    for (const key of ["implemented", "significant"] as const)
      if (
        value(key) &&
        !["true", "false", "yes", "no", "1", "0"].includes(value(key).toLowerCase())
      ) {
        errors.push({ row: i + 2, message: `Invalid ${key} value.` });
        return;
      }
    const id = value("optimizelyId"),
      projectId = value("projectId");
    const sourceId = id
      ? `${site}:${projectId}:${id}`
      : `tracker:${site}:${value("title").toLowerCase()}:${launched}`;
    if (seen.has(sourceId)) {
      errors.push({ row: i + 2, message: "Ambiguous duplicate identity; review before import." });
      return;
    }
    seen.add(sourceId);
    valid.push({
      sourceId,
      site,
      projectId,
      optimizelyId: id,
      title: value("title"),
      launched,
      completed,
      outcome: value("outcome"),
      implemented: ["true", "yes", "1"].includes(value("implemented").toLowerCase()),
      significant: ["true", "yes", "1"].includes(value("significant").toLowerCase()),
      type: value("type") || "A/B test",
      notes: value("notes"),
    });
  });
  return { valid, errors };
}
export function mergeTracker(existing: TrackerRow[], incoming: TrackerRow[]) {
  const map = new Map(existing.map((r) => [r.sourceId, r]));
  incoming.forEach((r) => map.set(r.sourceId, r));
  return [...map.values()];
}
export function trackerFY(row: TrackerRow) {
  return fiscalYear(new Date(row.launched + "T12:00:00"));
}
