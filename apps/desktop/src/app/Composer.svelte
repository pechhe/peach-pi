<script lang="ts">
  import type { CommandInfo, Thread } from "@peach-pi/shared-types";
  import { composeOutgoingPrompt } from "../lib/composer/mode";
  import {
    extractFilesFromDataTransfer,
    extractImageFilePathsFromClipboardData,
    extractImageFilesFromClipboardData,
    hasFilesInDataTransfer,
    readComposerAttachmentsFromFiles,
    readImageAttachmentsFromPaths,
  } from "../lib/composer/attachments";
  import { playButtonClick, playClick, playRotary } from "../lib/sound/button-click-sound";
  import FileText from "@lucide/svelte/icons/file-text";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Puzzle from "@lucide/svelte/icons/puzzle";
  import MessageSquareText from "@lucide/svelte/icons/message-square-text";
  import X from "@lucide/svelte/icons/x";
  import Tooltip from "./Tooltip.svelte";
  import { drafts, queues } from "../stores/composer.svelte";
  import { lightbox } from "../stores/lightbox.svelte";
  import { sessionMetas } from "../stores/session-meta.svelte";
  import { caveman } from "../stores/caveman.svelte";
  import { autoCompact } from "../stores/auto-compact.svelte";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { sideChat } from "../stores/side-chat.svelte";
  import { markAborted } from "../lib/composer/abort-signal.svelte";
  import { api } from "../lib/ipc";
  import ReasoningDial from "./composer/ReasoningDial.svelte";
  import ModelSelector from "./composer/ModelSelector.svelte";

  let { thread, onRewind }: {
    thread: Thread;
    /** `/rewind [n]` from the composer — rewind the n-th turn from the end. */
    onRewind?: (n: number) => void;
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

  // Caveman shares the heavier "clanky" click with the send button.
  function toggleCaveman() {
    playClick("down");
    void caveman.toggle(thread.id);
  }

  // Placeholder slot — same device button as Caveman, no real effect yet.
  let placeholderOn = $state(false);
  function togglePlaceholder() {
    playClick("down");
    placeholderOn = !placeholderOn;
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
  // Esc-to-stop is a two-press confirm to avoid accidental aborts.
  let abortArmed = $state(false);
  let dragActive = $state(false);
  let commands = $state<CommandInfo[]>([]);
  let commandsLoadedFor = $state<string | null>(null);
  let slashIndex = $state(0);
  // Caret position, tracked so the slash menu can trigger anywhere (not just
  // at the start of the message).
  let cursor = $state(0);

  function syncCursor() {
    cursor = textareaEl?.selectionStart ?? 0;
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
  const slashMatches = $derived(
    slashQuery === null
      ? []
      : commands
          .filter((c) => c.name.toLowerCase().includes(slashQuery))
          .sort((a, b) => {
            const ap = a.name.toLowerCase().startsWith(slashQuery) ? 0 : 1;
            const bp = b.name.toLowerCase().startsWith(slashQuery) ? 0 : 1;
            return ap - bp;
          })
          .slice(0, 8),
  );

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

  const commandKindLabel: Record<CommandInfo["kind"], string> = {
    skill: "skill",
    extension: "extension",
    prompt: "prompt",
  };

  const commandIcon = { skill: BookOpen, extension: Puzzle, prompt: MessageSquareText };

  // A slash command collapses into a chip; the `/token` is removed from the text.
  function pickSlash(cmd: CommandInfo) {
    const ctx = slashContext;
    const text = draft.text;
    const stripped = ctx ? text.slice(0, ctx.start) + text.slice(cursor) : "";
    drafts.update(thread.id, { command: { name: cmd.name, kind: cmd.kind }, text: stripped });
    textareaEl?.focus();
    requestAnimationFrame(syncCursor);
  }

  function removeCommand() {
    drafts.update(thread.id, { command: null });
    textareaEl?.focus();
  }

  // Typing a full `/<name> ` (known command, leading) also collapses into a chip.
  $effect(() => {
    if (draft.command) return;
    const m = /^\/(\S+)\s/.exec(draft.text);
    if (!m) return;
    const name = m[1]!;
    const cmd = commands.find((c) => c.name === name);
    if (!cmd) return;
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
    }
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
  async function submit(asSteer = false) {
    const raw = draft.text.trim();
    if (!raw && draft.attachments.length === 0 && !draft.command) return;
    // `/rewind [n]` is an app command (conversation rewind), not sent to pi.
    const rewindMatch = /^\/rewind(?:\s+(\d+))?\s*$/.exec(raw);
    if (rewindMatch && !draft.command) {
      playButtonClick("click");
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
      playButtonClick("click");
      drafts.clearText(thread.id);
      void sideChat.openPanel(thread.id, question);
      return;
    }
    playButtonClick("click");

    const fileRefs = draft.attachments
      .filter((a) => a.kind === "file")
      .map((a) => `Attached file: ${a.kind === "file" ? a.fsPath : ""}`);
    const images = draft.attachments
      .filter((a) => a.kind === "image")
      .map((a) => (a.kind === "image" ? { mimeType: a.mimeType, data: a.data } : null!))
      .filter(Boolean);

    const isSlashCommand = !!draft.command || raw.startsWith("/");
    const body = [raw, ...fileRefs].filter(Boolean).join("\n\n");
    const outgoing = draft.command
      ? [`/${draft.command.name}`, body].filter(Boolean).join(" ")
      : isSlashCommand
        ? body
        : composeOutgoingPrompt(body, {
            mode: draft.mode,
            isFirst: !draft.planPromptSent,
          });
    const toolMode = draft.mode === "plan" && !isSlashCommand ? "readOnly" : "all";

    const snapshotText = draft.text;
    const snapshotAttachments = draft.attachments;
    const snapshotCommand = draft.command;
    drafts.clearText(thread.id);
    if (draft.mode === "plan" && !isSlashCommand) {
      drafts.update(thread.id, { planPromptSent: true });
    }

    try {
      if (asSteer && running) {
        await api.invoke("threads:steer", thread.id, outgoing);
      } else {
        await api.invoke("threads:prompt", thread.id, outgoing, images, toolMode);
      }
    } catch (err) {
      // Restore draft on failure.
      drafts.update(thread.id, {
        text: snapshotText,
        attachments: snapshotAttachments,
        command: snapshotCommand,
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
      if (e.key === "Tab") {
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
      void submit(e.metaKey && running);
      return;
    }
    if (e.key === "Escape" && running) {
      if (abortArmed) {
        abortArmed = false;
        markAborted(thread.id);
        void api.invoke("threads:abort", thread.id);
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
    <!-- Slash menu -->
    {#if slashMatches.length > 0}
      <div
        class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
        data-testid="slash-menu"
      >
        {#each slashMatches as cmd, i (cmd.kind + ":" + cmd.name)}
          <button
            class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm
              {i === slashIndex ? 'bg-surface-2' : ''} hover:bg-surface-2"
            onclick={() => pickSlash(cmd)}
          >
            <span class="font-mono text-fg">/{cmd.name}</span>
            <span class="truncate text-xs text-faint">{cmd.description}</span>
            <span class="ml-auto shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-faint">{commandKindLabel[cmd.kind]}</span>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Queued messages shelf (Codex/Cursor-style chip rail) -->
    {#if queue.steering.length > 0 || queue.followUp.length > 0}
      {@const queueTotal = queue.steering.length + queue.followUp.length}
      <section
        class="qq"
        data-testid="queued-shelf"
        role="list"
        aria-label={queue.steering.length > 0
          ? `${queue.steering.length} steering, ${queue.followUp.length} queued`
          : `${queueTotal} queued`}
      >
        <header class="qq__head">
          <span class="qq__pulse" aria-hidden="true"></span>
          <span class="qq__head-label">Up next</span>
          <span class="qq__count" aria-hidden="true">{queueTotal}</span>
          <span class="qq__head-hint" aria-hidden="true">
            {#if queue.steering.length > 0}
              <span class="qq__head-tag qq__head-tag--steer">{queue.steering.length} steer</span>
            {/if}
            {#if queue.followUp.length > 0}
              <span class="qq__head-tag qq__head-tag--queue">{queue.followUp.length} queued</span>
            {/if}
          </span>
        </header>

        <div class="qq__list">
          {#if queue.steering.length > 0}
            <div class="qq__group" role="group" aria-label="Steering, injected this turn">
              <span class="qq__group-label">steer · this turn</span>
              <div class="qq__items">
                {#each queue.steering as t, i ("s-" + i)}
                  <div class="qq-item qq-item--steer" role="listitem">
                    <span class="qq-item__bar" aria-hidden="true"></span>
                    <svg class="qq-item__icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1.5 3.5 8.5H7l-1 6 6-8.5H9.5L9 1.5z" /></svg>
                    <span class="qq-item__text" title={t}>{t}</span>
                    <button
                      class="qq-item__action qq-item__action--delete"
                      onclick={() => api.invoke("threads:deleteSteer", thread.id, i).catch(console.error)}
                      title="Remove"
                      aria-label="Remove steering message"
                      data-testid="delete-steer"
                    ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

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
            onkeyup={syncCursor}
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

          <!-- Caveman + placeholder slot, grouped close together. -->
          <span class="composer__btn-pair">
          <span class="devbtn" data-section-label="Caveman">
            <button
              class="devbtn__switch {caveman.enabled ? 'devbtn__switch--on' : ''}"
              aria-pressed={caveman.enabled}
              onclick={toggleCaveman}
              data-testid="caveman-toggle"
              title={`Caveman compression ${caveman.enabled ? "on" : "off"} (click to toggle)`}
              aria-label={`Caveman compression ${caveman.enabled ? "on" : "off"}`}
            >
              <span class="devbtn__led" aria-hidden="true"></span>
              <span class="devbtn__cap" aria-hidden="true"></span>
              <span class="devbtn__caption">Caveman</span>
            </button>
          </span>

          <!-- Placeholder slot: identical device button to Caveman, no effect yet. -->
          <span class="devbtn" data-section-label="Slot">
            <button
              class="devbtn__switch {placeholderOn ? 'devbtn__switch--on' : ''}"
              aria-pressed={placeholderOn}
              onclick={togglePlaceholder}
              data-testid="placeholder-toggle"
              title="Placeholder"
              aria-label="Placeholder"
            >
              <span class="devbtn__led" aria-hidden="true"></span>
              <span class="devbtn__cap" aria-hidden="true"></span>
              <span class="devbtn__caption">Slot</span>
            </button>
          </span>
          </span>
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
              class="send-dial"
              onclick={() => submit()}
              disabled={!draft.text.trim() && draft.attachments.length === 0}
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
  .qq__head-tag--steer {
    color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
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
  .qq__group + .qq__group {
    margin-top: 4px;
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

  /* Steer variant — accent-tinted, left bar */
  .qq-item--steer {
    border-color: color-mix(in srgb, var(--color-accent) 38%, transparent);
    background: color-mix(in srgb, var(--color-accent) 9%, var(--color-surface));
    padding-left: 10px;
  }
  .qq-item--steer .qq-item__action--delete {
    color: var(--color-accent);
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
  .qq-item--steer .qq-item__action--delete:hover {
    background: color-mix(in srgb, var(--color-danger) 22%, transparent);
    color: var(--color-danger);
  }

  /* Left accent bar (steer) */
  .qq-item__bar {
    position: absolute;
    left: 3px;
    top: 4px;
    bottom: 4px;
    width: 2px;
    border-radius: 2px;
    background: var(--color-accent);
  }

  /* Icon (steer) */
  .qq-item__icon {
    flex: none;
    width: 13px;
    height: 13px;
    fill: var(--color-accent);
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
  .qq-item--steer .qq-item__text {
    color: var(--color-fg);
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
