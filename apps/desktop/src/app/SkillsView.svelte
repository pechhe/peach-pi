<script lang="ts">
  import type { Project, ResourceInspection, SkillInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { Select } from "../components/ui/select";
  import ConfirmDialog from "../components/ui/dialog/ConfirmDialog.svelte";
  import { clickCopy } from "../lib/code-copy";
  import Search from "@lucide/svelte/icons/search";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import Download from "@lucide/svelte/icons/download";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  let { projects, projectId }: { projects: Project[]; projectId: string | null } = $props();

  // svelte-ignore state_referenced_locally — initial scope only; user changes via select
  let scope = $state<string | null>(projectId);
  let inspection = $state<ResourceInspection | null>(null);
  let selected = $state<SkillInfo | null>(null);
  let content = $state<string>("");
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let saving = $state(false);
  let query = $state("");
  let loading = $state(false);

  let searchEl = $state<HTMLInputElement | null>(null);

  // Delete flow drives the confirm dialog.
  let pending = $state<SkillInfo | null>(null);
  let dialogOpen = $state(false);
  let removing = $state(false);
  let dialogError = $state("");

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

  async function refresh() {
    loading = true;
    try {
      inspection = await api.invoke("resources:inspect", scope);
      // Keep selection valid across refreshes.
      if (selected && !inspection.skills.some((s) => s.filePath === selected.filePath)) {
        selected = null;
        content = "";
      }
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const target = scope;
    selected = null;
    content = "";
    void refresh();
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

  const filtered = $derived.by(() => {
    const skills = inspection?.skills ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  });

  const groups = $derived.by(() => {
    // Group by source ("user" = global, "project" = project-local, others as-is).
    const order: string[] = [];
    const map = new Map<string, SkillInfo[]>();
    for (const s of filtered) {
      const key = s.source === "user" ? "Global" : s.source === "project" ? "Project" : cap(s.source);
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(s);
    }
    return order.map((key) => ({ key, items: map.get(key)! }));
  });

  function startRemove(skill: SkillInfo) {
    if (!skill.deletePath) return;
    dialogError = "";
    pending = skill;
    dialogOpen = true;
  }

  async function confirmRemove() {
    const skill = pending;
    if (!skill?.deletePath || removing) return;
    removing = true;
    dialogError = "";
    try {
      const res = await api.invoke("skills:delete", skill.deletePath);
      if (res.ok) {
        dialogOpen = false;
        pending = null;
        if (selected?.filePath === skill.filePath) {
          selected = null;
          content = "";
        }
        await refresh();
      } else {
        dialogError = res.error ?? "Failed.";
      }
    } catch (err) {
      dialogError = String(err);
    } finally {
      removing = false;
    }
  }

  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // Listen for cross-view resource changes (e.g. extension uninstall) and
  // re-inspect to keep the list fresh.
  $effect(() => {
    return api.on("event:resourcesChanged", () => void refresh());
  });
</script>

<main class="flex h-full flex-1" data-testid="skills-view">
  <!-- ── Sidebar ─────────────────────────────────────────────── -->
  <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-bg">
    <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-4">
      <h1 class="text-sm font-semibold text-fg">Skills</h1>
      <button
        class="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-fg"
        onclick={refresh}
        title="Refresh"
        aria-label="Refresh"
        data-testid="refresh-skills"
      ><RefreshCw size={15} class={loading ? "animate-spin" : ""} /></button>
    </header>

    <div class="px-3 pb-2">
      <div class="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 focus-within:border-border-focus">
        <Search size={14} class="shrink-0 text-muted" />
        <input
          bind:this={searchEl}
          class="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fainter"
          placeholder="Search skills…"
          bind:value={query}
          data-testid="skill-search"
        />
      </div>
    </div>

    <!-- Scope selector: global vs a specific project. -->
    <div class="px-3 pb-2">
      <Select
        class="rounded-lg bg-surface px-2 py-1 text-xs"
        value={scope ?? ""}
        onValueChange={(v) => (scope = v || null)}
        items={[{ value: "", label: "Global only" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
      />
    </div>

    <nav class="flex-1 overflow-y-auto px-2 pb-4">
      {#if loading && !inspection}
        <p class="px-2 pt-2 text-xs text-fainter">Loading…</p>
      {:else if filtered.length === 0}
        <p class="px-2 pt-3 text-xs text-fainter">
          {inspection && inspection.skills.length > 0 ? "No matching skills." : "No skills found."}
        </p>
      {:else}
        {#each groups as group (group.key)}
          <p class="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-fainter">{group.key}</p>
          {#each group.items as skill (skill.filePath)}
            <button
              class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
              class:bg-surface={selected?.filePath === skill.filePath}
              onclick={() => (selected = skill)}
              data-testid={`sidebar-skill`}
            >
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-muted"><BookOpen size={12} /></span>
              <span class="flex-1 truncate text-sm {selected?.filePath === skill.filePath ? 'text-fg' : 'text-muted'}">{skill.name}</span>
            </button>
          {/each}
        {/each}
      {/if}
    </nav>
  </aside>

  <!-- ── Detail ──────────────────────────────────────────────── -->
  <section class="flex flex-1 flex-col overflow-y-auto">
    {#if selected}
      <div class="mx-auto w-full max-w-3xl px-8 py-6">
        <div class="flex items-start gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted"><BookOpen size={16} /></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-lg font-semibold text-fg">{selected.name}</h2>
              <span class="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-muted">{cap(selected.source)}</span>
            </div>
            <p class="mt-0.5 truncate font-mono text-[11px] text-fainter" use:clickCopy={selected.filePath}>{selected.filePath}</p>
            {#if selected.description}
              <p class="mt-2 text-sm text-fg-soft">{selected.description}</p>
            {/if}
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="copy-btn"
              onclick={copy}
              disabled={!content}
              title={copied ? "Copied" : "Copy"}
              aria-label={copied ? "Copied" : "Copy"}
            >
              {#if copied}<Check size={13} /><span>Copied</span>{:else}<Copy size={13} /><span>Copy</span>{/if}
            </button>
            <button
              class="copy-btn"
              onclick={download}
              disabled={saving || !content}
              title="Download"
              aria-label="Download"
            >
              <Download size={13} /><span>{saving ? "Saving…" : "Download"}</span>
            </button>
            {#if selected.deletePath}
              <button
                class="flex items-center gap-1.5 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm font-medium text-fg transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                onclick={() => startRemove(selected)}
                disabled={removing && pending?.filePath === selected.filePath}
                title={`Delete ${selected.deletePath}`}
                data-testid="delete-skill"
              >
                <Trash2 size={14} /><span>{removing && pending?.filePath === selected.filePath ? "Deleting…" : "Delete"}</span>
              </button>
            {/if}
          </div>
        </div>

        {#if content}
          <p class="mt-6 text-sm whitespace-pre-wrap text-fg-soft">{content}</p>
        {:else}
          <p class="mt-6 text-sm text-fainter">Loading content…</p>
        {/if}
      </div>
    {:else}
      <div class="flex flex-1 items-center justify-center text-sm text-fainter">
        {inspection && inspection.skills.length > 0 ? "Select a skill to view its details." : "No skills found."}
      </div>
    {/if}
  </section>
</main>

<ConfirmDialog
  bind:open={dialogOpen}
  title={`Delete ${pending?.name}?`}
  description={pending?.deletePath
    ? `Permanently deletes from disk:\n${pending.deletePath}\n\nChanges apply to new sessions.`
    : ""}
  confirmLabel="Delete"
  destructive
  busy={removing}
  error={dialogError}
  onConfirm={confirmRemove}
/>
