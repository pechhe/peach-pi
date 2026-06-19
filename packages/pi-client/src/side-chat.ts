/**
 * Streaming one-shot/multi-turn completion for the `/btw` side conversation.
 *
 * Reuses the utility-model auth resolution (so a chosen model's API key/headers
 * are resolved the same way), then streams via pi-ai. Stateless: never touches
 * the live AgentSession or its JSONL — a side chat cannot pollute main history.
 */

import { resolveUtilityModel, type UtilityModelConfig } from "./utility-model.ts";

export interface SideChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SideChatRequest {
  systemPrompt: string;
  /** Prior turns of this side conversation (oldest first), excluding the new one. */
  history: SideChatTurn[];
  /** The new user question. */
  question: string;
  maxTokens?: number;
}

/**
 * Stream a side-chat answer. Calls `onDelta` with text fragments as they
 * arrive and resolves with the full text. Returns null when no model has auth
 * configured (caller surfaces a friendly error). The chosen model is tried
 * first; resolution falls back to any authed model if it isn't available.
 */
export async function streamSideChat(
  config: UtilityModelConfig | null | undefined,
  req: SideChatRequest,
  onDelta: (text: string) => void,
): Promise<string | null> {
  const resolved = await resolveUtilityModel(config);
  if (!resolved) return null;
  const ai = await import("@earendil-works/pi-ai");
  // Fold prior turns into the system prompt and send only the new question as a
  // user message. This keeps the call to a single, simply-typed user message
  // (constructing native AssistantMessage objects would need provider/usage/etc.)
  // while preserving multi-turn context.
  const history = req.history
    .map((t) => `${t.role === "user" ? "User" : "You"}: ${t.content}`)
    .join("\n\n");
  const systemPrompt = history
    ? `${req.systemPrompt}\n\n--- Earlier in this side chat ---\n${history}`
    : req.systemPrompt;
  const events = ai.streamSimple(
    resolved.model as Parameters<typeof ai.streamSimple>[0],
    { systemPrompt, messages: [{ role: "user", content: req.question, timestamp: Date.now() }] },
    {
      apiKey: resolved.apiKey,
      headers: resolved.headers,
      // No temperature: newer models (e.g. reasoning Anthropic models) reject it
      // with "`temperature` is deprecated for this model."
      maxTokens: req.maxTokens ?? 1200,
    },
  );
  let full = "";
  for await (const event of events) {
    if (event.type === "text_delta") {
      full += event.delta;
      onDelta(event.delta);
    } else if (event.type === "error") {
      const msg = (event.error as { errorMessage?: string }).errorMessage;
      throw new Error(msg ?? "Side chat stream failed");
    }
  }
  return full;
}
