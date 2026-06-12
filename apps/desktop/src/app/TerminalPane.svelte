<script lang="ts">
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { api } from "../lib/ipc";

  let { threadId, onClose }: { threadId: string; onClose: () => void } = $props();

  let container = $state<HTMLDivElement | null>(null);
  let exited = $state(false);

  $effect(() => {
    if (!container) return;
    const currentThread = threadId;
    const term = new Terminal({
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: { background: "#101012", foreground: "#d4d4d8", cursor: "#a1a1aa" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();
    term.focus();

    const offData = api.on("event:terminalData", ({ threadId: id, data }) => {
      if (id === currentThread) term.write(data);
    });
    const offExit = api.on("event:terminalExit", ({ threadId: id, exitCode }) => {
      if (id !== currentThread) return;
      exited = true;
      term.write(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`);
    });
    term.onData((data) => void api.invoke("terminal:input", currentThread, data));

    void api.invoke("terminal:open", currentThread).then(({ buffer }) => {
      if (buffer) term.write(buffer);
      api.invoke("terminal:resize", currentThread, term.cols, term.rows);
    });

    const observer = new ResizeObserver(() => {
      fit.fit();
      void api.invoke("terminal:resize", currentThread, term.cols, term.rows);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      offData();
      offExit();
      term.dispose();
    };
  });
</script>

<div class="flex h-56 shrink-0 flex-col border-t border-zinc-800 bg-[#101012]" data-testid="terminal-pane">
  <div class="flex h-7 shrink-0 items-center justify-between px-3">
    <span class="text-[11px] text-zinc-500">Terminal {exited ? "· exited" : ""}</span>
    <div class="flex gap-1">
      <button
        class="rounded px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        onclick={() => {
          void api.invoke("terminal:kill", threadId);
          onClose();
        }}
        title="Kill terminal">✕ kill</button
      >
      <button
        class="rounded px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        onclick={onClose}
        title="Hide (process keeps running) — ⌃`">▾ hide</button
      >
    </div>
  </div>
  <div class="min-h-0 flex-1 pl-3" bind:this={container}></div>
</div>
