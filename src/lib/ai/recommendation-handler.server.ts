import { getSessionUser } from "../auth.server";
import {
  buildEvidence,
  selectionSchema,
  validateRecommendationReport,
  type RecommendationEvent,
} from "../recommendations";
import { createResponsesCall } from "./responses.server";
import { recommendationInstructions, recommendationMessages } from "./recommendation-prompt.server";
import { gatewayFailure } from "./gateway-error.server";
import { withLovableAiGatewayRunIdHeader } from "./run-id.server.ts";

export async function handleRecommendations(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user)
    return Response.json(
      { message: "Sign in to Lovable and reopen this preview to generate recommendations." },
      { status: 401 },
    );
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    return Response.json(
      { message: "Recommendations must be requested from CRO Hub." },
      { status: 403 },
    );
  let evidence;
  try {
    evidence = buildEvidence(selectionSchema.parse(await request.json()));
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Invalid selection." },
      { status: 400 },
    );
  }
  // Only server-reconstructed synthetic evidence is available here. This never grants
  // access to private reporting tables or auto-approves the current identity.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const scope = "cro-recommendations:openai/gpt-6-astra";
  const state = await supabaseAdmin
    .from("ai_access_state")
    .select("status,message")
    .eq("scope", scope)
    .maybeSingle();
  if (state.error)
    return Response.json(
      { message: "AI access status could not be checked. Please try again later." },
      { status: 503 },
    );
  if (state.data)
    return Response.json({ message: state.data.message }, { status: state.data.status });
  const key = process.env["LOVABLE_API_KEY"];
  if (!key)
    return Response.json(
      { message: "Lovable AI is not configured for this app." },
      { status: 401 },
    );
  const cancellation = new AbortController();
  const abortRequest = () => cancellation.abort();
  if (request.signal.aborted) cancellation.abort();
  request.signal.addEventListener("abort", abortRequest, { once: true });
  const { result, runIdFetch } = createResponsesCall(
    request,
    {
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      model: "openai/gpt-6-astra",
      abortSignal: cancellation.signal,
    },
    recommendationMessages(evidence),
    recommendationInstructions,
  );
  const iterator = result.fullStream[Symbol.asyncIterator]();
  const fail = async (error: unknown) => {
    const failure = gatewayFailure(error);
    if (failure.pause) {
      const { error: saveError } = await supabaseAdmin.from("ai_access_state").upsert({
        scope,
        status: failure.status,
        message: failure.message,
        error_type: failure.type,
      });
      if (saveError) console.error("Could not persist AI denial:", saveError.message);
    }
    console.error("Recommendation request failed", failure.status, failure.type, failure.message);
    return failure;
  };
  // Start consuming, and inspect upstream failures before sending successful headers.
  let first;
  try {
    first = await iterator.next();
    while (!first.done && (first.value.type === "start" || first.value.type === "start-step"))
      first = await iterator.next();
  } catch (error) {
    const failure = await fail(error);
    return Response.json({ message: failure.message }, { status: failure.status });
  }
  if (!first.done && first.value.type === "error") {
    const failure = await fail(first.value.error);
    return Response.json({ message: failure.message }, { status: failure.status });
  }
  const encoder = new TextEncoder();
  let cancelled = false;
  let characters = 0;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RecommendationEvent) => {
        if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        let chunk = first;
        while (!chunk.done && !cancelled) {
          const part = chunk.value;
          if (part.type === "error") throw part.error;
          if (part.type === "reasoning-delta") send({ type: "reasoning", text: part.text });
          if (part.type === "text-delta") {
            characters += part.text.length;
            send({ type: "progress", characters });
          }
          if (
            (part.type === "finish" || part.type === "finish-step") &&
            part.finishReason === "content-filter"
          )
            throw new Error("The model declined this request. No recommendations were generated.");
          chunk = await iterator.next();
        }
        const report = validateRecommendationReport(await result.output, evidence);
        send({
          type: "complete",
          report,
          evidence,
          generatedAt: new Date().toISOString(),
          model: "openai/gpt-6-astra",
        });
      } catch (error) {
        const failure = await fail(
          cancellation.signal.aborted
            ? new DOMException("Generation stopped.", "AbortError")
            : error,
        );
        send({ type: "error", status: failure.status, message: failure.message });
      } finally {
        request.signal.removeEventListener("abort", abortRequest);
        if (!cancelled) controller.close();
      }
    },
    async cancel() {
      cancelled = true;
      cancellation.abort();
      await iterator.return?.();
    },
  });
  return withLovableAiGatewayRunIdHeader(
    new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    }),
    runIdFetch,
  );
}
