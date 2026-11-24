import { createFileRoute } from "@tanstack/react-router";
import { Recommendations } from "@/components/cro/recommendations";
import { metadata } from "@/lib/cro-data";
export const Route = createFileRoute("/recommendations")({
  head: () =>
    metadata(
      "Recommendations",
      "Prioritized CRO actions grounded in selected dashboard metrics and experiment results.",
    ),
  component: Recommendations,
});
