import { APICallError } from "ai";

export interface GatewayFailure {
  status: number;
  message: string;
  type: string;
  pause: boolean;
}
export function gatewayFailure(error: unknown): GatewayFailure {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 502;
    let parsed: { message?: string; type?: string; error?: { message?: string; type?: string } } =
      {};
    try {
      parsed = JSON.parse(error.responseBody ?? "{}");
    } catch {
      /* Keep SDK's safe message for non-JSON failures. */
    }
    const message = parsed.message ?? parsed.error?.message ?? error.message;
    const type = parsed.type ?? parsed.error?.type ?? "gateway_error";
    return { status, message, type, pause: status === 402 || status === 403 };
  }
  if (error instanceof Error && error.name === "AbortError")
    return { status: 499, message: "Generation stopped.", type: "aborted", pause: false };
  return {
    status: 502,
    message: error instanceof Error ? error.message : "Recommendations could not be generated.",
    type: "generation_error",
    pause: false,
  };
}
