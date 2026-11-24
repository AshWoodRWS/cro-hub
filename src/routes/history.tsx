import { createFileRoute } from "@tanstack/react-router";
import { History } from "@/components/cro/views";
import { metadata } from "@/lib/cro-data";
export const Route = createFileRoute("/history")({
  head: () => metadata("History & KPIs", "History & KPIs for the RWS and Trados CRO programme."),
  component: History,
});
