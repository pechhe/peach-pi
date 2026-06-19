import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ModelInfo,
  SideConversation,
  SideMessage,
  TranscriptItem,
} from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { SideChatRepo } from "../persistence/repositories.ts";
import type { Emit } from "../ipc/registry.ts";

/** Subset of ThreadService the side chat needs (the live main conversation). */
interface ThreadContext {
  getMeta(threadId: string): Promise<{ model: ModelInfo | null }>;
  getTranscript(threadId: string): Promise<{ items: TranscriptItem[] }>;
}

/** Subset of GitService the side chat needs (working dir + branch). */
interface RepoContext {
  cwdFor(threadId: string): string | null;
  info(threadId: string): Promise<{ branch: string | null }>;
}

/** Recent main-transcript characters fed to the side model as read-only context. */
const TRANSCRIPT_BUDGET = 10_000;
/** Project doc head (AGENTS.md / README) characters included. */
const DOC_HEAD = 1_500;

/** Flatten a transcript item to a short plain-text line for context. */
function itemText(item: TranscriptItem): string | null {
  switch (item.kind) {
    case "user":
      return `User: ${item.text}`;
    case "assistant":
      return item.text.trim() ? `Assistant: ${item.text}` : null;
    case "tool":
      return `[tool ${item.toolName}] ${item.argsSummary}`;
    case "notice":
      return `(${item.text})`;
    default:
      return null;
  }
}

/**
 * Owns `/btw` side conversations: cheap, isolated mini-chats attached to a
 * thread. Each reads the thread's main conversation as read-only context but
 * never writes back to it (separate stateless pi-ai call — the live pi session
 * is untouched). Conversations persist per thread as a browsable history.
 */
export class SideChatService {
  private repo: SideChatRepo;
  private emit: Emit;
  private threads: ThreadContext;
  private git: RepoContext;

  constructor(db: AppDb, emit: Emit, threads: ThreadContext, git: RepoContext) {
    this.repo = new SideChatRepo(db);
    this.emit = emit;
    this.threads = threads;
    this.git = git;
  }

  /** Start a fresh side conversation. modelOverride null → thread's current model. */
  async start(threadId: string, modelOverride?: ModelInfo | null): Promise<SideConversation> {
    let model = modelOverride ?? null;
    if (!model) {
      try {
        model = (await this.threads.getMeta(threadId)).model;
      } catch {
        model = null;
      }
    }
    return this.repo.create(threadId, model);
  }

  list(threadId: string): SideConversation[] {
    return this.repo.listForThread(threadId);
  }

  get(convId: string): SideConversation | null {
    return this.repo.get(convId);
  }

  delete(convId: string): void {
    this.repo.delete(convId);
  }

  /** Ask a question; the answer streams via event:sideDelta, then event:sideDone. */
  async ask(convId: string, question: string): Promise<void> {
    const conv = this.repo.get(convId);
    if (!conv) throw new Error(`Unknown side conversation: ${convId}`);
    const threadId = conv.threadId;

    // Persist the user turn immediately so a reload mid-stream keeps it.
    const messages: SideMessage[] = [...conv.messages, { role: "user", text: question }];
    this.repo.setMessages(convId, messages);
    if (!conv.title) this.repo.setTitle(convId, question.slice(0, 60));

    const systemPrompt = await this.buildContext(threadId);
    const history = conv.messages.map((m) => ({ role: m.role, content: m.text }));

    try {
      const { streamSideChat } = await import("@peach-pi/pi-client");
      const answer = await streamSideChat(
        conv.model ? { provider: conv.model.provider, id: conv.model.id } : null,
        { systemPrompt, history, question },
        (text) => this.emit("event:sideDelta", { convId, threadId, text }),
      );
      if (answer == null) {
        this.emit("event:sideDone", {
          convId,
          threadId,
          error: "No model with configured auth — set a utility model in Settings.",
        });
        return;
      }
      this.repo.setMessages(convId, [...messages, { role: "assistant", text: answer }]);
      this.emit("event:sideDone", { convId, threadId });
    } catch (err) {
      this.emit("event:sideDone", { convId, threadId, error: String(err) });
    }
  }

  /** System prompt: side-assistant framing + repo basics + recent main convo. */
  private async buildContext(threadId: string): Promise<string> {
    const parts: string[] = [
      "You are a focused side assistant answering a quick question alongside the user's main coding session.",
      "Be concise and direct. You can see the main conversation below as READ-ONLY context; your reply is NOT added to it and does not affect the main task.",
    ];

    const cwd = this.git.cwdFor(threadId);
    if (cwd) {
      parts.push(`Working directory: ${cwd}`);
      try {
        const { branch } = await this.git.info(threadId);
        if (branch) parts.push(`Git branch: ${branch}`);
      } catch {
        // not a repo / git unavailable — skip
      }
      const doc = await this.readProjectDoc(cwd);
      if (doc) parts.push(`Project docs (head):\n${doc}`);
    }

    const convo = await this.recentTranscript(threadId);
    if (convo) parts.push(`--- Main conversation (most recent) ---\n${convo}`);

    return parts.join("\n\n");
  }

  /** Head of AGENTS.md or README.md in the working dir, if present. */
  private async readProjectDoc(cwd: string): Promise<string | null> {
    for (const name of ["AGENTS.md", "README.md"]) {
      try {
        const text = await readFile(path.join(cwd, name), "utf8");
        return text.slice(0, DOC_HEAD);
      } catch {
        // try next
      }
    }
    return null;
  }

  /** Tail of the main transcript, flattened and truncated to a char budget. */
  private async recentTranscript(threadId: string): Promise<string | null> {
    let items: TranscriptItem[];
    try {
      ({ items } = await this.threads.getTranscript(threadId));
    } catch {
      return null;
    }
    const lines = items.map(itemText).filter((l): l is string => l != null);
    if (lines.length === 0) return null;
    let text = lines.join("\n");
    if (text.length > TRANSCRIPT_BUDGET) text = `…${text.slice(-TRANSCRIPT_BUDGET)}`;
    return text;
  }
}
