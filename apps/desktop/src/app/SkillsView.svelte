<script lang="ts">
  import type { Project, ResourceInspection, SkillInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";

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
    <h1 class="text-sm font-medium text-fg-soft">Skills</h1>
    <Select
      class="rounded bg-surface px-2 py-0.5 text-xs"
      value={scope ?? ""}
      onValueChange={(v) => (scope = v || null)}
      items={[{ value: "", label: "Global only" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
    />
    {#if inspection}
      <span class="text-xs text-fainter">{inspection.skills.length} skills</span>
    {/if}
  </header>

  <div class="flex min-h-0 flex-1">
    <div class="w-72 shrink-0 overflow-y-auto border-r border-border px-2 pb-4">
      {#if !inspection}
        <p class="px-2 pt-2 text-xs text-fainter">Loading…</p>
      {:else}
        {#each inspection.skills as skill (skill.filePath)}
          <button
            class="block w-full rounded px-2 py-1.5 text-left
              {selected?.filePath === skill.filePath ? 'bg-surface-2' : 'hover:bg-surface'}"
            onclick={() => (selected = skill)}
          >
            <span class="block truncate text-sm text-fg">{skill.name}</span>
            <span class="block truncate text-[11px] text-faint">{skill.source}</span>
          </button>
        {:else}
          <p class="px-2 pt-2 text-xs text-fainter">No skills found.</p>
        {/each}
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto px-6 py-4">
      {#if selected}
        <h2 class="text-base font-medium text-fg">{selected.name}</h2>
        <p class="mt-0.5 font-mono text-[11px] text-fainter">{selected.filePath}</p>
        <p class="mt-4 text-sm whitespace-pre-wrap text-fg-soft">{content}</p>
      {:else if inspection}
        <p class="text-sm text-fainter">Select a skill.</p>
      {/if}
    </div>
  </div>
</main>
