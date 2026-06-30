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
  let merging = $state(false);
  let pushingLocal = $state(false);
  let pulling = $state(false);
  let cleaningUp = $state(false);
  let commitMessage = $state("");
  let lastResult = $state("");
  // After a successful merge-to-local: open a dialog to commit (already done by
  // the merge) and optionally push <target> to origin. null = dialog closed.
  let pushPrompt = $state<string | null>(null);
  let pushChecked = $state(true);
  // After a merge-to-local conflict: the target branch to ask the agent to
  // merge into its worktree. null = no conflict pending.
  let conflictTarget = $state<string | null>(null);

  // PR only makes sense on a feature branch (not the repo default branch).
  const canPr = $derived(
    !!info?.branch && !!info?.defaultBranch && info.branch !== info.defaultBranch,
  );
  // Worktree, fully committed, branch exists, not yet merged back to local.
  const canMergeLocal = $derived(
    !!info?.isWorktree && info.changedCount === 0 && !!info.branch && !info.mergedToLocal,
  );
  // Worktree work already merged to local: offer cleanup / rejoin.
  const mergedClean = $derived(
    !!info?.isWorktree && info.changedCount === 0 && !!info.mergedToLocal,
  );

  async function refresh() {
    info = await api.invoke("git:info", thread.id);
    if (open) files = await api.invoke("git:changedFiles", thread.id);
  }

  // Refresh on thread switch and on every status change (incl. while running,
  // so the widget stays visible). Tracks id + status; not a poll.
  $effect(() => {
    void thread.id;
    void thread.status;
    void refresh();
  });

  function close() {
    open = false;
    // Drop the focus ring left on the toggle button
    requestAnimationFrame(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  }

  async function toggle() {
    open = !open;
    if (open) {
      files = await api.invoke("git:changedFiles", thread.id);
      selectedFile = null;
      lastResult = "";
    }
  }

  // Close on Escape key via window listener
  $effect(() => {
    if (!open) return;
    function onWindowKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onWindowKeydown);
    return () => window.removeEventListener("keydown", onWindowKeydown);
  });

  // Close on click outside via window listener
  $effect(() => {
    if (!open) return;
    function onWindowClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-testid='git-panel']") && !target.closest("[data-testid='git-widget']")) {
        close();
      }
    }
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  });

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

  async function mergeToLocal() {
    if (merging) return;
    merging = true;
    lastResult = "";
    pushPrompt = null;
    try {
      const result = await api.invoke("git:mergeToLocal", thread.id);
      conflictTarget = null;
      if (result.ok) {
        lastResult = result.warning
          ? `⚠ Merged ${result.branch} → ${result.target}; ${result.warning}`
          : `✓ Merged ${result.branch} → ${result.target}`;
        if (result.hasRemote && !result.warning) {
          pushChecked = true;
          pushPrompt = result.target;
        }
      } else {
        lastResult = `✕ ${result.error}`;
        if (result.conflict && result.target) conflictTarget = result.target;
      }
      await refresh();
    } finally {
      merging = false;
    }
  }

  // Dialog confirm: merge already committed locally; push only when ticked.
  async function confirmPush() {
    if (pushingLocal) return;
    if (!pushChecked) {
      pushPrompt = null;
      return;
    }
    pushingLocal = true;
    try {
      const result = await api.invoke("git:pushLocal", thread.id);
      lastResult = result.ok ? `✓ Pushed ${result.branch}` : `✕ ${result.error}`;
    } finally {
      pushingLocal = false;
      pushPrompt = null;
    }
  }

  // Hand the conflict to the agent in this chat: it merges <target> into this
  // worktree's branch (refs are shared), resolves, commits — then Merge to
  // local runs clean. Sends the prompt straight into the current thread.
  function askAgentToResolve() {
    const target = conflictTarget;
    if (!target) return;
    const prompt =
      `Merging this worktree's branch into \`${target}\` hit merge conflicts. ` +
      `Resolve it here in the worktree:\n\n` +
      `1. Run \`git merge ${target}\` (the branch is a shared ref, so this works from the worktree).\n` +
      `2. Resolve every conflicted file.\n` +
      `3. Commit the merge so the working tree is clean.\n\n` +
      `Once committed I'll click "Merge to local" again and it will merge cleanly.`;
    void api.invoke("threads:prompt", thread.id, prompt, [], "all").catch(console.error);
    conflictTarget = null;
    lastResult = "→ Asked the agent to resolve the conflict";
    close();
  }

  // Fast-forward the current branch from origin when behind.
  async function pull() {
    if (pulling) return;
    pulling = true;
    lastResult = "";
    try {
      const result = await api.invoke("git:pull", thread.id);
      lastResult = result.ok ? `✓ Pulled ${result.branch}` : `✕ ${result.error}`;
      await refresh();
      if (open) files = await api.invoke("git:changedFiles", thread.id);
    } finally {
      pulling = false;
    }
  }

  // Cleanup, post-merge. mode "delete" removes worktree + thread; mode "local"
  // keeps the thread (rejoins it to the local project repo).
  async function cleanup(mode: "delete" | "local") {
    if (cleaningUp) return;
    cleaningUp = true;
    try {
      await api.invoke(mode === "delete" ? "threads:delete" : "threads:bringToLocal", thread.id);
    } finally {
      cleaningUp = false;
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
        <span class="num-badge">{info.changedCount}</span>
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
          {#if info.behind}
            <button
              class="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg-soft transition-opacity hover:bg-surface disabled:opacity-40"
              onclick={pull}
              disabled={pulling}
              data-testid="git-pull"
              title={`Pull ${info.behind} commit${info.behind === 1 ? "" : "s"} from origin${info.ahead ? " (rebase local commits)" : " (--ff-only)"}`}
            >
              {pulling ? "Pulling…" : `Pull ↓${info.behind}`}
            </button>
          {/if}
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
          {#if canMergeLocal}
            <button
              class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg transition-opacity disabled:opacity-40"
              onclick={mergeToLocal}
              disabled={merging}
              data-testid="merge-to-local"
              title="Merge this worktree's branch into the local repo (--no-ff)"
            >
              {merging ? "Merging…" : "Merge to local"}
            </button>
          {:else if mergedClean}
            <button
              class="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg-soft transition-opacity hover:bg-surface disabled:opacity-40"
              onclick={() => cleanup("local")}
              disabled={cleaningUp}
              data-testid="merge-thread-local"
              title="Keep this thread, move it back to the local repo, and remove the worktree"
            >
              Move thread to local
            </button>
            <button
              class="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-danger transition-opacity hover:bg-surface disabled:opacity-40"
              onclick={() => cleanup("delete")}
              disabled={cleaningUp}
              data-testid="cleanup-delete"
              title="Delete this thread and remove the worktree"
            >
              Delete
            </button>
          {/if}
        </div>

        {#if lastResult}
          <p class="border-b border-border/80 px-3 py-1.5 text-[11px] {lastResult.startsWith('✓') || lastResult.startsWith('→') ? 'text-success' : 'text-danger'}">
            {lastResult}
          </p>
        {/if}
        {#if conflictTarget}
          <div class="flex items-center justify-between gap-2 border-b border-border/80 bg-surface/40 px-3 py-2">
            <span class="text-[11px] text-muted">Let the agent merge <span class="font-mono text-fg-soft">{conflictTarget}</span> in and resolve it.</span>
            <button
              class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg transition-opacity disabled:opacity-40"
              onclick={askAgentToResolve}
              data-testid="resolve-with-agent"
              title="Send a prompt to this chat asking the agent to merge and resolve the conflict"
            >
              Ask agent to resolve
            </button>
          </div>
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

{#if pushPrompt}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    data-testid="merge-push-dialog"
  >
    <div class="w-96 rounded-xl border border-border-strong bg-surface p-4 shadow-2xl">
      <h2 class="text-sm font-medium text-fg">Merged to local</h2>
      <p class="mt-1 text-xs text-muted">
        Committed the merge into <span class="font-mono text-fg-soft">{pushPrompt}</span>.
      </p>
      <label class="mt-3 flex items-center gap-2 text-xs text-fg-soft">
        <input type="checkbox" bind:checked={pushChecked} data-testid="merge-push-checkbox" />
        Push <span class="font-mono">{pushPrompt}</span> to origin
      </label>
      <div class="mt-4 flex justify-end gap-2">
        <button
          class="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2"
          onclick={() => (pushPrompt = null)}
        >
          Cancel
        </button>
        <button
          class="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg disabled:opacity-40"
          onclick={confirmPush}
          disabled={pushingLocal}
          data-testid="merge-push-confirm"
        >
          {pushingLocal ? "Pushing…" : pushChecked ? "Commit & push" : "Commit only"}
        </button>
      </div>
    </div>
  </div>
{/if}
