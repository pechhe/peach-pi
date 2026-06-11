<script lang="ts">
  import type { CommandInfo, Thread } from "@peach-pi/shared-types";
  import { composeOutgoingPrompt } from "../lib/composer/mode";
  import {
    extractFilesFromDataTransfer,
    extractImageFilesFromClipboardData,
    hasFilesInDataTransfer,
    readComposerAttachmentsFromFiles,
  } from "../lib/composer/attachments";
  import { playButtonClick, playKey, playRotary } from "../lib/sound/button-click-sound";
  import { drafts, queues } from "../stores/composer.svelte";
  import { sessionMetas } from "../stores/session-meta.svelte";
  import { api } from "../lib/ipc";

  let { thread }: { thread: Thread } = $props();

  const draft = $derived(drafts.for(thread.id));
  const queue = $derived(queues.for(thread.id));
  const running = $derived(thread.status === "running");
  const meta = $derived(sessionMetas.for(thread.id));

  let modelMenuOpen = $state(false);

  $effect(() => {
    sessionMetas.ensure(thread.id);
  });

  async function openModelMenu(e: MouseEvent) {
    e.stopPropagation();
    modelMenuOpen = !modelMenuOpen;
    if (modelMenuOpen) await sessionMetas.loadModels(thread.id);
  }

  async function pickModel(provider: string, id: string) {
    modelMenuOpen = false;
    playRotary();
    sessionMetas.set(await api.invoke("threads:setModel", thread.id, provider, id));
  }

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

  function onPaste(e: ClipboardEvent) {
    const images = extractImageFilesFromClipboardData(e.clipboardData);
    if (images.length > 0) {
      e.preventDefault();
      void addFiles(images);
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

<svelte:window onclick={() => (modelMenuOpen = false)} />

<footer class="shrink-0 px-6 pb-5">
  <div class="relative mx-auto max-w-3xl">
    <!-- Slash menu -->
    {#if slashMatches.length > 0}
      <div
        class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
        data-testid="slash-menu"
      >
        {#each slashMatches as cmd, i (cmd.name)}
          <button
            class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm
              {i === slashIndex ? 'bg-zinc-800' : ''} hover:bg-zinc-800"
            onclick={() => pickSlash(cmd)}
          >
            <span class="font-mono text-zinc-200">/{cmd.name}</span>
            <span class="truncate text-xs text-zinc-500">{cmd.description}</span>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Queued messages shelf -->
    {#if queue.steering.length > 0 || queue.followUp.length > 0}
      <div class="mb-2 flex flex-col gap-1" data-testid="queued-shelf">
        {#each [...queue.steering.map((t) => ({ t, k: "steer" })), ...queue.followUp.map((t) => ({ t, k: "follow-up" }))] as q, i (i)}
          <div class="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400">
            <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase">{q.k}</span>
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
                class="h-16 w-16 rounded-lg border border-zinc-700 object-cover"
              />
            {:else}
              <div class="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300">
                <span class="font-mono">📄</span>
                <span class="max-w-40 truncate">{att.name}</span>
              </div>
            {/if}
            <button
              class="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-zinc-200 group-hover:flex hover:bg-red-500"
              onclick={() => removeAttachment(att.id)}>✕</button
            >
          </div>
        {/each}
      </div>
    {/if}

    <!-- Surface -->
    <div
      class="rounded-xl border bg-zinc-900 p-2 transition-colors focus-within:border-zinc-500
        {dragActive ? 'border-sky-500 bg-sky-500/5' : 'border-zinc-700'}
        {draft.mode === 'plan' ? 'border-indigo-600/60' : ''}"
      ondragover={(e) => {
        if (hasFilesInDataTransfer(e.dataTransfer)) {
          e.preventDefault();
          dragActive = true;
        }
      }}
      ondragleave={() => (dragActive = false)}
      ondrop={onDrop}
      role="region"
      aria-label="Composer"
    >
      <textarea
        bind:this={textareaEl}
        class="max-h-[400px] min-h-[2.5rem] w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        placeholder={running
          ? "Enter queues a steer · ⌘Enter steers · Esc stops"
          : draft.mode === "plan"
            ? "Plan something… (read-only exploration)"
            : "Message… (Enter to send, / for commands)"}
        value={draft.text}
        oninput={(e) => drafts.update(thread.id, { text: e.currentTarget.value })}
        onkeydown={onKeydown}
        onpaste={onPaste}
        data-testid="composer-input"
        rows="1"
      ></textarea>

      <!-- Footer row -->
      <div class="flex items-center justify-between px-1 pt-1">
        <button
          class="relative flex h-6 w-24 items-center rounded-full border border-zinc-700 bg-zinc-950 text-[10px] font-semibold tracking-wide uppercase"
          onclick={toggleMode}
          data-testid="mode-toggle"
          title="⌘B build · ⌘P plan"
        >
          <span
            class="absolute top-0.5 h-5 w-11 rounded-full transition-transform duration-150
              {draft.mode === 'plan'
              ? 'translate-x-[2.9rem] bg-indigo-500/30'
              : 'translate-x-0.5 bg-zinc-700'}"
          ></span>
          <span class="z-10 flex-1 text-center {draft.mode === 'build' ? 'text-zinc-100' : 'text-zinc-500'}">Build</span>
          <span class="z-10 flex-1 text-center {draft.mode === 'plan' ? 'text-indigo-300' : 'text-zinc-500'}">Plan</span>
        </button>

        <div class="flex items-center gap-2">
          <!-- Model selector -->
          <div class="relative">
            <button
              class="max-w-44 truncate rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              onclick={openModelMenu}
              data-testid="model-selector"
              title="Model"
            >{meta?.model?.name ?? "model…"}</button>
            {#if modelMenuOpen}
              <div
                class="absolute right-0 bottom-full z-30 mb-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
                data-testid="model-menu"
              >
                {#each sessionMetas.models as m (`${m.provider}/${m.id}`)}
                  <button
                    class="flex w-full items-baseline gap-2 px-3 py-1 text-left text-xs hover:bg-zinc-800
                      {meta?.model?.id === m.id && meta?.model?.provider === m.provider ? 'text-zinc-100' : 'text-zinc-400'}"
                    onclick={() => pickModel(m.provider, m.id)}
                  >
                    <span class="truncate">{m.name}</span>
                    <span class="ml-auto shrink-0 text-[10px] text-zinc-600">{m.provider}</span>
                  </button>
                {:else}
                  <p class="px-3 py-2 text-xs text-zinc-600">Loading…</p>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Thinking level -->
          {#if meta && meta.availableThinkingLevels.length > 1}
            <button
              class="rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              onclick={cycleThinking}
              data-testid="thinking-selector"
              title="Thinking level (click to cycle)"
            >🧠 {meta.thinkingLevel}</button>
          {/if}

          <!-- Context usage -->
          {#if meta?.contextPercent != null}
            <div
              class="flex items-center gap-1"
              title={`Context: ${meta.contextTokens?.toLocaleString() ?? "?"} / ${meta.contextWindow?.toLocaleString() ?? "?"} tokens`}
              data-testid="context-usage"
            >
              <div class="h-1 w-12 overflow-hidden rounded-full bg-zinc-800">
                <div
                  class="h-full rounded-full {meta.contextPercent > 80
                    ? 'bg-red-400'
                    : meta.contextPercent > 60
                      ? 'bg-amber-400'
                      : 'bg-emerald-500'}"
                  style="width: {Math.min(100, meta.contextPercent)}%"
                ></div>
              </div>
              <span class="text-[10px] text-zinc-600">{Math.round(meta.contextPercent)}%</span>
            </div>
          {/if}

          <span class="text-[10px] text-zinc-600">
            {running ? "Enter to queue" : "Enter to send"} · ⇧Enter newline
          </span>
          {#if running && !draft.text.trim()}
            <button
              class="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/30"
              onclick={() => api.invoke("threads:abort", thread.id)}
              data-testid="abort">Stop</button
            >
          {:else}
            <button
              class="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-30
                {draft.mode === 'plan'
                ? 'bg-indigo-500 text-white'
                : 'bg-zinc-100 text-zinc-900'}"
              onclick={() => submit()}
              disabled={!draft.text.trim() && draft.attachments.length === 0}
              data-testid="send">{running ? "Queue" : "Send"}</button
            >
          {/if}
        </div>
      </div>
    </div>
  </div>
</footer>
