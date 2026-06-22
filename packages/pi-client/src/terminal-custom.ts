/**
 * Bridges an extension's terminal `custom()` TUI component onto an xterm
 * surface in the GUI. The pi SDK hands us a factory
 * `(tui, theme, keybindings, done) => Component`; we drive its render() with
 * shim tui/theme, stream the output lines out as frames, feed keystrokes back
 * via input(), and settle the awaited promise when the component calls done()
 * (or when cancelled / the session is torn down).
 *
 * Plain text only (no ANSI colour) for v1: the theme shim returns text
 * unchanged and the xterm surface renders it verbatim.
 */

/** Fixed render width. The xterm overlay is sized to match. */
const TERMINAL_CUSTOM_COLS = 80;

/** The subset of pi-tui's Component we drive. */
interface TuiComponent {
  render(width: number): string[];
  handleInput?(data: string): void;
  invalidate?(): void;
  dispose?(): void;
}

/** pi SDK `custom()` factory shape (see ExtensionUIContext.custom). */
type CustomFactory = (
  tui: unknown,
  theme: unknown,
  keybindings: unknown,
  done: (result: unknown) => void,
) => TuiComponent | Promise<TuiComponent>;

export interface TerminalCustomFrameEvent {
  requestId: string;
  lines: string[];
  busy?: boolean;
  closed?: boolean;
}

export type TerminalCustomEmit = (frame: TerminalCustomFrameEvent) => void;

/** Passthrough theme: styling calls return text unchanged (no ANSI). */
const themeShim = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
  inverse: (text: string) => text,
  strikethrough: (text: string) => text,
  getFgAnsi: () => "",
  getBgAnsi: () => "",
  getColorMode: () => "256color" as const,
  getThinkingBorderColor: () => (s: string) => s,
  getBashModeBorderColor: () => (s: string) => s,
};

export class TerminalCustomDriver {
  private components = new Map<string, TuiComponent>();
  /** requestId → settle the awaited custom() promise with undefined. */
  private cancels = new Map<string, () => void>();
  private emit: TerminalCustomEmit;

  constructor(emit: TerminalCustomEmit) {
    this.emit = emit;
  }

  /** Drive one `custom()` component; resolves with its done() result. */
  drive(factory: CustomFactory): Promise<unknown> {
    const requestId = crypto.randomUUID();
    return new Promise<unknown>((resolve) => {
      let settled = false;
      const done = (result: unknown): void => {
        if (settled) return;
        settled = true;
        this.components.get(requestId)?.dispose?.();
        this.components.delete(requestId);
        this.cancels.delete(requestId);
        // Keep the overlay up in a busy state: the command often continues
        // straight to another screen. The next frame replaces it; otherwise
        // close() clears it when the command ends.
        this.emit({ requestId, lines: [], busy: true });
        resolve(result ?? undefined);
      };
      this.cancels.set(requestId, () => done(undefined));

      const tuiShim = { requestRender: () => this.render(requestId) };
      Promise.resolve(factory(tuiShim, themeShim, {}, done))
        .then((built) => {
          if (settled) {
            built.dispose?.();
            return;
          }
          this.components.set(requestId, built);
          this.render(requestId);
        })
        .catch(() => done(undefined));
    });
  }

  /** Feed a keystroke to a live component and repaint. */
  input(requestId: string, data: string): void {
    this.components.get(requestId)?.handleInput?.(data);
    this.render(requestId);
  }

  /** Cancel a live component (esc / overlay close): settles its promise. */
  cancel(requestId: string): void {
    this.cancels.get(requestId)?.();
  }

  /** Settle every live component and clear the overlay. */
  close(): void {
    for (const requestId of [...this.cancels.keys()]) this.cancel(requestId);
    this.emit({ requestId: "", lines: [], closed: true });
  }

  private render(requestId: string): void {
    const live = this.components.get(requestId);
    if (!live) return;
    let lines: string[];
    try {
      lines = [...live.render(TERMINAL_CUSTOM_COLS)];
    } catch {
      return;
    }
    this.emit({ requestId, lines });
  }
}
