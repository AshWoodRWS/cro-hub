import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
export type Site = "Combined" | "RWS" | "Trados";
export interface Filters {
  site?: Site;
  period?: string;
  start?: string;
  end?: string;
  metric?: string;
}
export const REFERENCE_DATE = new Date("2026-11-23T12:00:00Z");
export const presets = [
  ["complete-week", "Latest complete week"],
  ["this-week", "This week"],
  ["last-week", "Last week"],
  ["mtd", "Month to date"],
  ["previous-month", "Previous month"],
  ["fytd", "Fiscal year to date"],
  ["custom", "Custom dates"],
] as const;
export function fiscalYear(date: Date) {
  return date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
}
export function reportingWindow(filters: Filters, now = REFERENCE_DATE) {
  const week = startOfWeek(now, { weekStartsOn: 1 });
  let start = subDays(week, 14),
    end = subDays(week, 8);
  switch (filters.period) {
    case "this-week":
      start = week;
      end = subDays(now, 1);
      if (end < start) end = start;
      break;
    case "last-week":
      start = subDays(week, 7);
      end = subDays(week, 1);
      break;
    case "mtd":
      start = startOfMonth(now);
      end = subDays(now, 1);
      break;
    case "previous-month":
      start = startOfMonth(subMonths(now, 1));
      end = endOfMonth(start);
      break;
    case "fytd":
      start = new Date(fiscalYear(now) - 1, 9, 1);
      end = subDays(now, 1);
      break;
    case "custom":
      if (filters.start && filters.end) {
        start = new Date(filters.start + "T12:00:00");
        end = new Date(filters.end + "T12:00:00");
      }
      break;
  }
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start)
    throw new Error("Choose a valid date range with the end on or after the start.");
  const days = differenceInCalendarDays(end, start) + 1;
  return {
    start,
    end,
    days,
    comparisonStart: subDays(start, days),
    comparisonEnd: subDays(start, 1),
    provisional: end > subDays(now, 3),
    label: `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`,
  };
}
export function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}
export function combineRates(
  rows: { numerator: number; denominator: number; definition: string }[],
) {
  if (!rows.length || new Set(rows.map((r) => r.definition)).size !== 1) return null;
  return rate(
    rows.reduce((s, r) => s + r.numerator, 0),
    rows.reduce((s, r) => s + r.denominator, 0),
  );
}
export const fy27Targets = {
  launches: { Combined: 300, RWS: 180, Trados: 120 },
  completed: { Combined: 250 },
  positive: { Combined: 80, RWS: 50, Trados: 30 },
  significant: { Combined: 60 },
  personalisation: { Combined: 12 },
  conversion: { Combined: 1.67, RWS: 1.67, Trados: 1.67 },
};
export type TargetMetric = keyof typeof fy27Targets | "implementations";
export function defaultTarget(year: number, site: Site, metric: TargetMetric): number | null {
  if (year !== 2027 || metric === "implementations") return null;
  const values: Partial<Record<Site, number>> = fy27Targets[metric];
  return values[site] ?? null;
}
export function sampleAnalytics(filters: Filters) {
  const window = reportingWindow(filters);
  const sites = filters.site && filters.site !== "Combined" ? [filters.site] : ["RWS", "Trados"];
  function aggregate(start: Date, days: number) {
    let sessions = 0,
      enquiries = 0,
      contactSessions = 0,
      contactEnquiries = 0;
    for (let i = 0; i < days; i++)
      for (const site of sites) {
        const day = addDays(start, i);
        const x = Math.floor(day.getTime() / 86400000);
        const weekday = day.getDay();
        const base = site === "RWS" ? 10350 : 6940;
        const factor = weekday === 0 || weekday === 6 ? 0.62 : 1.12;
        const count = Math.round(base * factor * (1 + Math.sin(x * 0.8) * 0.13));
        const conversion = Math.max(
          0.001,
          (site === "RWS" ? 0.0164 : 0.0189) + (x - 20700) * 0.000012 + Math.sin(x * 0.65) * 0.0018,
        );
        sessions += count;
        enquiries += Math.round(count * conversion);
        contactSessions += Math.round(count * 0.046);
        contactEnquiries += Math.round(count * 0.046 * 0.162);
      }
    return {
      sessions,
      enquiries,
      contactSessions,
      contactEnquiries,
      conversion: rate(enquiries, sessions) ?? 0,
      contactConversion: rate(contactEnquiries, contactSessions) ?? 0,
      bounce: 42.6,
    };
  }
  const current = aggregate(window.start, window.days),
    previous = aggregate(window.comparisonStart, window.days);
  const trend = Array.from({ length: Math.min(window.days, 31) }, (_, i) => {
    const day = addDays(window.start, Math.floor((i * window.days) / Math.min(window.days, 31)));
    const p = aggregate(day, 1);
    const prev = aggregate(subDays(day, window.days), 1);
    return {
      date: format(day, "d MMM"),
      sessions: p.sessions,
      enquiries: p.enquiries,
      conversion: p.conversion,
      contact: p.contactConversion,
      previous: prev.conversion,
      previousContact: prev.contactConversion,
    };
  });
  return { current, previous, trend, window };
}
export interface Experiment {
  id: string;
  site: "RWS" | "Trados";
  title: string;
  page: string;
  status: "Running" | "Paused" | "Completed";
  type: string;
  start: string;
  end: string | null;
  visitors: number;
  uplift: number;
  significant: number | null;
  outcome: string;
  implemented: boolean;
  notes: string;
}
export const experiments: Experiment[] = [
  {
    id: "214801",
    site: "RWS",
    title: "Contact form: a simpler first step",
    page: "/contact",
    status: "Running",
    type: "A/B test",
    start: "2026-11-02",
    end: null,
    visitors: 18420,
    uplift: 12.4,
    significant: 87.2,
    outcome: "Pending",
    implemented: false,
    notes: "Testing a shorter form against the current contact experience.",
  },
  {
    id: "214802",
    site: "Trados",
    title: "Free trial CTA: make the value clear",
    page: "/products/trados-studio",
    status: "Running",
    type: "A/B test",
    start: "2026-11-04",
    end: null,
    visitors: 14208,
    uplift: 8.7,
    significant: 76.4,
    outcome: "Pending",
    implemented: false,
    notes: "Compare “Start your free trial” with the existing CTA.",
  },
  {
    id: "214803",
    site: "RWS",
    title: "Paid landing page: proof above the fold",
    page: "/language-services",
    status: "Running",
    type: "A/B test",
    start: "2026-11-09",
    end: null,
    visitors: 8640,
    uplift: 6.2,
    significant: 64.1,
    outcome: "Pending",
    implemented: false,
    notes: "Customer evidence placed alongside the enquiry call to action.",
  },
  {
    id: "214804",
    site: "Trados",
    title: "Pricing page: annual plan emphasis",
    page: "/pricing",
    status: "Running",
    type: "A/B test",
    start: "2026-11-11",
    end: null,
    visitors: 6204,
    uplift: -2.1,
    significant: 32.5,
    outcome: "Pending",
    implemented: false,
    notes: "Early trend only; no business outcome has been declared.",
  },
  {
    id: "214805",
    site: "RWS",
    title: "Industry-specific contact experience",
    page: "/industries/life-sciences",
    status: "Running",
    type: "Personalisation",
    start: "2026-11-12",
    end: null,
    visitors: 3182,
    uplift: 14.8,
    significant: null,
    outcome: "Pending",
    implemented: false,
    notes: "Sample personalisation. Live API availability has not been verified.",
  },
  {
    id: "214806",
    site: "RWS",
    title: "Navigation: services discovery",
    page: "Sitewide",
    status: "Paused",
    type: "A/B test",
    start: "2026-10-20",
    end: null,
    visitors: 24680,
    uplift: 1.2,
    significant: 24.8,
    outcome: "Pending",
    implemented: false,
    notes: "Paused for navigation release coordination.",
  },
  {
    id: "214701",
    site: "RWS",
    title: "Contact page: shorter enquiry form",
    page: "/contact",
    status: "Completed",
    type: "A/B test",
    start: "2026-10-05",
    end: "2026-10-28",
    visitors: 32840,
    uplift: 18.6,
    significant: 98.1,
    outcome: "Positive",
    implemented: true,
    notes: "Tracker decision: roll out the shorter form.",
  },
  {
    id: "214702",
    site: "Trados",
    title: "Studio product page: social proof",
    page: "/products/trados-studio",
    status: "Completed",
    type: "A/B test",
    start: "2026-10-08",
    end: "2026-11-01",
    visitors: 28204,
    uplift: 11.2,
    significant: 96.4,
    outcome: "Positive",
    implemented: false,
    notes: "Awaiting implementation in the next product release.",
  },
  {
    id: "214703",
    site: "Trados",
    title: "Pricing comparison: expanded detail",
    page: "/pricing",
    status: "Completed",
    type: "A/B test",
    start: "2026-10-12",
    end: "2026-11-06",
    visitors: 18944,
    uplift: -3.4,
    significant: 43.2,
    outcome: "Inconclusive",
    implemented: false,
    notes: "Keep the existing comparison layout.",
  },
];
export const number = (value: number) => new Intl.NumberFormat("en-GB").format(value);
export const percent = (value: number | null) => (value === null ? "—" : `${value.toFixed(2)}%`);
export const metadata = (title: string, description: string) => ({
  meta: [
    { title: `${title} | CRO Hub` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} | CRO Hub` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
});
