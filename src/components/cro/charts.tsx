import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info } from "lucide-react";
import { useFilters } from "./shell";
import { number, percent, sampleAnalytics } from "@/lib/cro-data";
export function PerformanceChart() {
  const filters = useFilters(),
    data = sampleAnalytics(filters);
  const [selection, setMetric] = useState<string | null>(null);
  const metric =
    selection ??
    (["sessions", "enquiries", "contact"].includes(filters.metric ?? "")
      ? (filters.metric ?? "conversion")
      : "conversion");
  const isRate = metric === "conversion" || metric === "contact";
  return (
    <section className="report-section performance-section">
      <div className="section-heading">
        <div>
          <h2>
            Performance over time <Info size={14} className="text-muted-foreground" />
          </h2>
          <p>
            {metric === "contact"
              ? "Contact page conversion rate"
              : metric === "conversion"
                ? "Sitewide conversion rate"
                : metric === "sessions"
                  ? "Website sessions"
                  : "Enquiry form fills"}{" "}
            · {data.window.label}
          </p>
        </div>
        <select
          className="report-select"
          aria-label="Chart metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          <option value="conversion">Conversion rate</option>
          <option value="sessions">Sessions</option>
          <option value="enquiries">Enquiry form fills</option>
          <option value="contact">Contact conversion</option>
        </select>
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-current" />
          Selected period
        </span>
        {isRate && (
          <span>
            <i className="legend-previous" />
            Previous period
          </span>
        )}
      </div>
      <div className="main-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.trend} margin={{ top: 15, right: 8, bottom: 5, left: -16 }}>
            <defs>
              <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.14} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              dy={10}
              minTickGap={25}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v) => (isRate ? `${v.toFixed(1)}%` : number(v))}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(value: number) => (isRate ? percent(value) : number(value))}
            />
            {isRate && (
              <Line
                type="monotone"
                dataKey={metric === "contact" ? "previousContact" : "previous"}
                name="Previous period"
                stroke="var(--chart-comparison)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Area
              type="monotone"
              dataKey={metric}
              name="Selected period"
              fill="url(#chart-fill)"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-footnote">
        <span>
          Source: GA4 sample <span>·</span>{" "}
          {metric === "contact"
            ? "Contact enquiries / contact sessions"
            : isRate
              ? "Enquiry events / sessions"
              : "Count in selected reporting window"}
        </span>
        <span>Not yet reconciled with Looker</span>
      </div>
    </section>
  );
}
export function Sparkline({ index = 0 }: { index?: number }) {
  const points = Array.from(
    { length: 16 },
    (_, i) => `${i * 8},${26 - (i * 0.9 + Math.sin(i * 1.4 + index) * 5)}`,
  ).join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 120 34" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
