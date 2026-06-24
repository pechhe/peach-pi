<script lang="ts">
  import type { ModelInfo, Project, SubagentAgentInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";
  import { clickCopy } from "../lib/code-copy";

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

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-4">
    <div>
      <h2 class="text-sm text-fg">Subagents</h2>
      <p class="text-xs text-faint">
        Cheap models launched by pi's <code>subagent</code> tool for scouting,
        research, and verification. These stay unchanged day-to-day — tweak model
        or reasoning per agent if needed.
      </p>
    </div>
    <Select
      class="bg-surface-2 px-2 py-1 text-xs"
      bind:value={projectId}
      items={[{ value: "", label: "Global only" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
      aria-label="Agent scope"
    />
  </div>

  <div class="flex h-[26rem] min-h-0 rounded-md border border-border">
    <div class="w-64 shrink-0 overflow-y-auto border-r border-border/70 px-2 py-2">
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

    <div class="flex-1 overflow-y-auto px-4 py-3">
      {#if selected}
        <h3 class="text-sm font-medium text-fg">{selected.name}</h3>
        <p class="mt-1 font-mono text-[11px] text-fainter" use:clickCopy={selected.filePath}>{selected.filePath}</p>
        <div class="mt-3 grid max-w-md gap-3">
          <label class="grid gap-1">
            <span class="text-[10px] uppercase tracking-wide text-faint">Model</span>
            <Select
              class="bg-surface-2 px-2 py-1.5 text-xs"
              value={selected.model ?? ""}
              onValueChange={(v) => patchAgent("model", v)}
              items={[
                { value: "", label: "inherit (unset)" },
                ...models.map((m) => ({ value: `${m.provider}/${m.id}`, label: `${m.name} · ${m.provider}` })),
              ]}
              aria-label="Agent model"
            />
          </label>
          <label class="grid gap-1">
            <span class="text-[10px] uppercase tracking-wide text-faint">Reasoning</span>
            <Select
              class="bg-surface-2 px-2 py-1.5 text-xs"
              value={selected.thinking ?? ""}
              onValueChange={(v) => patchAgent("thinking", v)}
              items={[
                { value: "", label: "inherit (unset)" },
                ...THINKING_LEVELS.map((lvl) => ({ value: lvl, label: lvl })),
              ]}
              aria-label="Agent reasoning"
            />
          </label>
        </div>
        {#if selected.mode}<p class="mt-3 text-[10px] text-fainter">mode: {selected.mode}</p>{/if}
        <pre class="mt-3 rounded-lg border border-border bg-surface/50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-fg-soft">{selected.body}</pre>
      {:else}
        <p class="mt-12 text-center text-sm text-fainter">
          Select an agent to view or override its model and reasoning.
        </p>
      {/if}
    </div>
  </div>
</div>
