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
  let creatingPr = $state(false);
  let commitMessage = $state("");
  let lastResult = $state("");

  // PR only makes sense on a feature branch (not the repo default branch).
  const canPr = $derived(
    !!info?.branch && !!info?.defaultBranch && info.branch !== info.defaultBranch,
  );

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

  async function createPr() {
    if (creatingPr) return;
    creatingPr = true;
    lastResult = "";
    try {
      const result = await api.invoke("git:createPr", thread.id);
      lastResult = result.ok ? `✓ Opened PR page` : `✕ ${result.error}`;
    } finally {
      creatingPr = false;
    }
  }

  const statusColor = (s: GitChangedFile["status"]) =>
    s === "added" || s === "untracked" ? "text-success"
    : s === "deleted" ? "text-danger"
    : "text-warning";
  const statusChar = (s: GitChangedFile["status"]) =>
    s === "untracked" ? "U" : s.charAt(0).toUpperCase();
</script>

{#if info?.isRepo}
  <div class="relative">
    <button
      class="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition-colors
        {open ? 'bg-surface-2 text-fg' : 'text-faint hover:bg-surface hover:text-fg-soft'}"
      onclick={toggle}
      data-testid="git-widget"
      title="Git status"
    >
      <span>⎇ {info.branch ?? "detached"}</span>
      {#if info.isWorktree}<span class="rounded bg-surface-2 px-1 text-[9px] text-muted">wt</span>{/if}
      {#if info.insertions || info.deletions}
        <span class="text-success">+{info.insertions}</span>
        <span class="text-danger">−{info.deletions}</span>
      {/if}
      {#if info.changedCount}
        <span class="rounded-full bg-surface-2 px-1.5 text-[10px] text-fg-soft">{info.changedCount}</span>
      {/if}
      {#if info.ahead}<span class="text-faint">↑{info.ahead}</span>{/if}
      {#if info.behind}<span class="text-faint">↓{info.behind}</span>{/if}
    </button>

    {#if open}
      <div
        class="absolute top-full right-0 z-30 mt-1 flex max-h-[60vh] w-[480px] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl shadow-black/50"
        data-testid="git-panel"
      >
        <div class="flex items-center gap-2 border-b border-border/80 px-3 py-2">
          <input
            class="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none placeholder:text-fainter focus:border-border-focus"
            placeholder="Commit message (empty = AI-generated)"
            bind:value={commitMessage}
            onkeydown={(e) => e.key === "Enter" && commitPush()}
          />
          <button
            class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg transition-opacity disabled:opacity-40"
            onclick={commitPush}
            disabled={committing || !info.changedCount}
            data-testid="commit-push"
          >
            {committing ? "Committing…" : "Commit & Push"}
          </button>
          {#if canPr}
            <button
              class="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg-soft transition-opacity hover:bg-surface disabled:opacity-40"
              onclick={createPr}
              disabled={creatingPr}
              data-testid="create-pr"
              title="Open a pull request on GitHub"
            >
              {creatingPr ? "Opening…" : "Create PR"}
            </button>
          {/if}
        </div>
        {#if lastResult}
          <p class="border-b border-border/80 px-3 py-1.5 text-[11px] {lastResult.startsWith('✓') ? 'text-success' : 'text-danger'}">
            {lastResult}
          </p>
        {/if}
        <div class="flex-1 overflow-y-auto py-1">
          {#each files as file (file.path)}
            <button
              class="flex w-full items-center gap-2 px-3 py-1 text-left font-mono text-[11px] transition-colors hover:bg-surface
                {selectedFile === file.path ? 'bg-surface' : ''}"
              onclick={() => showDiff(file.path)}
            >
              <span class={statusColor(file.status)}>{statusChar(file.status)}</span>
              <span class="truncate text-fg-soft">{file.path}</span>
            </button>
            {#if selectedFile === file.path}
              <pre class="max-h-64 overflow-auto border-y border-border/60 bg-surface/40 px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre">{#each diff.split("\n") as line, i (i)}<span class={line.startsWith("+") && !line.startsWith("+++") ? "text-success" : line.startsWith("-") && !line.startsWith("---") ? "text-danger" : line.startsWith("@@") ? "text-accent" : "text-muted"}>{line}
</span>{/each}</pre>
            {/if}
          {:else}
            <p class="px-3 py-3 text-center text-xs text-fainter">Working tree clean</p>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
