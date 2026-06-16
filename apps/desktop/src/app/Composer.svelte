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
  import { playButtonClick, playKey, playRotary } from "../lib/sound/button-click-sound";
  import FileText from "@lucide/svelte/icons/file-text";
  import X from "@lucide/svelte/icons/x";
  import { drafts, queues } from "../stores/composer.svelte";
  import { sessionMetas } from "../stores/session-meta.svelte";
  import { caveman } from "../stores/caveman.svelte";
  import { api } from "../lib/ipc";
  import ReasoningDial from "./composer/ReasoningDial.svelte";
  import ModelSelector from "./composer/ModelSelector.svelte";

  let { thread }: { thread: Thread } = $props();

  const draft = $derived(drafts.for(thread.id));
  const queue = $derived(queues.for(thread.id));
  const running = $derived(thread.status === "running");
  const meta = $derived(sessionMetas.for(thread.id));

  $effect(() => {
    sessionMetas.ensure(thread.id);
    void sessionMetas.loadModels(thread.id);
  });
  void caveman.load();

  function toggleCaveman() {
    playKey("press");
    void caveman.toggle(thread.id);
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

  async function cycleThinking() {
    if (!meta) return;
    const levels = meta.availableThinkingLevels;
    if (levels.length === 0) return;
    const next = levels[(levels.indexOf(meta.thinkingLevel) + 1) % levels.length]!;
    playRotary();
    sessionMetas.set(await api.invoke("threads:setThinking", thread.id, next));
  }

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let dragActive = $state(false);
  let commands = $state<CommandInfo[]>([]);
  let commandsLoadedFor = $state<string | null>(null);
  let slashIndex = $state(0);

  // ── Slash menu ─────────────────────────────────────────────────────────
  const slashQuery = $derived.by(() => {
    const text = draft.text;
    if (!text.startsWith("/") || /\s/.test(text)) return null;
    return text.slice(1).toLowerCase();
  });
  const slashMatches = $derived(
    slashQuery === null
      ? []
      : commands.filter((c) => c.name.toLowerCase().startsWith(slashQuery)).slice(0, 8),
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

  function pickSlash(cmd: CommandInfo) {
    drafts.update(thread.id, { text: `/${cmd.name} ` });
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
    if (!raw && draft.attachments.length === 0) return;
    playButtonClick("click");

    const fileRefs = draft.attachments
      .filter((a) => a.kind === "file")
      .map((a) => `Attached file: ${a.kind === "file" ? a.fsPath : ""}`);
    const images = draft.attachments
      .filter((a) => a.kind === "image")
      .map((a) => (a.kind === "image" ? { mimeType: a.mimeType, data: a.data } : null!))
      .filter(Boolean);

    const isSlashCommand = raw.startsWith("/");
    const body = [raw, ...fileRefs].filter(Boolean).join("\n\n");
    const outgoing = isSlashCommand
      ? body
      : composeOutgoingPrompt(body, {
          mode: draft.mode,
          isFirst: !draft.planPromptSent,
        });
    const toolMode = draft.mode === "plan" && !isSlashCommand ? "readOnly" : "all";

    const snapshotText = draft.text;
    const snapshotAttachments = draft.attachments;
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
      drafts.update(thread.id, { text: snapshotText, attachments: snapshotAttachments });
      console.error("submit failed", err);
    }
  }

  function toggleMode() {
    playKey("press");
    drafts.update(thread.id, { mode: draft.mode === "build" ? "plan" : "build" });
  }

  function onKeydown(e: KeyboardEvent) {
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(e.metaKey && running);
      return;
    }
    if (e.key === "Escape" && running) {
      void api.invoke("threads:abort", thread.id);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "p")) {
      const target = e.key === "p" ? "plan" : "build";
      if (draft.mode !== target) toggleMode();
      e.preventDefault();
    }
  }
</script>

<footer class="composer-device shrink-0 px-6 pb-14">
  <div class="composer__frame relative">
    <!-- Slash menu -->
    {#if slashMatches.length > 0}
      <div
        class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
        data-testid="slash-menu"
      >
        {#each slashMatches as cmd, i (cmd.name)}
          <button
            class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm
              {i === slashIndex ? 'bg-surface-2' : ''} hover:bg-surface-2"
            onclick={() => pickSlash(cmd)}
          >
            <span class="font-mono text-fg">/{cmd.name}</span>
            <span class="truncate text-xs text-faint">{cmd.description}</span>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Queued messages shelf -->
    {#if queue.steering.length > 0 || queue.followUp.length > 0}
      <div class="mb-2 flex flex-col gap-1" data-testid="queued-shelf">
        {#each [...queue.steering.map((t) => ({ t, k: "steer" })), ...queue.followUp.map((t) => ({ t, k: "follow-up" }))] as q, i (i)}
          <div class="flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-xs text-muted">
            <span class="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase">{q.k}</span>
            <span class="truncate">{q.t}</span>
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
              <img
                src={`data:${att.mimeType};base64,${att.data}`}
                alt={att.name}
                class="h-16 w-16 rounded-lg border border-border-strong object-cover"
              />
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
        <div class="composer__screen {dragActive ? 'ring-2 ring-accent' : ''}">
          <textarea
            bind:this={textareaEl}
            placeholder={running
              ? "enter queues a steer · ⌘enter steers · esc stops"
              : draft.mode === "plan"
                ? "plan something…"
                : " message the clanker"}
            value={draft.text}
            oninput={(e) => drafts.update(thread.id, { text: e.currentTarget.value })}
            onkeydown={onKeydown}
            onpaste={onPaste}
            data-testid="composer-input"
            rows="1"
          ></textarea>

          {#if meta?.contextPercent != null}
            <div class="composer__context" data-testid="context-usage">
              <div class="composer__context-track">
                <div class="composer__context-fill" style="width: {Math.min(100, meta.contextPercent)}%"></div>
              </div>
              <span class="composer__context-label">
                {fmtTokens(meta.contextTokens)} / {fmtTokens(meta.contextWindow)}
                {#if meta.contextPercent > 30 && !running}
                  <button
                    class="composer__context-compact"
                    onclick={() => api.invoke("threads:compact", thread.id)}
                    data-testid="compact-button"
                    title="Compact context (auto-compacts at 80%)"
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
            model={meta?.model ?? null}
            models={sessionMetas.models}
            onPick={pickModel}
            onRequestModels={() => sessionMetas.loadModels(thread.id)}
          />

          {#if meta && meta.availableThinkingLevels.length >= 1}
            <ReasoningDial
              level={meta.thinkingLevel}
              available={meta.availableThinkingLevels}
              onCycle={cycleThinking}
            />
          {/if}

          <!-- CAVEMAN: toggles pi-caveman compression (.devbtn) -->
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
