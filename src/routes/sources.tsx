import { createFileRoute } from "@tanstack/react-router";
import { Sources } from "@/components/cro/views";
import { metadata } from "@/lib/cro-data";
export const Route = createFileRoute("/sources")({
  head: () => metadata("Data Sources", "Data Sources for the RWS and Trados CRO programme."),
  component: Sources,
});
