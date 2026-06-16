<script lang="ts">
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { api } from "../lib/ipc";
  import { theme } from "../lib/theme.svelte";
  import X from "@lucide/svelte/icons/x";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let { threadId, onClose }: { threadId: string; onClose: () => void } = $props();

  let container = $state<HTMLDivElement | null>(null);
  let exited = $state(false);
  let term = $state<Terminal | null>(null);

  /** Resolve a semantic color token from the active theme. */
  function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function xtermTheme() {
    return {
      background: cssVar("--color-bg"),
      foreground: cssVar("--color-fg-soft"),
      cursor: cssVar("--color-muted"),
      selectionBackground: cssVar("--color-surface-3"),
    };
  }

  // Re-theme the live terminal when the global theme changes.
  $effect(() => {
    theme.current;
    if (term) term.options.theme = xtermTheme();
  });

  $effect(() => {
    if (!container) return;
    const currentThread = threadId;
    const t = new Terminal({
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: xtermTheme(),
      cursorBlink: true,
    });
    term = t;
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(container);
    fit.fit();
    t.focus();

    const offData = api.on("event:terminalData", ({ threadId: id, data }) => {
      if (id === currentThread) t.write(data);
    });
    const offExit = api.on("event:terminalExit", ({ threadId: id, exitCode }) => {
      if (id !== currentThread) return;
      exited = true;
      t.write(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`);
    });
    t.onData((data) => void api.invoke("terminal:input", currentThread, data));

    void api.invoke("terminal:open", currentThread).then(({ buffer }) => {
      if (buffer) t.write(buffer);
      api.invoke("terminal:resize", currentThread, t.cols, t.rows);
    });

    const observer = new ResizeObserver(() => {
      fit.fit();
      void api.invoke("terminal:resize", currentThread, t.cols, t.rows);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      offData();
      offExit();
      t.dispose();
      term = null;
    };
  });
</script>

<div class="flex h-56 shrink-0 flex-col border-t border-border bg-bg" data-testid="terminal-pane">
  <div class="flex h-7 shrink-0 items-center justify-between px-3">
    <span class="text-[11px] text-faint">Terminal {exited ? "· exited" : ""}</span>
    <div class="flex gap-1">
      <button
        class="flex items-center gap-1 rounded px-1.5 text-[11px] text-faint hover:bg-surface-2 hover:text-fg"
        onclick={() => {
          void api.invoke("terminal:kill", threadId);
          onClose();
        }}
        title="Kill terminal"><X size={12} /> kill</button
      >
      <button
        class="flex items-center gap-1 rounded px-1.5 text-[11px] text-faint hover:bg-surface-2 hover:text-fg"
        onclick={onClose}
        title="Hide (process keeps running) — ⌃`"><ChevronDown size={12} /> hide</button
      >
    </div>
  </div>
  <div class="min-h-0 flex-1 pl-3" bind:this={container}></div>
</div>
