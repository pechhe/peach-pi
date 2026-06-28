import type { ModelInfo, SideConversation, SideMessage } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/**
 * `/btw` side conversations. Each open starts a fresh ephemeral side chat for
 * the current thread; prior ones are browsable history. The side chat reads the
 * main conversation as context but never writes to it.
 */
class SideChatStore {
  open = $state(false);
  threadId = $state<string | null>(null);
  /** The conversation currently shown in the panel. */
  active = $state<SideConversation | null>(null);
  /** Live assistant text while a turn streams in. */
  streaming = $state(false);
  buffer = $state("");
  error = $state<string | null>(null);
  /** History list for the current thread (newest first). */
  history = $state<SideConversation[]>([]);
  /** Composer draft, held here so the floating BTW cap can also submit it. */
  draft = $state("");
  private started = false;

  init(): void {
    if (this.started) return;
    this.started = true;
    api.on("event:sideDelta", ({ convId, text }) => {
      if (this.active?.id === convId) this.buffer += text;
    });
    api.on("event:sideDone", ({ convId, error }) => {
      if (this.active?.id !== convId) return;
      this.streaming = false;
      if (error) {
        this.error = error;
        this.buffer = "";
        return;
      }
      if (this.buffer) {
        const msg: SideMessage = { role: "assistant", text: this.buffer };
        this.active = { ...this.active, messages: [...this.active.messages, msg] };
      }
      this.buffer = "";
      void this.refreshHistory();
    });
  }

  /** Open the panel for a thread, starting a fresh side conversation. */
  async openPanel(threadId: string, seedQuestion?: string): Promise<void> {
    this.threadId = threadId;
    this.open = true;
    await this.startNew();
    await this.refreshHistory();
    if (seedQuestion) await this.ask(seedQuestion);
  }

  close(): void {
    this.open = false;
  }

  async startNew(modelOverride?: ModelInfo | null): Promise<void> {
    if (!this.threadId) return;
    this.error = null;
    this.buffer = "";
    this.streaming = false;
    this.active = await api.invoke("side:start", this.threadId, modelOverride ?? null);
  }

  /** Send the current draft (used by the floating BTW cap and Enter key). */
  async submitDraft(): Promise<void> {
    const q = this.draft.trim();
    if (!q || this.streaming) return;
    this.draft = "";
    await this.ask(q);
  }

  async ask(question: string): Promise<void> {
    const q = question.trim();
    if (!q || this.streaming) return;
    if (!this.active) await this.startNew();
    if (!this.active) return;
    this.error = null;
    this.buffer = "";
    this.streaming = true;
    this.active = {
      ...this.active,
      messages: [...this.active.messages, { role: "user", text: q }],
    };
    await api.invoke("side:ask", this.active.id, q);
  }

  /** Reopen a prior side conversation to continue it. */
  async openConv(convId: string): Promise<void> {
    const conv = await api.invoke("side:get", convId);
    if (conv) {
      this.active = conv;
      this.error = null;
      this.buffer = "";
      this.streaming = false;
    }
  }

  async deleteConv(convId: string): Promise<void> {
    await api.invoke("side:delete", convId);
    if (this.active?.id === convId) this.active = null;
    await this.refreshHistory();
  }

  async refreshHistory(): Promise<void> {
    if (!this.threadId) return;
    this.history = await api.invoke("side:list", this.threadId);
  }
}

export const sideChat = new SideChatStore();
