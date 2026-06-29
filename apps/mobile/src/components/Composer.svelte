<script lang="ts">
  import { sendMessage, steerMessage, abortRun, deleteQueued } from "../lib/api.ts";
  import type { ModelInfo, ImagePayload, ScopedModel, ThinkingLevel, SessionMeta } from "@peach-pi/shared-types";
  import type { Master } from "../lib/store.svelte.ts";
  import Icon from "./Icon.svelte";
  import ModelPicker from "./ModelPicker.svelte";
  import ReasoningDial from "./ReasoningDial.svelte";

  let {
    master,
    threadId,
    running,
    followUp,
    models,
    sessionModel,
    sessionThinking,
    availableThinking,
    meta,
    onError,
  }: {
    master: Master;
    threadId: string;
    running: boolean;
    followUp: string[];
    models: ScopedModel[];
    sessionModel: ModelInfo | null;
    sessionThinking: ThinkingLevel;
    availableThinking: ThinkingLevel[];
    meta: SessionMeta | null;
    onError: (msg: string) => void;
  } = $props();

  let text = $state("");
  let sending = $state(false);
  // Steer = inject into the running turn now, vs. the default queue-as-follow-up.
  let steer = $state(false);
  let ta = $state<HTMLTextAreaElement | null>(null);

  // Composer-local override state (null = use the master's session default).
  // Persists until send (override applies to that message) or reset.
  let overrideModel = $state<ModelInfo | null>(null);
  let overrideThinking = $state<ThinkingLevel | null>(null);
  let showPicker = $state(false);
  // Overflow menu: steer toggle, reset-override, full model & reasoning sheet.
  let showOverflow = $state(false);

  // Image attachments pasted/dropped into the composer (ADR-0011). Mirrors
  //  the desktop's ComposerImageAttachment but in-memory + sent as
  //  ImagePayload alongside the text. Steer turns never carry images.
  type DraftImage = { id: string; name: string; mimeType: string; data: string; url: string };
  let images = $state<DraftImage[]>([]);
  let fileInput = $state<HTMLInputElement | null>(null);

  const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  const MAX_IMAGES = 8;
  // ~10MB base64 cap per image — bounded relay body.
  const MAX_IMAGE_BASE64 = 14_000_000;

  const activeModel = $derived(overrideModel ?? sessionModel);
  const activeThinking = $derived(overrideThinking ?? sessionThinking);
  const hasOverride = $derived(!!overrideModel || !!overrideThinking);

  // Pinned slider slots: up to three scoped models echoed in the metallic
  // slider (mirrors the desktop's pinned-slot affordance). In-memory on the
  // phone — the desktop persists these in modelPrefs, but the mobile composer
  // is per-thread and reconstructs from the catalog each open.
  const scopedModels = $derived(models.filter((m) => m.scoped));
  const sliderSlots = $derived.by(() => {
    const byKey = new Map(scopedModels.map((m) => [`${m.provider}:${m.id}`, m]));
    const picked: ScopedModel[] = [];
    const activeKey = activeModel ? `${activeModel.provider}:${activeModel.id}` : null;
    if (activeKey) {
      const a = byKey.get(activeKey);
      if (a) picked.push(a);
    }
    for (const m of scopedModels) {
      if (picked.length >= 3) break;
      if (!picked.some((p) => p.provider === m.provider && p.id === m.id)) picked.push(m);
    }
    const overflow = picked.length < 4 && activeKey && !picked.some((p) => `${p.provider}:${p.id}` === activeKey)
      ? scopedModels.find((m) => `${m.provider}:${m.id}` === activeKey)
      : null;
    return overflow ? [...picked, overflow].slice(0, 4) : picked.slice(0, 4);
  });

  function shortLabel(label: string): string {
    return label
      .replace(/^claude\s+/i, "Claude ")
      .replace(/^gpt-?5/i, "GPT-5")
      .replace(/\s+/g, " ")
      .trim();
  }
  const keyOf = (m: ScopedModel | ModelInfo) => `${m.provider}:${m.id}`;
  const activeKey = $derived(activeModel ? keyOf(activeModel) : null);
  const sliderPosition = $derived.by(() => {
    const idx = sliderSlots.findIndex((m) => keyOf(m) === activeKey);
    return idx >= 0 ? idx : 1;
  });

  const hasText = $derived(text.trim().length > 0);
  // Empty + running → the button stops the run (mirrors the desktop send-dial).
  const isStop = $derived(running && !hasText);

  function grow(): void {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  function pickSlot(m: ScopedModel): void {
    overrideModel = { provider: m.provider, id: m.id, name: m.name };
  }

  async function submit(): Promise<void> {
    if (isStop) return void stop();
    const body = text.trim();
    if (!body || sending) return;
    sending = true;
    try {
      if (steer && running) {
        await steerMessage(master, threadId, body);
      } else {
        // Only forward an override when the user set one this turn.
        const opts: { model?: ModelInfo; thinking?: ThinkingLevel; images?: ImagePayload[] } = {};
        if (overrideModel) opts.model = overrideModel;
        if (overrideThinking) opts.thinking = overrideThinking;
        if (images.length) {
          opts.images = images.map((i) => ({ mimeType: i.mimeType, data: i.data }));
        }
        await sendMessage(master, threadId, body, Object.keys(opts).length ? opts : undefined);
        // Override applied on the master; subsequent turns use the session default.
        overrideModel = null;
        overrideThinking = null;
        for (const i of images) URL.revokeObjectURL(i.url);
        images = [];
      }
      text = "";
      steer = false;
      queueMicrotask(grow);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      sending = false;
    }
  }

  async function stop(): Promise<void> {
    try {
      await abortRun(master, threadId);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function dropQueued(index: number): Promise<void> {
    try {
      await deleteQueued(master, threadId, "followUp", index);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  function cycleThinking(): void {
    const order: ThinkingLevel[] = availableThinking.length ? availableThinking : ["off"];
    const current = overrideThinking ?? sessionThinking ?? "off";
    const idx = order.indexOf(current);
    overrideThinking = order[(idx + 1) % order.length] ?? "off";
  }

  function onKeydown(e: KeyboardEvent): void {
    // Enter sends; Shift+Enter newlines. (Soft keyboards mostly send a newline,
    // so the button is the primary affordance — this just helps hardware ones.)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  // ── Image attachments ───────────────────────────────────────────────
  // PWA paste/drop: read image File blobs into base64 ImagePayload chunks
  // (mirrors the desktop composer-attachments path, but browser-only — no
  // main-process file reader needed). Steer turns are text-only; images are
  // dropped when the user flips a turn into a steer.
  function isImageFile(file: File): boolean {
    return SUPPORTED_IMAGE_MIME.has(file.type) || SUPPORTED_IMAGE_MIME.has(`image/${file.name.split(".").pop()?.toLowerCase()}`);
  }

  async function addFiles(files: File[]): Promise<void> {
    const imgs = files.filter(isImageFile);
    for (const file of imgs) {
      if (images.length >= MAX_IMAGES) {
        onError(`Max ${MAX_IMAGES} images per message`);
        break;
      }
      const read = await readImageFile(file);
      if (read) images = [...images, read];
    }
  }

  function readImageFile(file: File): Promise<DraftImage | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const comma = dataUrl.indexOf(",");
        if (comma < 0) return resolve(null);
        const data = dataUrl.slice(comma + 1);
        if (data.length > MAX_IMAGE_BASE64) {
          onError(`"${file.name}" too large (max ~10MB)`);
          return resolve(null);
        }
        const mimeType = file.type || "image/png";
        resolve({
          id: crypto.randomUUID(),
          name: file.name || "pasted-image.png",
          mimeType: SUPPORTED_IMAGE_MIME.has(file.type) ? mimeType : "image/png",
          data,
          url: dataUrl,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function removeImage(id: string): void {
    const img = images.find((i) => i.id === id);
    if (img) URL.revokeObjectURL(img.url);
    images = images.filter((i) => i.id !== id);
  }

  function onPaste(e: ClipboardEvent): void {
    const cd = e.clipboardData;
    if (!cd) return;
    const files: File[] = [];
    for (const item of Array.from(cd.items ?? [])) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  function onFileInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    void addFiles(files);
    input.value = "";
  }

  const fmtTokens = (n: number | null | undefined): string => {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(Math.round(n));
  };
</script>

<div class="composer-device border-t border-border px-3 pt-2 pb-3">{#if followUp.length > 0}
    <div class="mb-2 flex flex-col gap-1.5">
      {#each followUp as msg, i (i)}
        <div class="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
          <span class="shrink-0 text-fainter"><Icon name="message" size={12} sw={1.7} /></span>
          <span class="min-w-0 flex-1 truncate text-[12px] text-muted">{msg}</span>
          <span class="shrink-0 text-[10px] font-medium text-fainter">queued</span>
          <button
            class="-mr-0.5 shrink-0 text-fainter"
            onclick={() => dropQueued(i)}
            aria-label="Remove queued message"
          >
            <Icon name="x" size={13} sw={2} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="composer__frame">
    <div class="composer__surface">
      <div class="composer__editor">
        <div
          class="composer__screen"
          role="button"
          tabindex="-1"
          onmousedown={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest("textarea, button")) return;
            e.preventDefault();
            ta?.focus();
          }}
        >
          <textarea
            bind:this={ta}
            bind:value={text}
            oninput={grow}
            onkeydown={onKeydown}
            onpaste={onPaste}
            rows="1"
            placeholder={running
              ? (steer ? "steer the running turn…" : "queue a follow-up…")
              : "message the clunker"}
            class="max-h-40 min-h-[22px] w-full resize-none bg-transparent text-[15px] leading-[1.4] text-fg outline-none placeholder:text-fainter"
          ></textarea>

          {#if images.length > 0}
            <div class="composer__images">
              {#each images as img (img.id)}
                <div class="composer__image-chip">
                  <img src={img.url} alt={img.name} />
                  <button
                    class="composer__image-remove"
                    onclick={() => removeImage(img.id)}
                    aria-label={`Remove ${img.name}`}
                  >
                    <Icon name="x" size={10} sw={3} />
                  </button>
                </div>
              {/each}
            </div>
          {/if}

          {#if meta?.contextPercent != null}
            <div class="composer__context">
              <div class="composer__context-track">
                <div class="composer__context-fill" style="width: {Math.min(100, meta.contextPercent)}%"></div>
              </div>
              <span class="composer__context-label">
                {fmtTokens(meta.contextTokens)} / {fmtTokens(meta.contextWindow)}
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

      <!-- Controls strip: model slider · reasoning dial · send dial · overflow -->
      <div class="composer__footer-row">
        <div class="composer__controls">
          <span class="composer__key-mount">
            <span
              class="model-selector__badge model-selector__badge--slider"
              style="--model-slider-position: {sliderPosition}"
            >
              <span class="model-selector__slider" aria-hidden="true">
                <span class="model-selector__slider-ticks">
                  <span class="model-selector__slider-tick model-selector__slider-tick--0"></span>
                  <span class="model-selector__slider-tick model-selector__slider-tick--1"></span>
                  <span class="model-selector__slider-tick model-selector__slider-tick--2"></span>
                </span>
                <span class="model-selector__slider-track">
                  <span class="model-selector__slider-rail"></span>
                  <span class="model-selector__slider-glow"></span>
                </span>
                <span class="model-selector__slider-thumb"></span>
              </span>

              {#each sliderSlots as option, index (keyOf(option))}
                {@const isActive = keyOf(option) === activeKey}
                <button
                  class="model-selector__slider-label model-selector__slider-label--slot model-selector__slider-label--slot-{index}{isActive
                    ? ' model-selector__slider-label--selected'
                    : ''}"
                  type="button"
                  title={`Switch to ${option.name}`}
                  onclick={() => pickSlot(option)}
                  aria-label={`Model ${option.name}`}
                >
                  {shortLabel(option.name)}
                </button>
              {/each}

              {#if sliderSlots.length < 4}
                <button
                  class="model-selector__slider-label model-selector__slider-label--slot model-selector__slider-label--slot-3 model-selector__slider-label--menu"
                  type="button"
                  aria-label="Open full model & reasoning menu"
                  aria-expanded={showPicker}
                  onclick={() => (showPicker = true)}
                >…</button>
              {/if}
            </span>
          </span>

          {#if availableThinking.length >= 1}
            <ReasoningDial
              level={activeThinking}
              available={availableThinking}
              onCycle={cycleThinking}
            />
          {/if}

          <button
            class="composer__overflow"
            onclick={() => fileInput?.click()}
            aria-label="Attach image"
            title="Attach image"
            disabled={steer && running}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-3.5-3.5L7 22" />
            </svg>
          </button>
          <input
            bind:this={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            onchange={onFileInput}
            class="hidden"
          />

          <button
            class="composer__overflow"
            onclick={() => (showOverflow = !showOverflow)}
            aria-label="More composer options"
            aria-expanded={showOverflow}
            title="More"
          >
            <Icon name="more" size={20} sw={2.4} />
          </button>
        </div>

        <div class="composer__actions">
          {#if isStop}
            <button
              class="send-dial send-dial--stop"
              onclick={stop}
              title="Stop run"
              aria-label="Stop run"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
            </button>
          {:else}
            <button
              class="send-dial"
              data-has-input={hasText ? "" : undefined}
              onclick={() => void submit()}
              disabled={!hasText || sending}
              title={running ? "Queue message" : "Send message"}
              aria-label={running ? "Queue message" : "Send message"}
              aria-busy={sending ? "true" : undefined}
            >
              {#if sending}
                <Icon name="spinner" size={22} sw={3} />
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>

    {#if showOverflow && (running && hasText || hasOverride)}
      <div class="composer__overflow-menu pp-banner-in">
        {#if running && hasText}
          <button
            class="composer__overflow-item {steer ? 'is-on' : ''}"
            onclick={() => {
              const next = !steer;
              if (next && images.length) {
                for (const i of images) URL.revokeObjectURL(i.url);
                images = [];
              }
              steer = next;
            }}
            aria-pressed={steer}
          >
            <Icon name="send" size={15} sw={2} />
            <span>Steer the running turn</span>
          </button>
        {/if}
        {#if hasOverride}
          <button
            class="composer__overflow-item"
            onclick={() => { overrideModel = null; overrideThinking = null; }}
            title="Reset to session default"
          >
            <Icon name="refresh" size={15} sw={1.8} />
            <span>Reset model & reasoning</span>
          </button>
        {/if}
        <button
          class="composer__overflow-item"
          onclick={() => { showOverflow = false; showPicker = true; }}
        >
          <Icon name="chevron-down" size={15} sw={2} />
          <span>All models & reasoning…</span>
        </button>
      </div>
    {/if}
  </div>

  {#if showPicker}
    <ModelPicker
      {models}
      selected={activeModel}
      thinking={activeThinking}
      availableThinking={availableThinking}
      onSelectModel={(m) => { overrideModel = m; showPicker = false; }}
      onSetThinking={(t) => { overrideThinking = t; }}
      onClose={() => (showPicker = false)}
    />
  {/if}
</div>

<style>
  /* Mobile composer: the metallic chassis from composer-device.css is the base,
     so we only override what the phone layout needs. The desktop is scaled by
     zoom:0.78 on a 985px-wide frame; the phone runs at ~full viewport width,
     so the slider badge is narrowed and the footer wraps to a second row when
     the phone can't fit the full strip. dpi-scale stays 1 (no zoom needed —
     the phone is already a small physical device). */
  .composer-device .composer__frame {
    width: 100%;
    max-width: 100%;
    margin-inline: 0;
    zoom: 1;
  }
  /* The desktop chassis renders its parts at full pixel size under zoom:0.78.
     The phone runs zoom:1 at full width, so the dial/send/slider come out
     ~30% too large. Shrink the individual parts (not the whole frame, which
     would leave a gutter) to bring the chassis to a phone-native height. */
  .composer-device .composer__surface {
    padding: 9px 9px 8px;
    border-radius: 13px;
  }
  .composer-device .composer__screen {
    min-height: 64px;
    padding: 11px 13px;
    border-radius: 12px;
  }
  .composer-device .reasoning-dial {
    --dial-size: 50px;
  }
  .composer-device .send-dial,
  .composer-device .send-dial--stop {
    width: 46px;
    min-width: 46px;
    height: 46px;
    margin-left: 8px;
  }
  /* The slider badge is 360px on desktop. On the phone we let it flex down and
     hide the inactive slot tick labels under narrow widths. */
  .composer-device .model-selector__badge--slider,
  :root[data-composer="dark"].composer-device .model-selector__badge--slider {
    width: 100%;
    min-width: 0;
    max-width: 300px;
    height: 62px;
  }
  .composer-device .composer__footer-row {
    /* Wrap the controls below the editor screen on narrow phones; the slider
       + dial take the first row, the overflow/send take the second. */
    flex-wrap: wrap;
    gap: 6px 8px;
    justify-content: flex-start;
  }
  .composer-device .composer__overflow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 0;
    color: var(--crt-ink-muted, var(--muted));
    background:
      linear-gradient(180deg, oklch(0.92 0.003 250) 0%, oklch(0.8 0.003 250) 52%, oklch(0.7 0.003 250) 100%);
    box-shadow:
      inset 0 1px 0 oklch(1 / 0.85),
      inset 0 0 0 1px oklch(0.6 0.004 250 / 0.4),
      0 0 0 1px oklch(0.34 0.004 250 / 0.55),
      0 2px 4px oklch(0 0 0 / 0.25);
    cursor: pointer;
    transition: transform 80ms ease, box-shadow 80ms ease;
  }
  .composer-device .composer__overflow:active {
    transform: translateY(2px);
    box-shadow:
      inset 0 2px 4px oklch(0 0 0 / 0.4),
      inset 0 0 0 1px oklch(0.55 0.004 250 / 0.5);
  }
  .composer-device .composer__overflow[aria-expanded="true"] {
    color: oklch(0.72 0.18 52);
  }
  .composer__overflow-menu {
    margin: 8px 0 2px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border-radius: 10px;
    background: var(--color-surface-2);
    border: 1px solid var(--color-border);
  }
  .composer__overflow-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--color-fg);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .composer__overflow-item.is-on {
    background: color-mix(in oklch, var(--color-accent) 14%, transparent);
    color: var(--color-accent);
  }
  .composer__overflow-item:hover {
    background: var(--color-surface);
  }
  .composer__images {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 0 6px;
  }
  .composer__image-chip {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 7px;
    overflow: hidden;
    border: 1px solid oklch(0.78 0.015 90 / 0.55);
    box-shadow: 0 1px 3px oklch(0.42 0.004 250 / 0.3);
  }
  .composer__image-chip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .composer__image-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 999px;
    color: white;
    background: oklch(0.2 0.005 250 / 0.78);
   cursor: pointer;
  }
  .composer__image-remove:hover {
    background: oklch(0.5 0.18 28 / 0.9);
  }
</style>
