<script lang="ts">
  import type { ModelInfo, Project, SubagentAgentInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";

  let { projects }: { projects: Project[] } = $props();

  let projectId = $state<string>("");
  let agents = $state<SubagentAgentInfo[]>([]);
  let selected = $state<SubagentAgentInfo | null>(null);
  let models = $state<ModelInfo[]>([]);

  const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

  $effect(() => {
    const id = projectId || null;
    void api.invoke("subagents:listAgents", id).then((list) => {
      agents = list;
      if (selected && !list.some((a) => a.filePath === selected!.filePath)) selected = null;
    });
  });

  // Load scoped models once for the model picker.
  $effect(() => {
    if (models.length === 0) void api.invoke("app:listModels").then((m) => (models = m));
  });

  async function patchAgent(field: "model" | "thinking", value: string) {
    if (!selected) return;
    const filePath = selected.filePath;
    try {
      const updated = await api.invoke("subagents:updateAgent", filePath, { [field]: value || null });
      agents = agents.map((a) => (a.filePath === filePath ? updated : a));
      selected = updated;
    } catch (err) {
      console.error("updateAgent failed:", err);
    }
  }
</script>

<main class="flex h-full flex-1 flex-col" data-testid="agents-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="text-sm font-medium text-fg-soft">Agents</h1>
    <Select
      class="bg-surface px-2 py-1 text-xs"
      bind:value={projectId}
      items={[{ value: "", label: "Global only" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
    />
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
        <div class="mt-4 grid max-w-md gap-3">
          <label class="grid gap-1">
            <span class="text-[10px] uppercase tracking-wide text-faint">Model</span>
            <Select
              class="bg-surface px-2 py-1.5 text-xs"
              value={selected.model ?? ""}
              onValueChange={(v) => patchAgent("model", v)}
              items={[
                { value: "", label: "inherit (unset)" },
                ...models.map((m) => ({ value: `${m.provider}/${m.id}`, label: `${m.name} · ${m.provider}` })),
              ]}
            />
          </label>
          <label class="grid gap-1">
            <span class="text-[10px] uppercase tracking-wide text-faint">Reasoning</span>
            <Select
              class="bg-surface px-2 py-1.5 text-xs"
              value={selected.thinking ?? ""}
              onValueChange={(v) => patchAgent("thinking", v)}
              items={[
                { value: "", label: "inherit (unset)" },
                ...THINKING_LEVELS.map((lvl) => ({ value: lvl, label: lvl })),
              ]}
            />
          </label>
        </div>
        {#if selected.mode}<p class="mt-3 text-[10px] text-fainter">mode: {selected.mode}</p>{/if}
        <pre class="mt-4 rounded-xl border border-border bg-surface/50 p-4 text-xs leading-relaxed whitespace-pre-wrap text-fg-soft">{selected.body}</pre>
      {:else}
        <p class="mt-12 text-center text-sm text-fainter">
          Subagent roster — these agents are launched by pi's <span class="font-mono">subagent</span> tool.
        </p>
      {/if}
    </div>
  </div>
</main>
