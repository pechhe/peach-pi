<script lang="ts">
  import type { Project, SubagentAgentInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let { projects }: { projects: Project[] } = $props();

  let projectId = $state<string>("");
  let agents = $state<SubagentAgentInfo[]>([]);
  let selected = $state<SubagentAgentInfo | null>(null);

  $effect(() => {
    const id = projectId || null;
    void api.invoke("subagents:listAgents", id).then((list) => {
      agents = list;
      if (selected && !list.some((a) => a.filePath === selected!.filePath)) selected = null;
    });
  });
</script>

<main class="flex h-full flex-1 flex-col" data-testid="agents-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="text-sm font-medium text-fg-soft">Agents</h1>
    <select
      class="rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs text-fg-soft outline-none"
      bind:value={projectId}
    >
      <option value="">Global only</option>
      {#each projects as p (p.id)}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
  </header>

  <div class="flex min-h-0 flex-1">
    <div class="w-72 shrink-0 overflow-y-auto border-r border-border/70 px-3 pb-4">
      {#each agents as agent (agent.filePath)}
        <button
          class="mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors
            {selected?.filePath === agent.filePath ? 'bg-surface-2' : 'hover:bg-surface'}"
          onclick={() => (selected = agent)}
        >
          <div class="flex items-center gap-2">
            <span class="truncate text-sm text-fg">{agent.name}</span>
            {#if !agent.enabled}<span class="rounded bg-surface-2 px-1 text-[9px] text-faint">off</span>{/if}
            <span class="ml-auto shrink-0 text-[10px] text-fainter">{agent.scope}</span>
          </div>
          {#if agent.description}
            <p class="mt-0.5 line-clamp-2 text-xs text-faint">{agent.description}</p>
          {/if}
        </button>
      {:else}
        <p class="mt-8 px-3 text-center text-xs text-fainter">
          No agents found. Add markdown agent files to ~/.pi/agent/agents or &lt;project&gt;/.pi/agents.
        </p>
      {/each}
    </div>

    <div class="flex-1 overflow-y-auto px-6 py-4">
      {#if selected}
        <h2 class="text-base font-medium text-fg">{selected.name}</h2>
        <p class="mt-1 font-mono text-[11px] text-fainter">{selected.filePath}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          {#if selected.model}<span class="rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-muted">model: {selected.model}</span>{/if}
          {#if selected.thinking}<span class="rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-muted">thinking: {selected.thinking}</span>{/if}
          {#if selected.mode}<span class="rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-muted">mode: {selected.mode}</span>{/if}
        </div>
        <pre class="mt-4 rounded-xl border border-border bg-surface/50 p-4 text-xs leading-relaxed whitespace-pre-wrap text-fg-soft">{selected.body}</pre>
      {:else}
        <p class="mt-12 text-center text-sm text-fainter">
          Subagent roster — these agents are launched by pi's <span class="font-mono">subagent</span> tool.
        </p>
      {/if}
    </div>
  </div>
</main>
