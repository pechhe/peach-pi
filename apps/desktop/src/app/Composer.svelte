<script lang="ts">
  import type { CommandInfo, Connection, CustomConnection, ReferencedConnection, ReferencedSecret, Thread } from "@peach-pi/shared-types";
  import { buildConnectionsHint, buildSecretsHint, composeOutgoingPrompt } from "../lib/composer/mode";
  import {
    extractFilesFromDataTransfer,
    extractImageFilePathsFromClipboardData,
    extractImageFilesFromClipboardData,
    hasFilesInDataTransfer,
    makeTextAttachment,
    readComposerAttachmentsFromFiles,
    readImageAttachmentsFromPaths,
    shouldPasteAsAttachment,
  } from "../lib/composer/attachments";
  import { playButtonClick, playClick, pressClick, playRotary } from "../lib/sound/button-click-sound";
  import FileText from "@lucide/svelte/icons/file-text";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import MessageSquareText from "@lucide/svelte/icons/message-square-text";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import Star from "@lucide/svelte/icons/star";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import X from "@lucide/svelte/icons/x";
  import Tooltip from "./Tooltip.svelte";
  import { drafts, queues } from "../stores/composer.svelte";
  import { lightbox } from "../stores/lightbox.svelte";
  import { textViewer } from "../stores/text-viewer.svelte";
  import { sessionMetas } from "../stores/session-meta.svelte";
  import { caveman } from "../stores/caveman.svelte";
  import { autoCompact } from "../stores/auto-compact.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { sideChat } from "../stores/side-chat.svelte";
  import { sendAnim } from "../stores/send-anim.svelte";
  import { commandPrefs } from "../stores/command-prefs.svelte";
  import { markAborted } from "../lib/composer/abort-signal.svelte";
  import { api } from "../lib/ipc";
  import { detectSecret, type DetectedSecret } from "../lib/secret-detect";
  import BwsSecretPrompt from "./BwsSecretPrompt.svelte";
  import ReasoningDial from "./composer/ReasoningDial.svelte";
  import ModelSelector from "./composer/ModelSelector.svelte";
  import ModelScopeSelect from "../components/ui/model-scope-select/model-scope-select.svelte";
  import QuickSlots from "./composer/QuickSlots.svelte";
  import ConnectorIcon from "./ConnectorIcon.svelte";

  let { thread, onRewind, onNewThread, centered = false }: {
    thread: Thread;
    /** `/rewind [n]` from the composer — rewind the n-th turn from the end. */
    onRewind?: (n: number) => void;
    /** `/new` system command — start a new thread in the current project. */
    onNewThread?: () => void;
    /** Centered "new thread" state (composer in the middle, no messages yet). */
    centered?: boolean;
  } = $props();

  const draft = $derived(drafts.for(thread.id));
  const queue = $derived(queues.for(thread.id));
  const running = $derived(thread.status === "running");
  const meta = $derived(sessionMetas.for(thread.id));

  /**
   * Where auto-compaction fires on the context bar: the smaller of the percent
   * threshold and the token threshold expressed as a percent of this model's
   * context window (matches the "whichever is reached first" main-process rule).
   */
  const autoCompactPercent = $derived.by(() => {
    const window = meta?.contextWindow;
    const tokenPercent =
      autoCompact.tokens != null && window ? (autoCompact.tokens / window) * 100 : Infinity;
    return Math.min(100, autoCompact.percent, tokenPercent);
  });

  /** Effective trigger expressed in tokens, for the marker tooltip. */
  const autoCompactTokens = $derived(
    meta?.contextWindow ? Math.round((autoCompactPercent / 100) * meta.contextWindow) : null,
  );

  $effect(() => {
    sessionMetas.ensure(thread.id);
    void sessionMetas.loadModels(thread.id);
  });
  void caveman.load();
  void autoCompact.load();
  commandPrefs.init();

  // Caveman is a toggle: pressing it in plays the down-click, releasing it
  // (toggling back off) plays the up-click — mirroring a real latching switch.
  function toggleCaveman() {
    playClick(caveman.enabled ? "up" : "down");
    void caveman.toggle(thread.id);
  }

  // Send button is momentary: it physically depresses (down-click) while held
  // and springs back up (up-click) on release. The release fires the actual
  // submit via the button's onclick; pointer-initiated clicks therefore skip
  // submit's own click sound to avoid stacking a second tone on top.
  let sendPressed = $state(false);
  // Whether an Enter-driven send should queue/steer (Cmd+Enter while running),
  // captured on keydown and consumed on the matching keyup.
  let enterSteer = false;
  // Holds the up-click released on send spring-back; pressClick spaces it off
  // the down-click so a fast Enter tap doesn't smear the two into one sound.
  let releaseSendClick: (() => void) | null = null;
  // Same press/release spacing for the BTW (side-chat) toggle button.
  let btwRelease: (() => void) | null = null;
  function pressSend(): void {
    sendPressed = true;
    releaseSendClick = pressClick();
  }
  function releaseSend(playUp: boolean): void {
    if (!sendPressed) return;
    sendPressed = false;
    const r = releaseSendClick;
    releaseSendClick = null;
    if (playUp) r?.();
  }

  // Quick-slot helpers. A skill slot injects its chip into the composer; an
  // extension/prompt/system slot runs its slash command; a toggle slot runs a
  // raw on/off command string against the live session.
  function injectSkill(cmd: CommandInfo) {
    playButtonClick("click");
    drafts.update(thread.id, { command: { name: cmd.name, kind: "skill" } });
    textareaEl?.focus();
  }
  function runRawCommand(raw: string) {
    if (!raw) return;
    playButtonClick("click");
    void api.invoke("threads:runCommand", thread.id, raw).catch((err) => {
      console.error("slot command failed", err);
    });
  }
  // The slash command list loads lazily; the slot picker needs it on demand.
  function ensureCommands() {
    if (commandsLoadedFor !== thread.id) {
      commandsLoadedFor = thread.id;
      void api.invoke("threads:listCommands", thread.id).then((c) => (commands = c));
    }
  }

  async function pickModel(provider: string, id: string) {
    playRotary();
    sessionMetas.set(await api.invoke("threads:setModel", thread.id, provider, id));
  }

  const fmtTokens = (n: number | null | undefined): string => {
    if (n == null) return "\u2014";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(Math.round(n));
  };

  async function cycleThinking(direction: 1 | -1 = 1) {
    if (!meta) return;
    const levels = meta.availableThinkingLevels;
    if (levels.length === 0) return;
    const idx = levels.indexOf(meta.thinkingLevel);
    const next = levels[(idx + direction + levels.length) % levels.length]!;
    playRotary();
    sessionMetas.set(await api.invoke("threads:setThinking", thread.id, next));
  }

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  // The inline command chip overlays the textarea's first line; its measured
  // width feeds the textarea's text-indent so typed text flows after it.
  let chipEl = $state<HTMLElement | null>(null);
  let chipWidth = $state(0);
  $effect(() => {
    void draft.command;
    chipWidth = chipEl?.offsetWidth ?? 0;
  });
  // Imperative handle into ModelSelector for ⌘1–4 keyboard shortcuts.
  let modelSelector = $state<{ selectSlot: (index: number) => void; openMenu: () => void } | null>(null);
  // Imperative handle for the inline `/scoped-models` floating panel.
  let scopedModelsPanel = $state<{ openScopedModels: () => Promise<void> } | null>(null);
  // Esc-to-stop is a two-press confirm to avoid accidental aborts.
  let abortArmed = $state(false);
  let dragActive = $state(false);
  // Set when a pasted token looks like a secret; shows the "store in BWS" offer.
  let pastedSecret = $state<DetectedSecret | null>(null);
  let commands = $state<CommandInfo[]>([]);
  let commandsLoadedFor = $state<string | null>(null);
  let slashIndex = $state(0);
  // Active browse filter for the slash menu ("starred", "all", or a kind).
  type SlashFilter = "starred" | "all" | CommandInfo["kind"];
  let slashFilter = $state<SlashFilter>("starred");
  // Caret position, tracked so the slash menu can trigger anywhere (not just
  // at the start of the message).
  let cursor = $state(0);

  function syncCursor() {
    cursor = textareaEl?.selectionStart ?? 0;
    // Auto-dismiss the BWS store prompt once the pasted secret value is no
    // longer in the textarea (backspace / cut / select-all-delete). We read
    // textareaEl.value directly (always current at input time) rather than
    // draft.text, which can lag a flush and prematurely clear the prompt.
    const ps = pastedSecret;
    if (ps && textareaEl && !textareaEl.value.includes(ps.value)) {
      pastedSecret = null;
    }
  }

  // Enter release springs the send button back up and fires the actual send.
  // Guarded on sendPressed so menu-completing Enters (which never depress the
  // button) don't submit on key release.
  function onKeyup(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && sendPressed) {
      releaseSend(true);
      void submit(enterSteer, true);
    }
    syncCursor();
  }

  // ── Slash menu ─────────────────────────────────────────────────────────
  // The active `/token` immediately left of the caret: must start the line or
  // follow whitespace, and contain no whitespace itself.
  const slashContext = $derived.by(() => {
    void draft.text; // re-evaluate as the text changes
    const before = draft.text.slice(0, cursor);
    const slash = before.lastIndexOf("/");
    if (slash === -1) return null;
    if (slash > 0 && !/\s/.test(before[slash - 1]!)) return null;
    const token = before.slice(slash + 1);
    if (/\s/.test(token)) return null;
    return { start: slash, query: token.toLowerCase() };
  });
  const slashQuery = $derived(slashContext?.query ?? null);
  // GUI-native "system" commands: slash aliases that fire the GUI flow
  // (never sent to pi). See runSystemCommand for the wiring.
  const systemCommandList: CommandInfo[] = [
    { name: "model", description: "Choose the model", kind: "system" },
    { name: "compact", description: "Compact the conversation", kind: "system" },
    { name: "rewind", description: "Rewind the last turn (/rewind [n])", kind: "system" },
    { name: "btw", description: "Ask a side question (/btw <question>)", kind: "system" },
    { name: "plan", description: "Switch to Plan mode", kind: "system" },
    { name: "build", description: "Switch to Build mode", kind: "system" },
    { name: "new", description: "Start a new thread in this project", kind: "system" },
    { name: "reload", description: "Reload extensions/skills/prompts from disk", kind: "system" },
    { name: "scoped-models", description: "Pick which models appear in the composer", kind: "system" },
  ];
  const systemCommandNames = new Set(systemCommandList.map((c) => c.name));
  const allCommands = $derived<CommandInfo[]>([...systemCommandList, ...commands]);
  const starKey = (c: CommandInfo) => `${c.kind}:${c.name}`;
  const hasStarred = $derived(allCommands.some((c) => commandPrefs.isStarred(starKey(c))));
  // While searching, "Starred" (the browse default) widens to "All" so a query
  // finds everything; an explicitly chosen tab still narrows the search. Used
  // for both matching and the active-tab highlight.
  const effectiveFilter = $derived<SlashFilter>(
    slashQuery && slashFilter === "starred" ? "all" : slashFilter,
  );
  const slashMatches = $derived.by(() => {
    if (slashQuery === null) return [];
    const filter = effectiveFilter;
    return allCommands
      .filter((c) =>
        filter === "all"
          ? true
          : filter === "starred"
            ? commandPrefs.isStarred(starKey(c))
            : c.kind === filter,
      )
      .filter((c) => c.name.toLowerCase().includes(slashQuery))
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(slashQuery) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(slashQuery) ? 0 : 1;
        return ap - bp;
      })
      .slice(0, 50);
  });
  // Kinds that actually have commands — drives which browse tabs to show.
  const slashKindsPresent = $derived(new Set(allCommands.map((c) => c.kind)));

  $effect(() => {
    if (slashQuery !== null && commandsLoadedFor !== thread.id) {
      commandsLoadedFor = thread.id;
      void api.invoke("threads:listCommands", thread.id).then((c) => (commands = c));
    }
  });
  $effect(() => {
    void slashMatches;
    slashIndex = 0;
  });
  // Reset the browse filter each time the menu closes: reopen on "Starred" if
  // anything is starred, otherwise "All".
  $effect(() => {
    if (slashQuery === null) slashFilter = hasStarred ? "starred" : "all";
  });

  const commandKindLabel: Record<CommandInfo["kind"], string> = {
    skill: "skill",
    extension: "extension",
    prompt: "prompt",
    system: "system",
  };
  // Per-kind badge colour so skills/extensions/prompts/system read apart.
  const commandKindBadge: Record<CommandInfo["kind"], string> = {
    skill: "bg-emerald-500/15 text-emerald-700",
    extension: "bg-sky-500/15 text-sky-700",
    prompt: "bg-violet-500/15 text-violet-700",
    system: "bg-amber-500/15 text-amber-700",
  };
  const slashTabs: Array<{ key: SlashFilter; label: string }> = [
    { key: "starred", label: "Starred" },
    { key: "all", label: "All" },
    { key: "system", label: "System" },
    { key: "extension", label: "Extensions" },
    { key: "skill", label: "Skills" },
    { key: "prompt", label: "Prompts" },
  ];
  // Visible tabs in order (Starred + All + kinds that have commands); Tab
  // cycles these.
  const slashVisibleTabs = $derived(
    slashTabs.filter(
      (t) =>
        t.key === "all" ||
        t.key === "starred" ||
        slashKindsPresent.has(t.key as CommandInfo["kind"]),
    ),
  );
  function cycleSlashFilter(dir: 1 | -1) {
    const keys = slashVisibleTabs.map((t) => t.key);
    const i = keys.indexOf(slashFilter);
    slashFilter = keys[(i + dir + keys.length) % keys.length]!;
  }

  const commandIcon = {
    skill: BookOpen,
    extension: Puzzle,
    prompt: MessageSquareText,
    system: SlidersHorizontal,
  };

  // Skills collapse into an editable chip (they usually take a prompt body);
  // system commands fire a GUI action; extension/prompt commands run via pi.
  function pickSlash(cmd: CommandInfo) {
    const ctx = slashContext;
    const text = draft.text;
    const stripped = ctx ? text.slice(0, ctx.start) + text.slice(cursor) : "";
    if (cmd.kind === "system") {
      drafts.clearText(thread.id);
      runSystemCommand(cmd.name, stripped.trim());
      return;
    }
    if (cmd.kind !== "skill") {
      runSlashCommand(cmd, stripped.trim());
      return;
    }
    drafts.update(thread.id, { command: { name: cmd.name, kind: cmd.kind }, text: stripped });
    textareaEl?.focus();
    requestAnimationFrame(syncCursor);
  }

  // System commands are slash aliases for GUI-native flows — never sent to pi.
  function runSystemCommand(name: string, body: string) {
    playButtonClick("click");
    switch (name) {
      case "model":
        modelSelector?.openMenu();
        break;
      case "compact":
        void api.invoke("threads:compact", thread.id);
        break;
      case "rewind":
        onRewind?.(/^\d+$/.test(body) ? Number(body) : 1);
        break;
      case "btw":
        void sideChat.openPanel(thread.id, body || undefined);
        break;
      case "plan":
        drafts.update(thread.id, { mode: "plan" });
        break;
      case "build":
        drafts.update(thread.id, { mode: "build" });
        break;
      case "new":
        onNewThread?.();
        break;
      case "reload":
        void api.invoke("threads:reload", thread.id).then((res) => {
          if (!res.ok) extensionUi.notify(res.error ?? "Reload failed.", undefined, "error");
        });
        break;
      case "scoped-models":
        void scopedModelsPanel?.openScopedModels();
        break;
    }
  }

  // Run an extension/prompt command now: send `/<name> [body]` as a prompt
  // (the pi session executes the slash command natively).
  function runSlashCommand(cmd: CommandInfo, body: string) {
    const outgoing = [`/${cmd.name}`, body].filter(Boolean).join(" ");
    playButtonClick("click");
    drafts.clearText(thread.id);
    void api.invoke("threads:prompt", thread.id, outgoing, [], "all").catch((err) => {
      console.error("run command failed", err);
    });
  }

  function removeCommand() {
    drafts.update(thread.id, { command: null });
    textareaEl?.focus();
  }

  // Typing a full `/<name> ` (known skill, leading) collapses into a chip.
  // Extension/prompt commands are left as text — submit() runs them via its
  // slash path, and they never show a chip.
  $effect(() => {
    if (draft.command) return;
    const m = /^\/(\S+)\s/.exec(draft.text);
    if (!m) return;
    const name = m[1]!;
    const cmd = commands.find((c) => c.name === name);
    if (!cmd || cmd.kind !== "skill") return;
    drafts.update(thread.id, {
      command: { name: cmd.name, kind: cmd.kind },
      text: draft.text.slice(m[0].length),
    });
  });

  // Focus the composer as soon as the textarea mounts. App.svelte keys the
  // thread view by thread id, so switching/opening a thread remounts this
  // component and this effect fires exactly then.
  $effect(() => {
    textareaEl?.focus();
  });

  // ── @-connections menu ────────────────────────────────────────────────
  // Typing `@` opens a picker of available connections (custom HTTP + connected
  // Composio toolkits). Picking one pins a chip to the composer and prepends a
  // hint to the outgoing prompt so the model prefers it. The underlying tools
  // (custom_request / connector_execute) are always available; @ is a nudge +
  // an exact-name handoff that skips a discovery round-trip.
  type ConnMenuItem = {
    kind: "custom" | "composio";
    name: string;
    toolkitSlug?: string;
    baseUrl?: string;
    logoUrl: string | null;
  };
  let connectionsCatalog = $state<ConnMenuItem[]>([]);
  let connectionsLoaded = $state(false);

  // Connections are global, not per-thread; load once on first `@` and refresh
  // when the connector set changes.
  async function ensureConnections() {
    if (connectionsLoaded) return;
    connectionsLoaded = true;
    try {
      const [composio, custom] = await Promise.all([
        api.invoke("connectors:list"),
        api.invoke("customConnections:list"),
      ]);
      const bySlug = new Map<string, ConnMenuItem>();
      for (const c of composio as Connection[]) {
        if (c.status !== "ACTIVE") continue; // pending/expired aren't callable yet
        if (bySlug.has(c.toolkitSlug)) continue; // one row per toolkit (N accounts)
        bySlug.set(c.toolkitSlug, {
          kind: "composio",
          name: c.name,
          toolkitSlug: c.toolkitSlug,
          logoUrl: c.logoUrl,
        });
      }
      const customs = (custom as CustomConnection[]).map((c) => ({
        kind: "custom" as const,
        name: c.name,
        baseUrl: c.baseUrl,
        logoUrl: c.logoUrl,
      }));
      connectionsCatalog = [...customs, ...bySlug.values()];
    } catch {
      connectionsLoaded = false; // allow retry on next `@`
    }
  }

  /** Refresh the cached catalog when connections change elsewhere in the app
   *  (ConnectorsView add/remove/reconnect) so the `@` picker stays current. */
  $effect(() => {
    const off = api.on("event:connectorsChanged", () => {
      connectionsLoaded = false;
      connectionsCatalog = [];
    });
    return off;
  });

  // BWS secrets available to pin with `@`. Values are never loaded — only
  // names + ids + project, so the picker (and any future transcript) shows no
  // cleartext. Refreshed when the Secrets view mutates the set.
  type SecMenuItem = { id: string; name: string; projectId: string };
  let secretsCatalog = $state<SecMenuItem[]>([]);
  let secretsLoaded = $state(false);

  async function ensureSecrets() {
    if (secretsLoaded) return;
    secretsLoaded = true;
    try {
      const status = await api.invoke("bws:status");
      if (!status.authenticated || !status.projectId) {
        secretsCatalog = [];
        return;
      }
      const list = await api.invoke("bws:listSecrets", status.projectId);
      secretsCatalog = (list as { id: string; key: string; projectId: string }[]).map((s) => ({
        id: s.id,
        name: s.key,
        projectId: s.projectId,
      }));
    } catch {
      secretsLoaded = false;
    }
  }

  $effect(() => {
    const off = api.on("event:bwsChanged", () => {
      secretsLoaded = false;
      secretsCatalog = [];
    });
    return off;
  });

  // Active `@token` immediately left of the caret (same framing rules as the
  // slash menu: must start a line or follow whitespace, no whitespace inside).
  const atContext = $derived.by(() => {
    void draft.text; // re-evaluate as the text changes
    const before = draft.text.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at === -1) return null;
    if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
    const token = before.slice(at + 1);
    if (/\s/.test(token)) return null;
    return { start: at, query: token.toLowerCase() };
  });
  const atQuery = $derived(atContext?.query ?? null);
  const atMatches = $derived.by(() => {
    if (atQuery === null) return [];
    const q = atQuery;
    return connectionsCatalog
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp;
      })
      .slice(0, 20);
  });
  let atIndex = $state(0);
  $effect(() => {
    if (atQuery !== null) {
      void ensureConnections();
      void ensureSecrets();
    }
  });
  $effect(() => {
    void atMatches;
    atIndex = 0;
  });

  // Same framing as atMatches but for BWS secrets.
  const secretMatches = $derived.by(() => {
    if (atQuery === null) return [];
    const q = atQuery;
    return secretsCatalog
      .filter((s) => s.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp;
      })
      .slice(0, 20);
  });

  function pickConnection(c: ConnMenuItem) {
    const ctx = atContext;
    const text = draft.text;
    // Strip the `@query` token so it doesn't leak into the message text.
    const stripped = ctx ? text.slice(0, ctx.start) + text.slice(cursor) : "";
    const ref: ReferencedConnection =
      c.kind === "custom"
        ? { kind: "custom", name: c.name, baseUrl: c.baseUrl, logoUrl: c.logoUrl }
        : { kind: "composio", name: c.name, toolkitSlug: c.toolkitSlug, logoUrl: c.logoUrl };
    // Dedupe by kind+name: pinning a connection twice is meaningless.
    if (!draft.connections.some((r) => r.kind === ref.kind && r.name === ref.name)) {
      drafts.update(thread.id, { text: stripped, connections: [...draft.connections, ref] });
    } else {
      drafts.update(thread.id, { text: stripped });
    }
    textareaEl?.focus();
    requestAnimationFrame(syncCursor);
  }

  function removeConnection(i: number) {
    drafts.update(thread.id, {
      connections: draft.connections.filter((_, idx) => idx !== i),
    });
    textareaEl?.focus();
  }

  function pickSecret(s: SecMenuItem) {
    const ctx = atContext;
    const text = draft.text;
    const stripped = ctx ? text.slice(0, ctx.start) + text.slice(cursor) : "";
    const ref: ReferencedSecret = { id: s.id, name: s.name, projectId: s.projectId };
    if (!draft.secrets.some((r) => r.id === ref.id)) {
      drafts.update(thread.id, { text: stripped, secrets: [...draft.secrets, ref] });
    } else {
      drafts.update(thread.id, { text: stripped });
    }
    textareaEl?.focus();
    requestAnimationFrame(syncCursor);
  }

  function removeSecret(i: number) {
    drafts.update(thread.id, {
      secrets: draft.secrets.filter((_, idx) => idx !== i),
    });
    textareaEl?.focus();
  }

  // ── Textarea auto-grow ────────────────────────────────────────────────
  function autoGrow() {
    if (!textareaEl) return;
    textareaEl.style.height = "auto";
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 400)}px`;
  }
  $effect(() => {
    void draft.text;
    autoGrow();
  });

  // Reveal the scrollbar thumb only while actively scrolling. Below
  // max-height there is no overflow so no scrollbar ever shows; once the
  // textarea is pinned at max-height, this class flashes the thumb for
  // ~700ms after each scroll event (macOS overlay-scrollbar feel).
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  function onTextareaScroll() {
    const el = textareaEl;
    if (!el) return;
    el.classList.add("is-scrolling");
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => el.classList.remove("is-scrolling"), 700);
  }

  // ── Attachments ───────────────────────────────────────────────────────
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const added = await readComposerAttachmentsFromFiles(files);
    if (added.length > 0) {
      drafts.update(thread.id, { attachments: [...draft.attachments, ...added] });
    }
  }

  async function onPaste(e: ClipboardEvent) {
    const images = extractImageFilesFromClipboardData(e.clipboardData);
    if (images.length > 0) {
      e.preventDefault();
      void addFiles(images);
      return;
    }
    // Clipboard managers (Raycast, screenshot history) paste images as a
    // file-path string. Intercept so the raw path never lands in the textarea.
    const imagePaths = extractImageFilePathsFromClipboardData(e.clipboardData);
    if (imagePaths.length > 0) {
      e.preventDefault();
      const added = await readImageAttachmentsFromPaths(imagePaths);
      if (added.length > 0) {
        drafts.update(thread.id, { attachments: [...draft.attachments, ...added] });
      }
      return;
    }
    const text = e.clipboardData?.getData("text/plain") ?? "";
    // Large text blobs paste as an attachment chip (ChatGPT-style) instead of
    // flooding the textarea. The content is inlined back into the message on
    // submit, so the model still sees it.
    if (shouldPasteAsAttachment(text)) {
      e.preventDefault();
      drafts.update(thread.id, {
        attachments: [...draft.attachments, makeTextAttachment(text)],
      });
      return;
    }
    // Plain-text paste still lands in the textarea as normal; if it looks like a
    // credential, offer to stash it in BWS instead of leaving it in the chat.
    const found = detectSecret(text);
    if (found) pastedSecret = found;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragActive = false;
    void addFiles(extractFilesFromDataTransfer(e.dataTransfer));
  }

  function removeAttachment(id: string) {
    drafts.update(thread.id, { attachments: draft.attachments.filter((a) => a.id !== id) });
  }

  // ── Submit / steer / abort ────────────────────────────────────────────
  async function submit(asSteer = false, fromPointer = false) {
    const raw = draft.text.trim();
    if (!raw && draft.attachments.length === 0 && !draft.command) return;
    // `/rewind [n]` is an app command (conversation rewind), not sent to pi.
    const rewindMatch = /^\/rewind(?:\s+(\d+))?\s*$/.exec(raw);
    if (rewindMatch && !draft.command) {
      if (!fromPointer) playButtonClick("click");
      drafts.clearText(thread.id);
      onRewind?.(rewindMatch[1] ? Number(rewindMatch[1]) : 1);
      return;
    }
    // `/btw <question>` opens an isolated side conversation (never sent to pi,
    // never added to the main transcript). Runs concurrently with any live run.
    const btwMatch = /^\/btw\b\s*([\s\S]*)$/.exec(raw);
    if (btwMatch && !draft.command) {
      const question = btwMatch[1]!.trim();
      if (!question) return;
      if (!fromPointer) playButtonClick("click");
      drafts.clearText(thread.id);
      void sideChat.openPanel(thread.id, question);
      return;
    }
    // Typed-out system commands (e.g. `/model`, `/compact`, `/new`) fire the
    // GUI-native flow rather than being sent to pi as text.
    const sysMatch = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(raw);
    if (sysMatch && !draft.command && systemCommandNames.has(sysMatch[1]!)) {
      drafts.clearText(thread.id);
      runSystemCommand(sysMatch[1]!, (sysMatch[2] ?? "").trim());
      return;
    }
    if (!fromPointer) playButtonClick("click");

    const fileRefs = draft.attachments
      .filter((a) => a.kind === "file")
      .map((a) => `Attached file: ${a.kind === "file" ? a.fsPath : ""}`);
    const textBlocks = draft.attachments
      .filter((a) => a.kind === "text")
      .map((a) => (a.kind === "text" ? `${a.name}:\n\n${a.content}` : ""));
    const images = draft.attachments
      .filter((a) => a.kind === "image")
      .map((a) => (a.kind === "image" ? { mimeType: a.mimeType, data: a.data } : null!))
      .filter(Boolean);

    const isSlashCommand = !!draft.command || raw.startsWith("/");
    const body = [raw, ...textBlocks, ...fileRefs].filter(Boolean).join("\n\n");
    const outgoing = draft.command
      ? [`/${draft.command.name}`, body].filter(Boolean).join(" ")
      : isSlashCommand
        ? body
        : composeOutgoingPrompt(body, {
            mode: draft.mode,
            isFirst: !draft.planPromptSent,
          });
    // Prepend the @-connections + @-secrets hints (nudges + exact names/ids)
    // before anything; the hints are orthogonal to mode/slash-wrapping.
    // clearText() runs below, so draft.connections/secrets still hold the
    // pinned sets here.
    const connectionsHint = buildConnectionsHint(draft.connections);
    const secretsHint = buildSecretsHint(draft.secrets);
    const hints = [connectionsHint, secretsHint].filter(Boolean).join("\n\n");
    const outgoingWithHints = hints ? `${hints}\n\n${outgoing}` : outgoing;
    const toolMode = draft.mode === "plan" && !isSlashCommand ? "readOnly" : "all";

    const snapshotText = draft.text;
    const snapshotAttachments = draft.attachments;
    const snapshotCommand = draft.command;
    const snapshotConnections = draft.connections;
    const snapshotSecrets = draft.secrets;
    drafts.clearText(thread.id);
    if (draft.mode === "plan" && !isSlashCommand) {
      drafts.update(thread.id, { planPromptSent: true });
    }

    try {
      if (thread.remoteHostId && thread.remoteThreadId) {
        // Remote master thread: forward over the relay write path (ADR-0010)
        // instead of driving a local pi process. Plan/tool-mode and images
        // aren't carried remotely yet — text steer/message only.
        if (asSteer && running) {
          await api.invoke("remote:steer", thread.remoteHostId, thread.remoteThreadId, outgoingWithHints);
        } else {
          sendAnim.mark(thread.id);
          await api.invoke("remote:message", thread.remoteHostId, thread.remoteThreadId, outgoingWithHints);
        }
      } else if (asSteer && running) {
        await api.invoke("threads:steer", thread.id, outgoingWithHints);
      } else {
        sendAnim.mark(thread.id);
        await api.invoke("threads:prompt", thread.id, outgoingWithHints, images, toolMode);
      }
    } catch (err) {
      // Restore draft on failure.
      drafts.update(thread.id, {
        text: snapshotText,
        attachments: snapshotAttachments,
        command: snapshotCommand,
        connections: snapshotConnections,
        secrets: snapshotSecrets,
      });
      console.error("submit failed", err);
    }
  }

  // Build/Plan flip uses the subtle rotary click (like the dial and model slider).
  function toggleMode() {
    playRotary();
    drafts.update(thread.id, { mode: draft.mode === "build" ? "plan" : "build" });
  }

  // Thread-wide shortcuts (work regardless of focus). All meta-keyed so they
  // never interfere with literal typing in inputs.
  function onShortcutKeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    // ⌘L focuses the composer textarea (browser/terminal "focus the input" convention).
    if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      textareaEl?.focus();
      return;
    }
    if (e.key === "1" || e.key === "2" || e.key === "3") {
      e.preventDefault();
      modelSelector?.selectSlot(Number(e.key) - 1);
      return;
    }
    if (e.key === "4") {
      e.preventDefault();
      modelSelector?.openMenu();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      void cycleThinking(1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      void cycleThinking(-1);
      return;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    // Backspace at the very start of an empty composer removes the skill chip.
    if (
      e.key === "Backspace" &&
      draft.command &&
      !draft.text &&
      textareaEl?.selectionStart === 0
    ) {
      e.preventDefault();
      removeCommand();
      return;
    }
    // Backspace at the start of an empty composer removes the last pinned
    // @-connection chip (mirrors the skill-chip behaviour above).
    if (
      e.key === "Backspace" &&
      !draft.command &&
      draft.connections.length > 0 &&
      !draft.text &&
      textareaEl?.selectionStart === 0
    ) {
      e.preventDefault();
      removeConnection(draft.connections.length - 1);
      return;
    }
    // Once connections are gone, backspace removes the last pinned @-secret chip.
    if (
      e.key === "Backspace" &&
      !draft.command &&
      draft.connections.length === 0 &&
      draft.secrets.length > 0 &&
      !draft.text &&
      textareaEl?.selectionStart === 0
    ) {
      e.preventDefault();
      removeSecret(draft.secrets.length - 1);
      return;
    }
    // Tab cycles the browse-filter tabs (Shift+Tab backwards) whenever the
    // menu is open, even with no matches.
    if (slashQuery !== null && e.key === "Tab") {
      e.preventDefault();
      cycleSlashFilter(e.shiftKey ? -1 : 1);
      return;
    }
    // @-menu navigation (connections + secrets combined into one virtual list;
    // mutually exclusive with the slash menu: a token can't be both `/…` and
    // `@…` at the caret without intervening whitespace).
    const atTotal = atMatches.length + secretMatches.length;
    if (atQuery !== null && atTotal > 0) {
      if (atIndex >= atTotal) atIndex = 0;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        atIndex = (atIndex + 1) % atTotal;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        atIndex = (atIndex - 1 + atTotal) % atTotal;
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (atIndex < atMatches.length) {
          pickConnection(atMatches[atIndex]!);
        } else {
          pickSecret(secretMatches[atIndex - atMatches.length]!);
        }
        return;
      }
    }
    if (slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slashIndex = (slashIndex + 1) % slashMatches.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        slashIndex = (slashIndex - 1 + slashMatches.length) % slashMatches.length;
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        pickSlash(slashMatches[slashIndex]!);
        return;
      }
    }
    // Up arrow when composer is empty and queue has follow-ups → recall last queued message.
    if (e.key === "ArrowUp" && !draft.text.trim() && queue.followUp.length > 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void api.invoke("threads:popLastFollowUp", thread.id).then((text) => {
        if (text) drafts.update(thread.id, { text });
      });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Holding Enter keeps the send button depressed (no re-trigger).
      if (e.repeat) return;
      enterSteer = e.metaKey && running;
      pressSend();
      return;
    }
    // Escape dismisses the open slash / @ menu: drop the `/…` or `@…` token
    // before the caret (cancel the in-progress command/pin) without arming a
    // model abort. The two-press Esc-to-stop safeguard still applies once the
    // menu is gone.
    const menuCtx = slashQuery !== null ? slashContext : atQuery !== null ? atContext : null;
    if (e.key === "Escape" && menuCtx) {
      e.preventDefault();
      drafts.update(
        thread.id,
        { text: draft.text.slice(0, menuCtx.start) + draft.text.slice(cursor) },
      );
      requestAnimationFrame(() => {
        if (textareaEl) {
          textareaEl.selectionStart = textareaEl.selectionEnd = menuCtx.start;
          syncCursor();
        }
      });
      return;
    }
    if (e.key === "Escape" && running) {
      if (abortArmed) {
        abortArmed = false;
        markAborted(thread.id);
        if (thread.remoteHostId && thread.remoteThreadId) {
          void api.invoke("remote:abort", thread.remoteHostId, thread.remoteThreadId);
        } else {
          void api.invoke("threads:abort", thread.id);
        }
      } else {
        abortArmed = true;
        extensionUi.notify("Press Esc again to stop the model");
        setTimeout(() => (abortArmed = false), 5000);
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "p")) {
      const target = e.key === "p" ? "plan" : "build";
      if (draft.mode !== target) toggleMode();
      e.preventDefault();
    }
  }
</script>

<svelte:window onkeydown={onShortcutKeydown} />

<footer class="composer-device shrink-0 px-6 pb-6">
  <div class="composer__frame relative">
    {#if pastedSecret}
      <BwsSecretPrompt
        secret={pastedSecret}
        onClose={() => (pastedSecret = null)}
        onPinned={(s) => {
          if (!draft.secrets.some((r) => r.id === s.id)) {
            drafts.update(thread.id, { secrets: [...draft.secrets, s] });
          }
        }}
      />
    {/if}
    <!-- Slash menu -->
    {#if slashQuery !== null}
      <div
        class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
        data-testid="slash-menu"
      >
        <!-- Browse tabs: click to filter by kind; Tab cycles them. -->
        <div class="flex items-center gap-1 border-b border-border-strong px-2 py-1.5">
          {#each slashVisibleTabs as tab (tab.key)}
            <button
              class="rounded px-2 py-0.5 text-[11px] font-medium
                {effectiveFilter === tab.key
                  ? tab.key === 'all'
                    ? 'bg-surface-3 text-fg'
                    : tab.key === 'starred'
                      ? 'bg-amber-400/20 text-amber-700'
                      : commandKindBadge[tab.key]
                  : 'text-faint hover:bg-surface-2'}"
              onclick={() => (slashFilter = tab.key)}>{tab.label}</button
            >
          {/each}
          <span class="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-faint">
            <kbd
              class="rounded border border-border-strong bg-surface-2 px-1 py-0.5 font-sans text-[10px] leading-none"
              >⇥ Tab</kbd
            >
            to switch
          </span>
        </div>
        <div class="max-h-96 overflow-y-auto">
          {#each slashMatches as cmd, i (cmd.kind + ":" + cmd.name)}
            {@const starred = commandPrefs.isStarred(starKey(cmd))}
            <div
              class="flex items-center {i === slashIndex ? 'bg-surface-2' : ''} hover:bg-surface-2"
            >
              <button
                class="flex min-w-0 flex-1 items-baseline gap-2 px-3 py-1.5 text-left text-sm"
                onclick={() => pickSlash(cmd)}
              >
                <span class="shrink-0 whitespace-nowrap font-mono text-fg">/{cmd.name}</span>
                <span class="min-w-0 truncate text-xs text-faint">{cmd.description}</span>
                <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide {commandKindBadge[cmd.kind]}">{commandKindLabel[cmd.kind]}</span>
              </button>
              <button
                class="shrink-0 px-2 py-1.5 {starred ? 'text-amber-500' : 'text-faint hover:text-amber-500'}"
                title={starred ? "Unstar" : "Star"}
                aria-label={starred ? "Unstar command" : "Star command"}
                onclick={() => commandPrefs.toggle(starKey(cmd))}
              >
                <Star size={14} class={starred ? "fill-amber-400" : ""} />
              </button>
            </div>
          {:else}
            <div class="px-3 py-2 text-xs text-faint">
              {slashFilter === "starred" && !slashQuery
                ? "No starred commands yet — click the ★ to add one"
                : "No matching commands"}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- @-menu: connections + secrets -->
    {#if atQuery !== null}
      <div
        class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
        data-testid="connections-menu"
      >
        <div class="border-b border-border-strong px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fainter">
          Connections &amp; Secrets <span class="font-normal normal-case text-fainter">· pick to pin @</span>
        </div>
        <div class="max-h-80 overflow-y-auto">
          {#if !connectionsLoaded || !secretsLoaded}
            <div class="px-3 py-2 text-xs text-faint">Loading…</div>
          {:else if atMatches.length === 0 && secretMatches.length === 0}
            <div class="px-3 py-2 text-xs text-faint">
              {connectionsCatalog.length === 0 && secretsCatalog.length === 0
                ? "No connections or secrets yet — add one in Connections / Secrets"
                : "No matching items"}
            </div>
          {:else}
            {#if atMatches.length > 0}
              <div class="border-b border-border-strong/50 px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Connections</div>
              {#each atMatches as c, i (c.kind + ":" + c.name)}
                <div class="flex items-center {i === atIndex ? 'bg-surface-2' : ''} hover:bg-surface-2">
                  <button
                    class="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm"
                    onclick={() => pickConnection(c)}
                  >
                    <ConnectorIcon logoUrl={c.logoUrl} label={c.name} size={18} />
                    <span class="min-w-0 truncate text-fg">{c.name}</span>
                    <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide {c.kind === 'custom' ? 'bg-violet-500/15 text-violet-700' : 'bg-sky-500/15 text-sky-700'}">{c.kind}</span>
                  </button>
                </div>
              {/each}
            {/if}
            {#if secretMatches.length > 0}
              <div class="border-b border-border-strong/50 px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Secrets</div>
              {#each secretMatches as s, j (s.id)}
                <div class="flex items-center {atMatches.length + j === atIndex ? 'bg-surface-2' : ''} hover:bg-surface-2">
                  <button
                    class="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm"
                    onclick={() => pickSecret(s)}
                  >
                    <KeyRound size={18} class="shrink-0 text-amber-600" />
                    <span class="min-w-0 truncate font-mono text-fg">{s.name}</span>
                    <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-700">secret</span>
                  </button>
                </div>
              {/each}
            {/if}
          {/if}
        </div>
      </div>
    {/if}

    <!-- Queued messages shelf (Codex/Cursor-style chip rail) -->
    {#if queue.followUp.length > 0}
      <section
        class="qq"
        data-testid="queued-shelf"
        role="list"
        aria-label={`${queue.followUp.length} queued`}
      >
        <header class="qq__head">
          <span class="qq__pulse" aria-hidden="true"></span>
          <span class="qq__head-label">Up next</span>
          <span class="qq__count" aria-hidden="true">{queue.followUp.length}</span>
          <span class="qq__head-hint" aria-hidden="true">
            <span class="qq__head-tag qq__head-tag--queue">{queue.followUp.length} queued</span>
          </span>
        </header>

        <div class="qq__list">
          {#if queue.followUp.length > 0}
            <div class="qq__group" role="group" aria-label="Queued messages">
              <span class="qq__group-label">queue</span>
              <div class="qq__items">
                {#each queue.followUp as t, i ("f-" + i)}
                  <div class="qq-item qq-item--queue" role="listitem">
                    <span class="qq-item__pos" aria-hidden="true">{i + 1}</span>
                    <span class="qq-item__text" title={t}>{t}</span>
                    <button
                      class="qq-item__action qq-item__action--promote"
                      onclick={() => api.invoke("threads:promoteFollowUpToSteer", thread.id, i)}
                      title="Steer now"
                      aria-label="Steer now"
                      data-testid="promote-steer"
                    ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
                    <button
                      class="qq-item__action qq-item__action--delete"
                      onclick={() => api.invoke("threads:deleteFollowUp", thread.id, i).catch(console.error)}
                      title="Remove"
                      aria-label="Remove queued message"
                      data-testid="delete-followup"
                    ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- Pinned @-connections shelf -->
    {#if draft.connections.length > 0}
      <div class="mb-2 flex flex-wrap gap-2" data-testid="connections-shelf">
        {#each draft.connections as c, i (c.kind + ":" + c.name)}
          <div class="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-xs text-fg-soft">
            <ConnectorIcon logoUrl={c.logoUrl} label={c.name} size={14} />
            <span class="max-w-40 truncate">@{c.name}</span>
            <button
              class="ml-0.5 text-faint hover:text-danger"
              onclick={() => removeConnection(i)}
              title="Remove connection"
              aria-label="Remove connection {c.name}"
            ><X size={12} /></button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Pinned @-secrets shelf (names only; values never enter the prompt) -->
    {#if draft.secrets.length > 0}
      <div class="mb-2 flex flex-wrap gap-2" data-testid="secrets-shelf">
        {#each draft.secrets as s, i (s.id)}
          <div class="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800">
            <KeyRound size={14} class="shrink-0" />
            <span class="max-w-40 truncate font-mono">@{s.name}</span>
            <button
              class="ml-0.5 text-amber-600/60 hover:text-danger"
              onclick={() => removeSecret(i)}
              title="Remove secret"
              aria-label="Remove secret {s.name}"
            ><X size={12} /></button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Attachments shelf -->
    {#if draft.attachments.length > 0}
      <div class="mb-2 flex flex-wrap gap-2" data-testid="attachment-shelf">
        {#each draft.attachments as att (att.id)}
          <div class="group relative">
            {#if att.kind === "image"}
              <button
                type="button"
                class="block cursor-zoom-in"
                onclick={() => lightbox.open(`data:${att.mimeType};base64,${att.data}`)}
                title="Click to enlarge"
              >
                <img
                  src={`data:${att.mimeType};base64,${att.data}`}
                  alt={att.name}
                  class="h-16 w-16 rounded-lg border border-border-strong object-cover"
                />
              </button>
            {:else if att.kind === "text"}
              <button
                type="button"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-fg-soft hover:bg-surface-2"
                title="Click to view"
                onclick={() => textViewer.open(att.name, att.kind === "text" ? att.content : "")}
              >
                <FileText size={13} />
                <span class="max-w-40 truncate">{att.name}</span>
              </button>
            {:else}
              <div class="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-fg-soft">
                <FileText size={13} />
                <span class="max-w-40 truncate">{att.name}</span>
              </div>
            {/if}
            <button
              class="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-surface-3 text-[10px] text-fg group-hover:flex hover:bg-danger"
              onclick={() => removeAttachment(att.id)}><X size={10} /></button
            >
          </div>
        {/each}
      </div>
    {/if}

    <!-- Device chassis -->
    <div
      class="composer__surface"
      role="region"
      aria-label="Composer"
      ondragover={(e) => {
        if (hasFilesInDataTransfer(e.dataTransfer)) {
          e.preventDefault();
          dragActive = true;
        }
      }}
      ondragleave={() => (dragActive = false)}
      ondrop={onDrop}
    >
      <div class="composer__editor">
        <div
          class="composer__screen {dragActive ? 'ring-2 ring-accent' : ''}"
          onmousedown={(e) => {
            const t = e.target as HTMLElement;
            console.log("[composer] mousedown target:", t.tagName, t.className);
            if (t.closest("textarea, button, .composer__context")) return;
            e.preventDefault();
            textareaEl?.focus();
            console.log("[composer] focus called, textareaEl:", !!textareaEl);
          }}
        >
          {#if draft.command}
            {@const Icon = commandIcon[draft.command.kind]}
            <span
              bind:this={chipEl}
              class="skill-chip skill-chip--composer composer__cmd-chip"
              data-testid="composer-command-chip"
            >
              <Icon size={12} />
              <span>{draft.command.name}</span>
              <button
                type="button"
                class="skill-chip__remove"
                onclick={removeCommand}
                title="Remove {draft.command.kind}"
                aria-label="Remove {draft.command.kind}"><X size={10} /></button
              >
            </span>
          {/if}
          <textarea
            bind:this={textareaEl}
            style:text-indent={draft.command ? `${chipWidth + 8}px` : null}
            onfocus={() => console.log("[composer] textarea FOCUSED")}
            onscroll={onTextareaScroll}
            placeholder={running
              ? "enter queues · ⌘enter steers · esc stops"
              : draft.mode === "plan"
                ? "plan something…"
                : "message the clanker"}
            value={draft.text}
            oninput={(e) => {
              drafts.update(thread.id, { text: e.currentTarget.value });
              syncCursor();
            }}
            onkeydown={onKeydown}
            onkeyup={onKeyup}
            onclick={syncCursor}
            onselect={syncCursor}
            onpaste={onPaste}
            data-testid="composer-input"
            rows="1"
          ></textarea>

          {#if meta?.contextPercent != null}
            <div class="composer__context" data-testid="context-usage">
              <div class="composer__context-track">
                <div class="composer__context-fill" style="width: {Math.min(100, meta.contextPercent)}%"></div>
                <Tooltip
                  class="composer__context-marker"
                  style="left: {autoCompactPercent}%"
                  text={autoCompactTokens != null
                    ? `Auto-compacts at ${fmtTokens(autoCompactTokens)} tokens`
                    : `Auto-compacts at ${Math.round(autoCompactPercent)}%`}
                />
              </div>
              <span class="composer__context-label">
                {fmtTokens(meta.contextTokens)} / {fmtTokens(meta.contextWindow)}
                {#if meta.contextPercent > 30 && !running}
                  <button
                    class="composer__context-compact"
                    onclick={() => api.invoke("threads:compact", thread.id)}
                    data-testid="compact-button"
                    title="Compact context (auto-compacts at {Math.round(autoCompactPercent)}%)"
                  >Compact</button>
                {/if}
              </span>
            </div>
          {:else}
            <div class="composer__context">
              <div class="composer__context-track"></div>
              <span class="composer__context-label">Context —</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Controls strip -->
      <div class="composer__footer-row">
        <div class="composer__controls">
          <!-- BUILD / PLAN switch (.composer-mode) -->
          <span class="composer__key-mount composer__key-mount--mode">
            <button
              class="composer-mode {draft.mode === 'plan' ? 'composer-mode--plan' : ''}"
              aria-pressed={draft.mode === 'plan'}
              aria-label={`Composer mode: ${draft.mode === 'plan' ? 'Plan' : 'Build'}`}
              onclick={toggleMode}
              data-testid="mode-toggle"
              title="⌘B build · ⌘P plan"
            >
              <span class="composer-mode__label {draft.mode !== 'plan' ? 'composer-mode__label--active' : ''}">Build</span>
              <span class="composer-mode__track" aria-hidden="true"><span class="composer-mode__thumb"></span></span>
              <span class="composer-mode__label {draft.mode === 'plan' ? 'composer-mode__label--active' : ''}">Plan</span>
            </button>
          </span>

          <ModelSelector
            bind:this={modelSelector}
            model={meta?.model ?? null}
            models={sessionMetas.models}
            allModels={sessionMetas.allModels}
            onPick={pickModel}
            onRequestModels={() => sessionMetas.loadModels(thread.id)}
            onRequestAllModels={() => sessionMetas.loadAllModels(thread.id)}
            onToggleScoped={(provider, id, scoped) =>
              sessionMetas.setModelScoped(thread.id, provider, id, scoped)}
          />

          {#if meta && meta.availableThinkingLevels.length >= 1}
            <ReasoningDial
              level={meta.thinkingLevel}
              available={meta.availableThinkingLevels}
              onCycle={cycleThinking}
            />
          {/if}

          <!-- Quick-access drawer: a row of custom actions. -->
          <QuickSlots
            commands={allCommands}
            cavemanEnabled={caveman.enabled}
            onToggleCaveman={toggleCaveman}
            onInjectSkill={injectSkill}
            onRunCommand={(cmd) => runSlashCommand(cmd, "")}
            onRunSystem={(name) => runSystemCommand(name, "")}
            onRunRaw={runRawCommand}
            onRequestCommands={ensureCommands}
            onAutoDetect={(kind, name) =>
              api.invoke("resources:inspectSlotCommand", thread.projectId, kind, name)}
          />
        </div>

        <div class="composer__actions">
          {#if running && !draft.text.trim()}
            <button
              class="send-dial send-dial--stop"
              onclick={() => api.invoke("threads:abort", thread.id)}
              data-testid="abort"
              title="Stop run"
              aria-label="Stop run"
            >
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
            </button>
          {:else}
            <button
              class="send-dial {sendPressed ? 'is-pressed' : ''}"
              data-press="self"
              onclick={() => submit(false, true)}
              onpointerdown={pressSend}
              onpointerup={() => releaseSend(true)}
              onpointerleave={() => releaseSend(true)}
              onpointercancel={() => releaseSend(false)}
              data-has-input={draft.text.trim() || draft.attachments.length > 0 ? "" : undefined}
              data-testid="send"
              title={running ? "Queue message" : "Send message"}
              aria-label={running ? "Queue message" : "Send message"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Side conversation (/btw): fixed to the viewport's bottom-right so the cap never
       moves. The docked panel slides in under it; once open the cap becomes the panel's
       send button in place (no hide/reappear). Hidden only on the centered new state. -->
  {#if !centered}
  <button
    class="btw-btn btw-btn--floating"
    data-press="self"
    data-has-input={sideChat.open &&
      sideChat.threadId === thread.id &&
      sideChat.draft.trim() &&
      !sideChat.streaming
      ? ""
      : undefined}
    onpointerdown={(e) => {
      if (e.button !== 0) return;
      btwRelease = pressClick();
    }}
    onpointerup={(e) => {
      if (e.button !== 0) return;
      btwRelease?.();
      btwRelease = null;
      // Open the panel, or — when it's already open for this thread — act as its
      // send button. (Close via the panel's ×.)
      const panelOpen = sideChat.open && sideChat.threadId === thread.id;
      panelOpen ? void sideChat.submitDraft() : void sideChat.openPanel(thread.id);
    }}
    onpointercancel={() => { btwRelease = null; }}
    data-testid="open-side-chat"
    title="Side conversation (/btw) — ask a quick question without touching this task"
    aria-label="Open side conversation"
  >
    <span class="btw-btn__label">BTW</span>
  </button>
  {/if}

  <ModelScopeSelect bind:this={scopedModelsPanel} floating />
</footer>

<style>
  /* Queued-messages shelf — modern AI-harness chip rail.
     Codex IDE ext: per-row queue w/ steer-promote + delete.
     Cursor 1.4: compact single-line chips, contextual action verbs.
     Steer = inject into current turn (accent). Queue = FIFO next turn (neutral). */
  .qq {
    margin-bottom: 8px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--color-border-strong) 70%, transparent);
    background: color-mix(in srgb, var(--color-surface-2) 55%, transparent);
    overflow: hidden;
  }

  /* Header strip */
  .qq__head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border-strong) 55%, transparent);
    background: color-mix(in srgb, var(--color-surface-2) 35%, transparent);
    user-select: none;
  }
  .qq__pulse {
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: var(--color-accent);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 60%, transparent);
    animation: qq-pulse 1.6s ease-out infinite;
  }
  .qq__head-label {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .qq__count {
    min-width: 16px;
    height: 16px;
    padding: 0 5px;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: var(--color-surface-3);
    color: var(--color-fg-soft);
  }
  .qq__head-hint {
    margin-left: auto;
    display: inline-flex;
    gap: 6px;
  }
  .qq__head-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 9999px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .qq__head-tag--queue {
    color: var(--color-muted);
    background: color-mix(in srgb, var(--color-surface-3) 55%, transparent);
  }

  /* List body */
  .qq__list {
    display: flex;
    flex-direction: column;
    padding: 6px;
    gap: 4px;
    max-height: 184px;
    overflow-y: auto;
  }
  .qq__group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .qq__group-label {
    font-size: 9.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-fainter);
    padding: 0 6px;
  }
  .qq__items {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  /* Single chip */
  .qq-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 6px 5px 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--color-border-strong) 55%, transparent);
    background: color-mix(in srgb, var(--color-surface) 80%, transparent);
    min-width: 0;
    animation: qq-slide 160ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Queue variant — neutral */
  .qq-item--queue .qq-item__action--delete:hover {
    background: color-mix(in srgb, var(--color-danger) 22%, transparent);
    color: var(--color-danger);
  }
  .qq-item--queue .qq-item__action--promote:hover {
    background: color-mix(in srgb, var(--color-accent) 22%, transparent);
    color: var(--color-accent);
  }
  /* Position badge (queue) */
  .qq-item__pos {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: var(--color-surface-3);
    color: var(--color-fg-soft);
  }

  /* Truncated text */
  .qq-item__text {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12px;
    line-height: 1.35;
    color: var(--color-fg-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: text;
  }
  /* Action buttons — subtle at rest, full on hover/focus */
  .qq-item__action {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-faint);
    opacity: 0.55;
    transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
    cursor: pointer;
  }
  .qq-item:hover .qq-item__action,
  .qq-item:focus-within .qq-item__action {
    opacity: 1;
  }
  .qq-item__action svg {
    width: 11px;
    height: 11px;
  }

  @keyframes qq-pulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 50%, transparent); }
    70% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--color-accent) 0%, transparent); }
    100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 0%, transparent); }
  }
  @keyframes qq-slide {
    from { opacity: 0; transform: translateY(-3px) scale(0.985); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .qq-item { animation: none; }
    .qq__pulse { animation: none; }
  }
</style>
