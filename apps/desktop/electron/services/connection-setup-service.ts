import { randomUUID } from "node:crypto";
import type { Message } from "@earendil-works/pi-ai";
import type {
  CustomConnection,
  ModelInfo,
  ProposedConnectionConfig,
} from "@peach-pi/shared-types";
import type { Emit } from "../ipc/registry.ts";
import type { CustomConnectionService } from "./custom-connection-service.ts";

/** Live setup session: holds the raw key in memory (never persisted until
 *  save) plus the assistant's full pi-ai conversation for multi-turn context. */
interface SetupSession {
  apiKey: string;
  name?: string;
  systemPrompt: string;
  messages: Message[];
  busy: boolean;
}

/** Max characters of docs handed to the model. */
const DOCS_LIMIT = 12_000;

/** Strip HTML to rough plain text (docs pages are often HTML). */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Drives the interactive "configure a custom connection" assistant.
 *
 * The renderer hands a docs URL (or pasted docs) + an API key. We fetch the
 * docs, run a bounded tool-calling loop on the utility model (it proposes a
 * config and verifies it with read-only probes), and stream the activity to
 * the renderer. The raw key is held here and injected into probes — it never
 * reaches the model. On save we hand it to the CustomConnectionService.
 */
export class ConnectionSetupService {
  private sessions = new Map<string, SetupSession>();

  constructor(
    private emit: Emit,
    private getUtilityModel: () => ModelInfo | null,
    private connections: CustomConnectionService,
  ) {}

  /** Fetch a docs URL to text, or pass through pasted docs text. */
  private async resolveDocs(input: string): Promise<string> {
    const trimmed = input.trim();
    if (!/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, DOCS_LIMIT);
    try {
      const res = await fetch(trimmed, { headers: { accept: "text/html,text/plain,*/*" } });
      const body = await res.text();
      const text = /<\/?[a-z][\s\S]*>/i.test(body) ? htmlToText(body) : body;
      const out = text.slice(0, DOCS_LIMIT);
      return out || `(Could not read meaningful content from ${trimmed}.)`;
    } catch (err) {
      return `(Failed to fetch ${trimmed}: ${String(err)}. Ask the user to paste the relevant docs.)`;
    }
  }

  async start(input: { docs: string; apiKey: string; name?: string }): Promise<{ sessionId: string }> {
    const apiKey = input.apiKey.trim();
    const name = input.name?.trim() || undefined;
    const docs = await this.resolveDocs(input.docs);

    const { buildSetupSystemPrompt } = await import("@peach-pi/pi-client");
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      apiKey,
      name,
      systemPrompt: buildSetupSystemPrompt(name, docs),
      messages: [
        {
          role: "user",
          content:
            "Here are my API docs and key. Work out the base URL and auth header, verify it with a read-only probe, then propose the config to save.",
          timestamp: Date.now(),
        },
      ],
      busy: false,
    });
    // Kick off the first turn in the background so the invoke returns promptly.
    void this.runTurn(sessionId);
    return { sessionId };
  }

  async send(sessionId: string, text: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Unknown setup session: ${sessionId}`);
    if (s.busy) return;
    s.messages.push({ role: "user", content: text, timestamp: Date.now() });
    void this.runTurn(sessionId);
  }

  private async runTurn(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s || s.busy) return;
    s.busy = true;
    try {
      const { runConnectionSetupTurn } = await import("@peach-pi/pi-client");
      const result = await runConnectionSetupTurn(
        this.getUtilityModel(),
        s.systemPrompt,
        s.messages,
        {
          onDelta: (text) => this.emit("event:connSetupDelta", { sessionId, text }),
          onProbe: (summary, ok) => this.emit("event:connSetupProbe", { sessionId, summary, ok }),
          onConfig: (config) => this.emit("event:connSetupConfig", { sessionId, config }),
          probe: (args) =>
            this.connections.requestWith(
              { baseUrl: args.baseUrl, headerName: args.headerName, headerPrefix: args.headerPrefix, apiKey: s.apiKey },
              args.method,
              args.path,
            ),
        },
      );
      if (result == null) {
        this.emit("event:connSetupDone", {
          sessionId,
          error: "No model with configured auth — set a utility model in Settings.",
        });
        return;
      }
      s.messages = result.messages;
      this.emit("event:connSetupDone", { sessionId, error: result.error });
    } catch (err) {
      this.emit("event:connSetupDone", { sessionId, error: String(err) });
    } finally {
      if (this.sessions.has(sessionId)) s.busy = false;
    }
  }

  async save(sessionId: string, config: ProposedConnectionConfig): Promise<CustomConnection> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Unknown setup session: ${sessionId}`);
    const created = await this.connections.create({
      name: config.name,
      baseUrl: config.baseUrl,
      apiKey: s.apiKey,
      headerName: config.headerName,
      headerPrefix: config.headerPrefix,
    });
    this.close(sessionId);
    return created;
  }

  close(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
