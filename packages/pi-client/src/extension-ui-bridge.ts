import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

export interface UiBridgeCallbacks {
  /** Proxy a dialog to the GUI. Resolve with the user's answer. */
  onDialog(req: {
    kind: "select" | "confirm" | "input";
    title: string;
    message?: string;
    options?: string[];
    placeholder?: string;
    signal?: AbortSignal;
    timeout?: number;
  }): Promise<string | boolean | undefined>;
  onNotify(message: string, level: "info" | "warning" | "error"): void;
  onStatus(key: string, text: string | null): void;
  /** Text widgets (e.g. pi-subagents fleet feed). Component widgets are dropped. */
  onWidget?(key: string, lines: string[] | null): void;
}

/**
 * ExtensionUIContext implementation for a GUI host. Dialog-style requests
 * (select/confirm/input/editor) proxy to the renderer; TUI-component surfaces
 * (widgets, footer, custom components) are unsupported and degrade to no-ops —
 * extensions awaiting `custom()` get `undefined` back immediately.
 */
export function createUiBridge(callbacks: UiBridgeCallbacks): ExtensionUIContext {
  const bridge = {
    async select(title: string, options: string[], opts?: { signal?: AbortSignal; timeout?: number }) {
      const v = await callbacks.onDialog({ kind: "select", title, options, ...opts });
      return typeof v === "string" ? v : undefined;
    },
    async confirm(title: string, message: string, opts?: { signal?: AbortSignal; timeout?: number }) {
      const v = await callbacks.onDialog({ kind: "confirm", title, message, ...opts });
      return v === true;
    },
    async input(title: string, placeholder?: string, opts?: { signal?: AbortSignal; timeout?: number }) {
      const v = await callbacks.onDialog({ kind: "input", title, placeholder, ...opts });
      return typeof v === "string" ? v : undefined;
    },
    async editor(title: string, prefill?: string) {
      const v = await callbacks.onDialog({ kind: "input", title, placeholder: prefill });
      return typeof v === "string" ? v : undefined;
    },
    notify(message: string, type: "info" | "warning" | "error" = "info") {
      callbacks.onNotify(message, type);
    },
    setStatus(key: string, text: string | undefined) {
      callbacks.onStatus(key, text ?? null);
    },
    // TUI-only surfaces: no-op in GUI host.
    onTerminalInput: () => () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: (key: string, content: unknown) => {
      if (content === undefined) callbacks.onWidget?.(key, null);
      else if (Array.isArray(content) && content.every((l) => typeof l === "string")) {
        callbacks.onWidget?.(key, content);
      }
      // Component-factory widgets are TUI-only — dropped.
    },
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    custom: async () => undefined,
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => "",
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
  };
  return bridge as unknown as ExtensionUIContext;
}
