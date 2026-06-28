<script lang="ts">
  // Adapter host for the ported beui command palette. Replaces the bespoke
  // ⌘K overlay: builds a flat CommandItem[] from static commands, settings
  // deep-links, and async thread-search hits (debounced `threads:search` IPC),
  // and routes selection through the original App.svelte navigation callbacks.
  import type { AppView, ThreadSearchHit } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import CommandPalette, { type CommandItem } from "../lib/beui/command-palette.svelte";
  import { createRawSnippet } from "svelte";

  let {
    open,
    onSelect,
    onClose,
    onNewThread,
    onNewChat,
    onOpenView,
    onOpenSettings,
  }: {
    open: boolean;
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

  // ── Static command catalogue ──────────────────────────────────────────
  const commands: CommandItem[] = [
    { id: "new-thread", label: "New thread", hint: "⌘N", group: "Actions", keywords: ["new", "thread", "create"], onSelect: () => onNewThread() },
    { id: "new-chat", label: "New chat", group: "Actions", keywords: ["new", "chat"], onSelect: () => onNewChat() },
    { id: "settings", label: "Settings", hint: "⌘,", group: "Actions", keywords: ["settings", "preferences"], onSelect: () => onOpenView("settings") },
    { id: "skills", label: "Skills", group: "Actions", keywords: ["skills"], onSelect: () => onOpenView("skills") },
    { id: "extensions", label: "Extensions", group: "Actions", keywords: ["extensions"], onSelect: () => onOpenView("extensions") },
    { id: "automations", label: "Automations", group: "Actions", keywords: ["automations"], onSelect: () => onOpenView("automations") },
  ];

  /** Settings sections the palette can deep-link into (mirrors SettingsView). */
  const settingsSections: { label: string; query: string; keywords: string[] }[] = [
    { label: "Theme", query: "theme", keywords: ["theme", "appearance", "colors"] },
    { label: "Composer appearance", query: "composer", keywords: ["composer", "light", "dark", "chassis"] },
    { label: "Caveman intensity", query: "caveman", keywords: ["caveman", "intensity", "level"] },
    { label: "HUD auto-reveal", query: "hud", keywords: ["hud", "auto", "reveal", "expand"] },
    { label: "Done animation", query: "done animation", keywords: ["done", "animation", "card", "preview"] },
    { label: "Streaming text", query: "streaming", keywords: ["streaming", "reveal", "text", "stream"] },
    { label: "Sounds", query: "sounds", keywords: ["sounds", "mute", "clicks", "chime"] },
    { label: "Done chime", query: "done chime", keywords: ["done", "chime", "sound", "celebration"] },
    { label: "Auto-compaction", query: "auto-compact", keywords: ["auto", "compaction", "context", "tokens", "threshold"] },
    { label: "Retry on error", query: "retry", keywords: ["retry", "error", "backoff", "network"] },
    { label: "Message delivery", query: "message delivery", keywords: ["steering", "follow-up", "delivery", "mode"] },
    { label: "Utility model", query: "utility model", keywords: ["utility", "model", "background", "titles", "commit"] },
    { label: "Scoped models", query: "open:scopedModels", keywords: ["scoped", "models", "enable", "disable", "scope", "composer", "selector"] },
    { label: "About", query: "about", keywords: ["about", "version"] },
  ];

  const settingsItems = $derived(
    settingsSections.map(
      (s): CommandItem => ({
        id: `settings-${s.query}`,
        label: `Settings: ${s.label}`,
        group: "Settings",
        keywords: s.keywords,
        onSelect: () => onOpenSettings(s.query),
      }),
    ),
  );

  // ── Async thread search (debounced `threads:search` IPC) ──────────────
  let threadHits = $state<ThreadSearchHit[]>([]);
  let loading = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function runSearch(query: string) {
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
  }

  const threadItems = $derived(
    threadHits.map(
      (hit): CommandItem => ({
        id: `thread-${hit.threadId}`,
        label: hit.title,
        group: "Threads",
        description: hit.snippet ? text(hit.snippet) : undefined,
        badge: text(hit.projectName || "Chat"),
        disableFilter: true,
        onSelect: () => onSelect(hit.threadId, hit.snippet ? latestQuery.trim() : undefined),
      }),
    ),
  );

  const text = (s: string) => createRawSnippet(() => ({ render: () => s }));

  let latestQuery = $state("");
  const onQueryChange = (value: string) => {
    latestQuery = value;
    runSearch(value);
  };

  const commandItems = $derived(
    latestQuery.trim() === ""
      ? [...commands, ...settingsItems]
      : [...commands, ...settingsItems, ...threadItems],
  );
</script>

<CommandPalette
  items={commandItems}
  {open}
  shortcut=""
  placeholder="Search threads, settings, or run a command…"
  emptyMessage={loading ? "Searching…" : "No matches."}
  {loading}
  {onQueryChange}
  onOpenChange={(v: boolean) => { if (!v) onClose(); }}
/>
