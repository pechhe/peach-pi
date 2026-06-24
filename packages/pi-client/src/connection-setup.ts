/**
 * Interactive "set up a custom connection" assistant.
 *
 * A bounded tool-calling loop over the utility model: it reads fetched API
 * docs, proposes a connection config, and verifies it by running real probe
 * requests (GET/HEAD only) against the user's API. The raw API key is NEVER
 * given to the model — the host injects it into probe requests server-side.
 *
 * Stateless w.r.t. the live pi session (separate pi-ai call). The caller owns
 * the conversation `Message[]` and passes it in/out so multi-turn context
 * (including tool history) survives across turns.
 */

import { Type } from "typebox";
import type { Message, Tool, ToolCall } from "@earendil-works/pi-ai";

import { resolveUtilityModel, type UtilityModelConfig } from "./utility-model.ts";

/** Arguments the model proposes for a verification request (key added by host). */
export interface ProbeArgs {
  method: string;
  baseUrl: string;
  path: string;
  headerName: string;
  headerPrefix: string;
}

/** The final connection config the assistant hands back for the user to save. */
export interface ProposedConfig {
  name: string;
  baseUrl: string;
  headerName: string;
  headerPrefix: string;
}

export interface ConnSetupCallbacks {
  /** Streaming assistant text. */
  onDelta(text: string): void;
  /** A verification probe ran (summary line + whether it looked healthy). */
  onProbe(summary: string, ok: boolean): void;
  /** The assistant proposed a final config (prefill the save form). */
  onConfig(config: ProposedConfig): void;
  /** Execute a probe request server-side (host injects the API key). */
  probe(args: ProbeArgs): Promise<{ status: number; body: string }>;
}

/** Truncate probe bodies fed back to the model. */
const PROBE_BODY_LIMIT = 2_000;
/** Hard cap on tool rounds per turn (probe/propose), to bound cost + loops. */
const MAX_TOOL_ROUNDS = 8;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Turn a raw provider error string into a clean message. Anthropic streams
 *  sometimes surface the raw envelope, e.g.
 *  {"type":"error","error":{"type":"api_error","message":"Internal server error"},"request_id":"…"}. */
function cleanError(msg: string | undefined): string {
  if (!msg) return "Setup stream failed";
  try {
    const p = JSON.parse(msg) as { error?: { message?: string }; message?: string };
    const inner = p?.error?.message ?? p?.message;
    if (typeof inner === "string" && inner) return `Model provider error: ${inner}`;
  } catch { /* not JSON */ }
  return msg;
}

const probeSchema = Type.Object({
  method: Type.String({ description: "HTTP method — GET or HEAD only (verification must be read-only)." }),
  baseUrl: Type.String({ description: "Service base URL, no trailing slash, e.g. https://api.example.com" }),
  path: Type.String({ description: "Request path beginning with /, e.g. /v1/user or /api/me" }),
  headerName: Type.String({ description: "Auth header name, e.g. Authorization or X-API-Key" }),
  headerPrefix: Type.String({ description: "Prefix prepended to the key, e.g. 'Bearer ' or '' for raw." }),
});

const proposeSchema = Type.Object({
  name: Type.String({ description: "Short connection name, e.g. 'Stripe' or 'Acme API'." }),
  baseUrl: Type.String({ description: "Verified base URL, no trailing slash." }),
  headerName: Type.String({ description: "Auth header name that worked." }),
  headerPrefix: Type.String({ description: "Value prefix that worked, e.g. 'Bearer ' or ''." }),
});

const TOOLS: Tool[] = [
  {
    name: "probe_request",
    description:
      "Send a read-only (GET/HEAD) request to the user's API to verify the base URL and auth header work. The API key is injected automatically — do not include it. Returns the HTTP status and a truncated response body.",
    parameters: probeSchema,
  },
  {
    name: "propose_config",
    description:
      "Call this once a probe has confirmed the configuration works (or the user explicitly accepts it). Hands the final config to the user to save. Then give a one-line confirmation.",
    parameters: proposeSchema,
  },
];

/** System framing for the setup assistant. Caller supplies the docs block. */
export function buildSetupSystemPrompt(name: string | undefined, docs: string): string {
  return [
    "You help the user configure a custom HTTP API connection for an agent to use later.",
    "Your job: from the API docs below, work out the base URL, the auth header name (e.g. Authorization or X-API-Key), and the value prefix (e.g. 'Bearer ' or '' for a raw key), then VERIFY it with a read-only probe.",
    "",
    "Rules:",
    "- The user's API key is held securely and injected into probe_request for you. NEVER ask for the key value and never put it in arguments.",
    "- Verify with probe_request using a safe, read-only GET endpoint (a 'current user', 'me', 'ping', or list endpoint is ideal). Only GET/HEAD are allowed.",
    "- A 2xx status means it works. 401/403 means the header name or prefix is wrong — try another combination. 404 means the path/base URL is off.",
    "- If the docs are unclear or you cannot find a safe endpoint, ASK the user a short, specific question instead of guessing repeatedly.",
    "- When a probe confirms it works, call propose_config with the final values, then tell the user it's ready to save.",
    "Be concise.",
    name ? `\nThe user named this connection: "${name}".` : "",
    "\n--- API docs ---\n" + docs,
  ].join("\n");
}

