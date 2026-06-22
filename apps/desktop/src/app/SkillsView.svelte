<script lang="ts">
  import type { Project, ResourceInspection, SkillInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import Download from "@lucide/svelte/icons/download";

  let { projects, projectId }: { projects: Project[]; projectId: string | null } = $props();

  // svelte-ignore state_referenced_locally — initial scope only; user changes via select
  let scope = $state<string | null>(projectId);
  let inspection = $state<ResourceInspection | null>(null);
  let selected = $state<SkillInfo | null>(null);
  let content = $state<string>("");
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let saving = $state(false);

  function copy() {
    if (!content) return;
    void navigator.clipboard.writeText(content).then(() => {
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 1500);
    });
  }

  async function download() {
    const skill = selected;
    if (!skill) return;
    saving = true;
    try {
      await api.invoke("skills:save", skill.name, skill.filePath);
    } finally {
      saving = false;
    }
  }

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
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-medium text-fg">{selected.name}</h2>
            <p class="mt-0.5 font-mono text-[11px] text-fainter">{selected.filePath}</p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              class="copy-btn"
              onclick={copy}
              disabled={!content}
              title={copied ? "Copied" : "Copy"}
              aria-label={copied ? "Copied" : "Copy"}
            >
              {#if copied}
                <Check size={13} />
                <span>Copied</span>
              {:else}
                <Copy size={13} />
                <span>Copy</span>
              {/if}
            </button>
            <button
              class="copy-btn"
              onclick={download}
              disabled={saving || !content}
              title="Download"
              aria-label="Download"
            >
              <Download size={13} />
              <span>{saving ? "Saving…" : "Download"}</span>
            </button>
          </div>
        </div>
        <p class="mt-4 text-sm whitespace-pre-wrap text-fg-soft">{content}</p>
      {:else if inspection}
        <p class="text-sm text-fainter">Select a skill.</p>
      {/if}
    </div>
  </div>
</main>
