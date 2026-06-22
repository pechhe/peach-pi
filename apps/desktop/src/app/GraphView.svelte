<script lang="ts">
  import type { GraphifyStatus } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { clickCopy } from "../lib/code-copy";

  let { projectId }: { projectId: string | null } = $props();

  let status = $state<GraphifyStatus | null>(null);
  let report = $state<string | null>(null);
  let working = $state<"build" | "update" | null>(null);
  let error = $state("");

  async function refresh() {
    if (!projectId) return;
    status = await api.invoke("graphify:status", projectId);
    report = await api.invoke("graphify:report", projectId);
  }

  $effect(() => {
    void projectId;
    error = "";
    void refresh();
  });

  async function run(kind: "build" | "update") {
    if (working) return;
    working = kind;
    error = "";
    try {
      const result = await api.invoke(kind === "build" ? "graphify:build" : "graphify:update", projectId);
      if (!result.ok) error = result.error ?? "Failed";
      await refresh();
    } finally {
      working = null;
    }
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";
</script>

<main class="flex h-full flex-1 flex-col" data-testid="graph-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center px-6">
    <h1 class="text-sm font-medium text-fg-soft">Knowledge graph</h1>
  </header>

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-3xl flex-col gap-4">
      {#if !projectId}
        <p class="mt-12 text-center text-sm text-fainter">No project for this thread.</p>
      {:else if status}
        <div class="rounded-xl border border-border bg-surface/50 p-4">
          <div class="flex items-center justify-between">
            <div>
              {#if status.hasGraph}
                <p class="text-sm text-fg">
                  {status.nodeCount} nodes · {status.edgeCount} edges
                </p>
                <p class="mt-0.5 text-xs text-faint">Built {fmt(status.builtAt)}</p>
              {:else}
                <p class="text-sm text-muted">No graph yet for this project.</p>
                <p class="mt-0.5 text-xs text-faint">Build extracts concepts and clusters them into communities.</p>
              {/if}
            </div>
            <div class="flex gap-2">
              {#if status.hasGraph}
                <button
                  class="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-fg-soft transition-colors hover:bg-surface-2 disabled:opacity-40"
                  disabled={working !== null}
                  onclick={() => run("update")}
                >{working === "update" ? "Updating…" : "Update"}</button>
                <button
                  class="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-fg-soft transition-colors hover:bg-surface-2"
                  onclick={() => api.invoke("graphify:openViewer", projectId)}
                  data-testid="open-viewer"
                >Open viewer ↗</button>
              {/if}
              <button
                class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg transition-opacity disabled:opacity-40"
                disabled={working !== null || !status.available}
                onclick={() => run("build")}
                data-testid="graphify-build"
              >{working === "build" ? "Building…" : status.hasGraph ? "Rebuild" : "Build graph"}</button>
            </div>
          </div>
          {#if !status.available}
            <p class="mt-3 text-xs text-warning">
              graphify CLI not found — install with <span class="font-mono">uv tool install graphifyy</span>.
            </p>
          {/if}
          {#if working}
            <p class="mt-3 animate-pulse text-xs text-faint">
              Running graphify {working} — this can take several minutes on large repos…
            </p>
          {/if}
          {#if error}
            <pre class="mt-3 max-h-40 overflow-auto rounded-lg bg-bg p-2 text-[10px] text-danger" use:clickCopy={error}>{error}</pre>
          {/if}
        </div>

        {#if report}
          <div class="rounded-xl border border-border bg-surface/50 p-4">
            <h2 class="mb-2 text-xs font-medium tracking-wide text-faint uppercase">Graph report</h2>
            <pre class="overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap text-fg-soft">{report}</pre>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</main>
