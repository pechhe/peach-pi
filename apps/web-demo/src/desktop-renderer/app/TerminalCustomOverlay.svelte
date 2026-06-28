<script lang="ts">
  import { Terminal } from "@xterm/xterm";
  import "@xterm/xterm/css/xterm.css";
  import type { TerminalCustomFrame } from "@peach-pi/shared-types";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import X from "@lucide/svelte/icons/x";

  let { frame, threadId }: { frame: TerminalCustomFrame; threadId: string } = $props();

  // Width the main-process driver renders at (TERMINAL_CUSTOM_COLS).
  const COLS = 80;
  let container = $state<HTMLDivElement | null>(null);
  let term = $state<Terminal | null>(null);

  // Create the xterm once; keystrokes read the live frame.requestId at call
  // time (props are reactive), so a new screen's requestId is used without
  // tearing the terminal down.
  $effect(() => {
    if (!container) return;
    const t = new Terminal({
      cols: COLS,
      rows: 1,
      convertEol: true,
      cursorBlink: false,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: { background: "#1e1e1e", foreground: "#e4e4e7", cursor: "#e4e4e7" },
    });
    t.open(container);
    t.focus();
    t.write("\x1b[?25l"); // hide cursor — components draw their own
    const sub = t.onData((data) => extensionUi.terminalCustomInput(threadId, frame.requestId, data));
    term = t;
    return () => {
      sub.dispose();
      t.dispose();
      term = null;
    };
  });

  // Repaint the full frame on update. While busy (between screens) keep the
  // last frame so it sits dimmed under the spinner instead of clearing.
  $effect(() => {
    const lines = frame.lines;
    const busy = frame.busy;
    const t = term;
    if (!t || busy) return;
    t.resize(COLS, Math.max(lines.length, 1));
    // Redraw in place: home the cursor, clear each line to EOL as we rewrite,
    // then clear anything below. Avoids the full-screen t.reset() flicker on
    // every frame (games repaint many times per second).
    const painted = lines.map((l) => `${l}\x1b[K`).join("\r\n");
    t.write(`\x1b[H${painted}\x1b[J`);
  });

  function close(): void {
    extensionUi.cancelTerminalCustom(threadId, frame.requestId);
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  role="dialog"
  aria-label="Extension UI"
  data-testid="terminal-custom-overlay"
>
  <div class="relative flex flex-col rounded-lg border border-white/10 bg-[#1e1e1e] p-3 shadow-2xl">
    <button
      class="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-white/10 bg-[#161617] text-zinc-400 hover:text-zinc-200"
      onclick={close}
      title="Cancel"
      aria-label="Cancel extension UI"><X size={14} /></button
    >
    <div bind:this={container}></div>
    {#if frame.busy}
      <div class="mt-2 flex items-center gap-2 text-[11px] text-zinc-400" role="status" aria-live="polite">
        <span class="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true"></span>
        <span>Working…</span>
      </div>
    {/if}
  </div>
</div>
