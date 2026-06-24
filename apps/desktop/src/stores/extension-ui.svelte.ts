import type { Component } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { ExtensionUiRequest, ExtUpdatesAvailable, NoticePayload, TerminalCustomFrame } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast extends NoticePayload {
  id: number;
  action?: ToastAction;
  /** Optional leading icon (e.g. a thread's tag icon) shown before the text. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: Component<any>;
}

/**
 * Status keys whose setStatus() pill is suppressed in the thread header.
 * "caveman" has a dedicated toggle in the Composer.
 * "vision-proxy" config lives in Settings.
 * "mcp" (pi-mcp-adapter: "MCP: X/Y servers") is a session-global
 * connection count, not thread-specific — the per-thread header pill is
 * the wrong surface. MCP servers are configured in ~/.pi/agent/mcp.json
 * and managed via the pi-mcp-adapter extension (`/mcp` commands); a
 * dedicated MCP panel belongs in the Connections view, not the title bar.
 */
const HIDDEN_STATUS_KEYS = new Set(["caveman", "vision-proxy", "mcp"]);

/** Extension dialog queue + toast notifications + per-thread status text. */
class ExtensionUiStore {
  dialogs = $state<ExtensionUiRequest[]>([]);
  toasts = $state<Toast[]>([]);
  /** Latest frame of a live extension `custom()` TUI, or null when none. */
  terminalCustom = $state<TerminalCustomFrame | null>(null);
  /** Package names with available updates (shown as badge in sidebar). */
  extUpdates = $state<string[]>([]);
  /** threadId → (key → text) */
  private statuses = new SvelteMap<string, SvelteMap<string, string>>();
  /** threadId → (key → widget lines) — e.g. pi-subagents fleet feed. */
  private widgets = new SvelteMap<string, SvelteMap<string, string[]>>();
  private toastSeq = 0;

  init(): void {
    api.on("event:extensionUi", (req) => {
      this.dialogs = [...this.dialogs, req];
    });
    api.on("event:notice", (notice) => this.pushToast(notice));
    api.on("event:extUpdatesAvailable", ({ packages }) => {
      this.extUpdates = packages;
    });
    api.on("event:extensionStatus", ({ threadId, key, text }) => {
      let map = this.statuses.get(threadId);
      if (!map) {
        map = new SvelteMap();
        this.statuses.set(threadId, map);
      }
      if (text === null || text === "") map.delete(key);
      else map.set(key, text);
    });
    api.on("event:terminalCustom", (frame) => {
      this.terminalCustom = frame.closed ? null : frame;
    });
    api.on("event:extensionWidget", ({ threadId, key, lines }) => {
      let map = this.widgets.get(threadId);
      if (!map) {
        map = new SvelteMap();
        this.widgets.set(threadId, map);
      }
      if (lines === null) map.delete(key);
      else map.set(key, lines);
    });
  }

  pushToast(notice: NoticePayload): void {
    const toast = { ...notice, id: ++this.toastSeq };
    this.toasts = [...this.toasts, toast];
    setTimeout(() => this.dismiss(toast.id), 5000);
  }

  /** Renderer-originated toast, optionally with an action (e.g. Undo) and a
   *  leading icon. */
  notify(
    message: string,
    action?: ToastAction,
    level: NoticePayload["level"] = "info",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: Component<any>,
  ): void {
    const toast: Toast = { message, level, action, icon, id: ++this.toastSeq };
    this.toasts = [...this.toasts, toast];
    setTimeout(() => this.dismiss(toast.id), 5000);
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  statusesFor(threadId: string): string[] {
    const map = this.statuses.get(threadId);
    if (!map) return [];
    const out: string[] = [];
    for (const [key, text] of map) {
      if (HIDDEN_STATUS_KEYS.has(key)) continue;
      out.push(text);
    }
    return out;
  }

  widgetsFor(threadId: string): Array<{ key: string; lines: string[] }> {
    return [...(this.widgets.get(threadId)?.entries() ?? [])].map(([key, lines]) => ({ key, lines }));
  }

  async respond(requestId: string, value: string | boolean | undefined): Promise<void> {
    this.dialogs = this.dialogs.filter((d) => d.requestId !== requestId);
    await api.invoke("threads:respondExtensionUi", requestId, value);
  }

  /** Forward a keystroke from the overlay to the live `custom()` component. */
  terminalCustomInput(threadId: string, requestId: string, data: string): void {
    void api.invoke("threads:terminalCustomInput", threadId, requestId, data);
  }

  /** Cancel the live `custom()` TUI (esc / overlay close). */
  cancelTerminalCustom(threadId: string, requestId: string): void {
    this.terminalCustom = null;
    void api.invoke("threads:terminalCustomCancel", threadId, requestId);
  }
}

export const extensionUi = new ExtensionUiStore();
