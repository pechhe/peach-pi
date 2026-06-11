<script lang="ts">
  import type { Project, ResourceInspection, SkillInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let { projects, projectId }: { projects: Project[]; projectId: string | null } = $props();

  // svelte-ignore state_referenced_locally — initial scope only; user changes via select
  let scope = $state<string | null>(projectId);
  let inspection = $state<ResourceInspection | null>(null);
  let selected = $state<SkillInfo | null>(null);
  let content = $state<string>("");

  $effect(() => {
    const target = scope;
    inspection = null;
    selected = null;
    void api.invoke("resources:inspect", target).then((result) => {
      inspection = result;
      selected = result.skills[0] ?? null;
    });
  });

  $effect(() => {
    const skill = selected;
    content = "";
    if (skill) {
      void api
        .invoke("resources:readMarkdown", skill.filePath)
        .then((md) => {
          if (selected?.filePath === skill.filePath) content = md;
        })
        .catch(() => (content = skill.description));
    }
  });
</script>

<main class="flex h-full flex-1 flex-col" data-testid="skills-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center gap-3 px-6">
    <h1 class="text-sm font-medium text-zinc-300">Skills</h1>
    <select
      class="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 outline-none"
      value={scope ?? ""}
      onchange={(e) => (scope = e.currentTarget.value || null)}
    >
      <option value="">Global only</option>
      {#each projects as p (p.id)}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
    {#if inspection}
      <span class="text-xs text-zinc-600">{inspection.skills.length} skills</span>
    {/if}
  </header>

  <div class="flex min-h-0 flex-1">
    <div class="w-72 shrink-0 overflow-y-auto border-r border-zinc-800 px-2 pb-4">
      {#if !inspection}
        <p class="px-2 pt-2 text-xs text-zinc-600">Loading…</p>
      {:else}
        {#each inspection.skills as skill (skill.filePath)}
          <button
            class="block w-full rounded px-2 py-1.5 text-left
              {selected?.filePath === skill.filePath ? 'bg-zinc-800' : 'hover:bg-zinc-900'}"
            onclick={() => (selected = skill)}
          >
            <span class="block truncate text-sm text-zinc-200">{skill.name}</span>
            <span class="block truncate text-[11px] text-zinc-500">{skill.source}</span>
          </button>
        {:else}
          <p class="px-2 pt-2 text-xs text-zinc-600">No skills found.</p>
        {/each}
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto px-6 py-4">
      {#if selected}
        <h2 class="text-base font-medium text-zinc-100">{selected.name}</h2>
        <p class="mt-0.5 font-mono text-[11px] text-zinc-600">{selected.filePath}</p>
        <p class="mt-4 text-sm whitespace-pre-wrap text-zinc-300">{content}</p>
      {:else if inspection}
        <p class="text-sm text-zinc-600">Select a skill.</p>
      {/if}
    </div>
  </div>
</main>
