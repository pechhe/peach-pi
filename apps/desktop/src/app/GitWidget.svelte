<script lang="ts">
  import type { GitChangedFile, GitInfo, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let { thread }: { thread: Thread } = $props();

  let info = $state<GitInfo | null>(null);
  let open = $state(false);
  let files = $state<GitChangedFile[]>([]);
  let selectedFile = $state<string | null>(null);
  let diff = $state("");
  let committing = $state(false);
  let commitMessage = $state("");
  let lastResult = $state("");

  async function refresh() {
    info = await api.invoke("git:info", thread.id);
    if (open) files = await api.invoke("git:changedFiles", thread.id);
  }

  // Refresh on thread switch and whenever a run finishes.
  $effect(() => {
    void thread.id;
    if (thread.status !== "running") void refresh();
  });

  async function toggle() {
    open = !open;
    if (open) {
      files = await api.invoke("git:changedFiles", thread.id);
      selectedFile = null;
      lastResult = "";
    }
  }

  async function showDiff(path: string) {
    if (selectedFile === path) {
      selectedFile = null;
      return;
    }
    selectedFile = path;
    diff = await api.invoke("git:fileDiff", thread.id, path);
  }

  async function commitPush() {
    if (committing) return;
    committing = true;
    lastResult = "";
    try {
      const result = await api.invoke("git:commitPush", thread.id, commitMessage || undefined);
      lastResult = result.ok
        ? `✓ ${result.message} → ${result.branch}${result.pushed ? "" : " (push failed)"}`
        : `✕ ${result.error}`;
      commitMessage = "";
      await refresh();
      files = await api.invoke("git:changedFiles", thread.id);
    } finally {
      committing = false;
    }
  }

  const statusColor = (s: GitChangedFile["status"]) =>
    s === "added" || s === "untracked" ? "text-emerald-400"
    : s === "deleted" ? "text-red-400"
    : "text-amber-400";
  const statusChar = (s: GitChangedFile["status"]) =>
    s === "untracked" ? "U" : s.charAt(0).toUpperCase();
</script>

{#if info?.isRepo}
  <div class="relative">
    <button
      class="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition-colors
        {open ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'}"
      onclick={toggle}
      data-testid="git-widget"
      title="Git status"
    >
      <span>⎇ {info.branch ?? "detached"}</span>
      {#if info.isWorktree}<span class="rounded bg-zinc-800 px-1 text-[9px] text-zinc-400">wt</span>{/if}
      {#if info.insertions || info.deletions}
        <span class="text-emerald-500">+{info.insertions}</span>
        <span class="text-red-400">−{info.deletions}</span>
      {/if}
      {#if info.changedCount}
        <span class="rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-300">{info.changedCount}</span>
      {/if}
      {#if info.ahead}<span class="text-zinc-500">↑{info.ahead}</span>{/if}
      {#if info.behind}<span class="text-zinc-500">↓{info.behind}</span>{/if}
    </button>

    {#if open}
      <div
        class="absolute top-full right-0 z-30 mt-1 flex max-h-[60vh] w-[480px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50"
        data-testid="git-panel"
      >
        <div class="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
          <input
            class="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-600"
            placeholder="Commit message (empty = AI-generated)"
            bind:value={commitMessage}
            onkeydown={(e) => e.key === "Enter" && commitPush()}
          />
          <button
            class="shrink-0 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-900 transition-opacity disabled:opacity-40"
            onclick={commitPush}
            disabled={committing || !info.changedCount}
            data-testid="commit-push"
          >
            {committing ? "Committing…" : "Commit & Push"}
          </button>
        </div>
        {#if lastResult}
          <p class="border-b border-zinc-800/80 px-3 py-1.5 text-[11px] {lastResult.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}">
            {lastResult}
          </p>
        {/if}
        <div class="flex-1 overflow-y-auto py-1">
          {#each files as file (file.path)}
            <button
              class="flex w-full items-center gap-2 px-3 py-1 text-left font-mono text-[11px] transition-colors hover:bg-zinc-900
                {selectedFile === file.path ? 'bg-zinc-900' : ''}"
              onclick={() => showDiff(file.path)}
            >
              <span class={statusColor(file.status)}>{statusChar(file.status)}</span>
              <span class="truncate text-zinc-300">{file.path}</span>
            </button>
            {#if selectedFile === file.path}
              <pre class="max-h-64 overflow-auto border-y border-zinc-800/60 bg-zinc-900/40 px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre">{#each diff.split("\n") as line, i (i)}<span class={line.startsWith("+") && !line.startsWith("+++") ? "text-emerald-400" : line.startsWith("-") && !line.startsWith("---") ? "text-red-400" : line.startsWith("@@") ? "text-sky-400" : "text-zinc-400"}>{line}
</span>{/each}</pre>
            {/if}
          {:else}
            <p class="px-3 py-3 text-center text-xs text-zinc-600">Working tree clean</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