/**
 * Run one turn. `messages` must already include the new user message. Streams
 * assistant text + probe activity via callbacks, executes tool calls, and
 * returns the full updated message list (with assistant + tool-result turns
 * appended) for persistence. Returns an error string instead of throwing on
 * stream failure. Returns null messages only when no auth-configured model.
 */
export async function runConnectionSetupTurn(
  config: UtilityModelConfig | null | undefined,
  systemPrompt: string,
  messages: Message[],
  cb: ConnSetupCallbacks,
): Promise<{ messages: Message[]; error?: string } | null> {
  const resolved = await resolveUtilityModel(config);
  if (!resolved) return null;
  const ai = await import("@earendil-works/pi-ai");

  const convo: Message[] = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let finished: { reason: string; message: Message } | null = null;
    let streamError: string | null = null;
    let streamedText = false;
    // One auto-retry when nothing streamed yet — provider api_error blips are
    // often transient (e.g. Anthropic 500 "Internal server error").
    for (let attempt = 0; attempt < 2; attempt++) {
      streamedText = false;
      streamError = null;
      finished = null;
      const events = ai.streamSimple(
        resolved.model as Parameters<typeof ai.streamSimple>[0],
        { systemPrompt, messages: convo, tools: TOOLS },
        { apiKey: resolved.apiKey, headers: resolved.headers, maxTokens: 1500 },
      );
      try {
        for await (const event of events) {
          if (event.type === "text_delta") {
            streamedText = true;
            cb.onDelta(event.delta);
          } else if (event.type === "done") {
            finished = { reason: event.reason, message: event.message };
          } else if (event.type === "error") {
            streamError = cleanError((event.error as { errorMessage?: string }).errorMessage);
          }
        }
      } catch (err) {
        streamError = cleanError(err instanceof Error ? err.message : String(err));
      }
      if (!streamError) break; // success
      if (streamedText) break; // already showed partial text — don't risk a duplicate
      if (attempt < 1) await sleep(800);
    }

    if (streamError) return { messages: convo, error: streamError };
    if (!finished) return { messages: convo, error: "Setup stream ended unexpectedly" };
    convo.push(finished.message);

    if (finished.reason !== "toolUse") return { messages: convo };

    // Execute every tool call in this assistant message, append tool results.
    const calls = (finished.message as { content: unknown[] }).content.filter(
      (c): c is ToolCall => (c as { type?: string }).type === "toolCall",
    );
    for (const call of calls) {
      const text = await executeTool(call, cb);
      convo.push({
        role: "toolResult",
        toolCallId: call.id,
        toolName: call.name,
        content: [{ type: "text", text }],
        isError: false,
        timestamp: Date.now(),
      });
    }
    // loop: feed tool results back to the model for the next round
  }

  return { messages: convo, error: "Reached the verification step limit. Ask the user to confirm or paste the relevant docs section." };
}

async function executeTool(call: ToolCall, cb: ConnSetupCallbacks): Promise<string> {
  if (call.name === "probe_request") {
    const a = call.arguments as Partial<ProbeArgs>;
    const method = (a.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return `Refused: only GET/HEAD probes are allowed (got ${method}).`;
    }
    const args: ProbeArgs = {
      method,
      baseUrl: (a.baseUrl ?? "").trim().replace(/\/+$/, ""),
      path: a.path ?? "/",
      headerName: (a.headerName ?? "Authorization").trim() || "Authorization",
      headerPrefix: a.headerPrefix ?? "Bearer ",
    };
    try {
      const { status, body } = await cb.probe(args);
      const ok = status >= 200 && status < 300;
      cb.onProbe(`${method} ${args.path} → ${status}`, ok);
      const trimmed = body.length > PROBE_BODY_LIMIT ? body.slice(0, PROBE_BODY_LIMIT) + "…(truncated)" : body;
      return `HTTP ${status}\n${trimmed}`;
    } catch (err) {
      cb.onProbe(`${method} ${args.path} → error`, false);
      return `Request failed: ${String(err)}`;
    }
  }

  if (call.name === "propose_config") {
    const a = call.arguments as Partial<ProposedConfig>;
    const config: ProposedConfig = {
      name: (a.name ?? "").trim(),
      baseUrl: (a.baseUrl ?? "").trim().replace(/\/+$/, ""),
      headerName: (a.headerName ?? "Authorization").trim() || "Authorization",
      headerPrefix: a.headerPrefix ?? "Bearer ",
    };
    cb.onConfig(config);
    return "Config handed to the user to review and save.";
  }

  return `Unknown tool: ${call.name}`;
}
