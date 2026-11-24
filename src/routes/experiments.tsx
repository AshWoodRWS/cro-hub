import { createFileRoute } from "@tanstack/react-router";
import { Experiments } from "@/components/cro/views";
import { metadata } from "@/lib/cro-data";
export const Route = createFileRoute("/experiments")({
  head: () => metadata("Experiments", "Experiments for the RWS and Trados CRO programme."),
  component: Experiments,
});
