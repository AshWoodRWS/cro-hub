import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/recommendations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleRecommendations } = await import("@/lib/ai/recommendation-handler.server");
        return handleRecommendations(request);
      },
    },
  },
});
