<script lang="ts">
  import type { AppView, Project, Thread, ThreadSearchHit } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let {
    projects,
    threads,
    onSelect,
    onClose,
    onNewThread,
    onNewChat,
    onOpenView,
    onOpenSettings,
  }: {
    projects: Project[];
    threads: Thread[];
    /** `findQuery` is passed when a body match was clicked — ThreadView will
     *  open its FindBar pre-filled with the original search term. */
    onSelect: (threadId: string, findQuery?: string) => void;
    onClose: () => void;
    onNewThread: () => void;
    onNewChat: () => void;
    onOpenView: (view: AppView) => void;
    /** Jump to Settings, optionally pre-filling its own search box. */
    onOpenSettings: (query?: string) => void;
  } = $props();

  let query = $state("");
  let index = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);
  let loading = $state(false);

  const projectName = (id: string | null) =>
    id === null ? "Chat" : (projects.find((p) => p.id === id)?.name ?? "");

  // ── Static command catalogue ──────────────────────────────────────────
  type Command = { label: string; hint?: string; keywords: string; run: () => void };

  const commands: Command[] = [
    { label: "New thread", hint: "⌘N", keywords: "new thread create", run: () => onNewThread() },
    { label: "New chat", keywords: "new chat", run: () => onNewChat() },
    { label: "Settings", hint: "⌘,", keywords: "settings preferences", run: () => onOpenView("settings") },
    { label: "Skills", keywords: "skills", run: () => onOpenView("skills") },
    { label: "Extensions", keywords: "extensions", run: () => onOpenView("extensions") },
    { label: "Automations", keywords: "automations", run: () => onOpenView("automations") },
    { label: "Agents", keywords: "agents subagents", run: () => onOpenView("agents") },
    { label: "Knowledge graph", keywords: "graph knowledge", run: () => onOpenView("graph") },
  ];

  /** Settings sections the palette can deep-link into (mirrors SettingsView). */
  const settingsSections: { label: string; query: string; keywords: string }[] = [
    { label: "Theme", query: "theme", keywords: "theme appearance colors" },
    { label: "Composer appearance", query: "composer", keywords: "composer light dark chassis" },
    { label: "Caveman intensity", query: "caveman", keywords: "caveman intensity level" },
    { label: "HUD auto-reveal", query: "hud", keywords: "hud auto reveal expand" },
    { label: "Done animation", query: "done animation", keywords: "done animation card preview" },
    { label: "Streaming text", query: "streaming", keywords: "streaming reveal text stream" },
    { label: "Sounds", query: "sounds", keywords: "sounds mute clicks chime" },
    { label: "Done chime", query: "done chime", keywords: "done chime sound celebration" },
    { label: "Auto-compaction", query: "auto-compact", keywords: "auto compaction context tokens threshold" },
    { label: "Retry on error", query: "retry", keywords: "retry error backoff network" },
    { label: "Message delivery", query: "message delivery", keywords: "steering follow-up delivery mode" },
    { label: "Utility model", query: "utility model", keywords: "utility model background titles commit" },
    { label: "Scoped models", query: "open:scopedModels", keywords: "scoped models enable disable scope composer selector" },
    { label: "About", query: "about", keywords: "about version" },
  ];

  // ── Entries ───────────────────────────────────────────────────────────
  // Empty query → command catalogue only ("what you can do"). Typed query →
  // matching commands + matching settings + full-text thread hits.
  type Entry =
    | { kind: "command"; label: string; hint?: string; run: () => void }
    | { kind: "settings"; label: string; run: () => void }
    | { kind: "thread"; hit: ThreadSearchHit; run: () => void };

  const q = $derived(query.trim().toLowerCase());

  let threadHits = $state<ThreadSearchHit[]>([]);
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    // Debounce so we don't scan every JSONL on each keystroke.
    const trimmed = query.trim();
    if (timer) clearTimeout(timer);
    if (trimmed === "") {
      threadHits = [];
      loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(async () => {
      try {
        threadHits = await api.invoke("threads:search", trimmed);
      } catch {
        threadHits = [];
      } finally {
        loading = false;
      }
    }, 200);
  });

  const matchesCommand = (c: Command) =>
    q === "" || c.label.toLowerCase().includes(q) || c.keywords.includes(q);

  const entries = $derived<Entry[]>([
    ...commands
      .filter(matchesCommand)
      .map((c): Entry => ({ kind: "command", label: c.label, hint: c.hint, run: c.run })),
    ...(q === ""
      ? []
      : settingsSections
          .filter((s) => s.label.toLowerCase().includes(q) || s.keywords.includes(q))
          .map((s): Entry => ({
            kind: "settings",
            label: `Settings: ${s.label}`,
            run: () => onOpenSettings(s.query),
          }))),
    ...threadHits.map((hit): Entry => ({
      kind: "thread",
      hit,
      run: () => onSelect(hit.threadId, hit.snippet ? query.trim() : undefined),
    })),
  ]);

  const groupLabel = (kind: Entry["kind"]) =>
    kind === "command" ? "Actions" : kind === "settings" ? "Settings" : "Threads";

  $effect(() => {
    void entries;
    index = 0;
  });
  $effect(() => {
    inputEl?.focus();
  });

  function choose(entry: Entry) {
    entry.run();
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      index = (index + 1) % Math.max(1, entries.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      index = (index - 1 + entries.length) % Math.max(1, entries.length);
    }
    const entry = entries[index];
    if (e.key === "Enter" && entry) choose(entry);
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-32"
  style="padding-left: var(--content-left, 0px)"
  onclick={onClose}
  onkeydown={onKeydown}
  role="dialog"
  aria-label="Command palette"
  tabindex="-1"
>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    class="w-[32rem] overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl"
    onclick={(e) => e.stopPropagation()}
    data-testid="search-overlay"
  >
    <input
      bind:this={inputEl}
      bind:value={query}
      class="w-full bg-transparent px-4 py-3 text-sm outline-none"
      placeholder="Search threads, settings, or run a command…"
      data-testid="search-input"
    />
    <div class="max-h-80 overflow-y-auto py-1">
      {#each entries as entry, i (i)}
        {#if i === 0 || entries[i - 1]!.kind !== entry.kind}
          <p class="px-4 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-fainter">
            {groupLabel(entry.kind)}
          </p>
        {/if}
        <button
          class="flex w-full flex-col gap-0.5 px-4 py-1.5 text-left text-sm
            {i === index ? 'bg-surface-2' : ''} hover:bg-surface-2"
          onclick={() => choose(entry)}
        >
          {#if entry.kind === "thread"}
            <div class="flex items-baseline gap-2">
              <span class="truncate text-fg">{entry.hit.title}</span>
              <span class="ml-auto shrink-0 text-xs text-faint">{entry.hit.projectName || "Chat"}</span>
            </div>
            {#if entry.hit.snippet}
              <span class="line-clamp-2 text-xs text-fainter">{entry.hit.snippet}</span>
            {/if}
          {:else}
            <div class="flex items-baseline gap-2">
              <span class="truncate text-fg">{entry.label}</span>
              {#if entry.kind === "command" && entry.hint}
                <span class="ml-auto shrink-0 text-xs text-faint">{entry.hint}</span>
              {/if}
            </div>
          {/if}
        </button>
      {:else}
        <p class="px-4 py-3 text-xs text-fainter">
          {loading ? "Searching…" : "No matches."}
        </p>
      {/each}
    </div>
  </div>
</div>
