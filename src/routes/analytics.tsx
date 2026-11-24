import { createFileRoute } from "@tanstack/react-router";
import { Analytics } from "@/components/cro/views";
import { metadata } from "@/lib/cro-data";
export const Route = createFileRoute("/analytics")({
  head: () => metadata("Analytics", "Analytics for the RWS and Trados CRO programme."),
  component: Analytics,
});
