import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  gateway: vi.fn(),
  state: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@/lib/auth.server", () => ({ getSessionUser: mocks.identity }));
vi.mock("@/lib/ai/responses.server", () => ({ createResponsesCall: mocks.gateway }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.state }) }),
      upsert: mocks.upsert,
    }),
  },
}));
import { handleRecommendations } from "@/lib/ai/recommendation-handler.server";
import { readRecommendationStream } from "@/lib/recommendations";
const request = () =>
  new Request("http://localhost:8080/api/recommendations", {
    method: "POST",
    headers: { origin: "http://localhost:8080", "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { site: "RWS" }, metrics: ["sessions"], experimentIds: [] }),
  });
const report = {
  summary: "Sample review",
  recommendations: [
    {
      title: "Measure",
      priority: "High",
      action: "Validate sessions",
      rationale: "Sample data only",
      evidenceIds: ["metric:sessions"],
      expectedImpact: "Improve evidence",
      effort: "Low",
      confidence: "Low",
      validation: "Reconcile reports",
    },
  ],
  limitations: ["Sample only"],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("LOVABLE_API_KEY", "test-key");
  mocks.identity.mockResolvedValue({ userId: "test-identity" });
  mocks.state.mockResolvedValue({ data: null, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
});
describe("Recommendation route boundary", () => {
  it("rejects anonymous calls before AI or database access", async () => {
    mocks.identity.mockResolvedValue(null);
    expect((await handleRecommendations(request())).status).toBe(401);
    expect(mocks.gateway).not.toHaveBeenCalled();
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests", async () => {
    const r = request();
    r.headers.set("origin", "https://other.example");
    expect((await handleRecommendations(r)).status).toBe(403);
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it("rejects forged values before generation", async () => {
    const r = new Request(request(), {
      body: JSON.stringify({
        filters: {},
        metrics: ["sessions"],
        experimentIds: [],
        fakeResults: 999,
      }),
    });
    expect((await handleRecommendations(r)).status).toBe(400);
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it("honors persisted denial without another provider call", async () => {
    mocks.state.mockResolvedValue({
      data: { status: 403, message: "Provider denied access" },
      error: null,
    });
    expect((await handleRecommendations(request())).status).toBe(403);
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it("preserves upstream 403 before sending success headers and persists it", async () => {
    const error = new APICallError({
      message: "Denied",
      url: "https://ai.gateway.lovable.dev/v1/responses",
      requestBodyValues: {},
      statusCode: 403,
      responseBody: '{"message":"Provider denied access","type":"permission_error"}',
    });
    mocks.gateway.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield { type: "start" };
          yield { type: "error", error };
        })(),
      },
      runIdFetch: {},
    });
    expect((await handleRecommendations(request())).status).toBe(403);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, error_type: "permission_error" }),
    );
    expect(mocks.gateway).toHaveBeenCalledTimes(1);
  });
  it("streams separated reasoning and progress then accepts cited output", async () => {
    mocks.gateway.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield { type: "start" };
          yield { type: "start-step" };
          yield { type: "reasoning-delta", text: "Comparing evidence" };
          yield { type: "text-delta", text: '{"summary":' };
          yield { type: "finish", finishReason: "stop" };
        })(),
        output: Promise.resolve(report),
      },
      runIdFetch: { getRunId: () => undefined, waitForRunId: async () => undefined },
    });
    const response = await handleRecommendations(request());
    const events: string[] = [];
    await readRecommendationStream(response, (event) => events.push(event.type));
    expect(events).toEqual(["reasoning", "progress", "complete"]);
    expect(mocks.gateway).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ model: "openai/gpt-6-astra" }),
      expect.any(Array),
      expect.any(String),
    );
  });
  it("stops refused output without a replay", async () => {
    mocks.gateway.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield { type: "text-delta", text: "" };
          yield { type: "finish", finishReason: "content-filter" };
        })(),
        output: Promise.resolve(report),
      },
      runIdFetch: { getRunId: () => undefined, waitForRunId: async () => undefined },
    });
    const response = await handleRecommendations(request());
    await expect(readRecommendationStream(response, () => {})).rejects.toThrow("declined");
    expect(mocks.gateway).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
