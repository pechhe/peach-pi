<script lang="ts">
  import type { GraphifyStatus, Project } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let { projects }: { projects: Project[] } = $props();

  let selectedId = $state<string>("");
  const projectId = $derived(selectedId || (projects[0]?.id ?? ""));
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
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="text-sm font-medium text-zinc-300">Knowledge graph</h1>
    <select
      class="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 outline-none"
      bind:value={
        () => projectId,
        (v) => (selectedId = v)
      }
    >
      {#each projects as p (p.id)}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
  </header>

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-3xl flex-col gap-4">
      {#if !projectId}
        <p class="mt-12 text-center text-sm text-zinc-600">Add a project first.</p>
      {:else if status}
        <div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div class="flex items-center justify-between">
            <div>
              {#if status.hasGraph}
                <p class="text-sm text-zinc-200">
                  {status.nodeCount} nodes · {status.edgeCount} edges
                </p>
                <p class="mt-0.5 text-xs text-zinc-500">Built {fmt(status.builtAt)}</p>
              {:else}
                <p class="text-sm text-zinc-400">No graph yet for this project.</p>
                <p class="mt-0.5 text-xs text-zinc-500">Build extracts concepts and clusters them into communities.</p>
              {/if}
            </div>
            <div class="flex gap-2">
              {#if status.hasGraph}
                <button
                  class="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
                  disabled={working !== null}
                  onclick={() => run("update")}
                >{working === "update" ? "Updating…" : "Update"}</button>
                <button
                  class="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
                  onclick={() => api.invoke("graphify:openViewer", projectId)}
                  data-testid="open-viewer"
                >Open viewer ↗</button>
              {/if}
              <button
                class="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 transition-opacity disabled:opacity-40"
                disabled={working !== null || !status.available}
                onclick={() => run("build")}
                data-testid="graphify-build"
              >{working === "build" ? "Building…" : status.hasGraph ? "Rebuild" : "Build graph"}</button>
            </div>
          </div>
          {#if !status.available}
            <p class="mt-3 text-xs text-amber-400">
              graphify CLI not found — install with <span class="font-mono">uv tool install graphifyy</span>.
            </p>
          {/if}
          {#if working}
            <p class="mt-3 animate-pulse text-xs text-zinc-500">
              Running graphify {working} — this can take several minutes on large repos…
            </p>
          {/if}
          {#if error}
            <pre class="mt-3 max-h-40 overflow-auto rounded-lg bg-zinc-950 p-2 text-[10px] text-red-400">{error}</pre>
          {/if}
        </div>

        {#if report}
          <div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h2 class="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Graph report</h2>
            <pre class="overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap text-zinc-300">{report}</pre>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</main>
