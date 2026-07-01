<script lang="ts">
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import "@xterm/xterm/css/xterm.css";
  import { api } from "../lib/ipc";
  import X from "@lucide/svelte/icons/x";

  let { threadId, onClose }: { threadId: string; onClose: () => void } = $props();

  let container = $state<HTMLDivElement | null>(null);
  let exited = $state(false);
  let term = $state<Terminal | null>(null);

  // Fixed dark palette so the pane always reads as a terminal, regardless of
  // the app's light/dark theme.
  const xtermTheme = {
    background: "#0c0c0d",
    foreground: "#e4e4e7",
    cursor: "#e4e4e7",
    selectionBackground: "#3f3f46",
  };

  $effect(() => {
    if (!container) return;
    const currentThread = threadId;
    const t = new Terminal({
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: xtermTheme,
      cursorBlink: true,
    });
    term = t;
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.loadAddon(
      new WebLinksAddon((event, uri) => {
        event.preventDefault();
        void api.invoke("shell:openExternal", uri);
      }),
    );
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

<div class="flex h-56 shrink-0 flex-col border-t border-black/60 bg-[#0c0c0d]" data-testid="terminal-pane">
  <div class="flex h-8 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#161617] pr-2 pl-2">
    <!-- Active terminal tab -->
    <div class="flex h-full items-center gap-2 rounded-t-md bg-[#0c0c0d] px-3 text-[11px] text-zinc-300">
      <span
        class="size-1.5 rounded-full {exited ? 'bg-zinc-600' : 'bg-emerald-500'}"
        aria-hidden="true"
      ></span>
      <span class="font-mono">Terminal{exited ? " · exited" : ""}</span>
      <button
        class="ml-1 flex size-4 items-center justify-center rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
        onclick={() => {
          void api.invoke("terminal:kill", threadId);
          onClose();
        }}
        title="Close terminal (kills process)"
        aria-label="Close terminal"><X size={12} /></button
      >
    </div>
    <!-- Panel controls -->
    <button
      class="flex size-6 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
      onclick={onClose}
      title="Hide (process keeps running) — ⌘J"
      aria-label="Hide terminal"><X size={14} /></button
    >
  </div>
  <div class="min-h-0 flex-1 px-3 pt-1" bind:this={container}></div>
</div>
