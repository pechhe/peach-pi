<script lang="ts">
  import { sendMessage, steerMessage, abortRun, deleteQueued } from "../lib/api.ts";
  import type { ModelInfo, ImagePayload, ScopedModel, ThinkingLevel, SessionMeta } from "@peach-pi/shared-types";
  import type { Master } from "../lib/store.svelte.ts";
  import Icon from "./Icon.svelte";
  import ModelPicker from "./ModelPicker.svelte";
  import ReasoningDial from "./ReasoningDial.svelte";
  import { haptic } from "../lib/haptic.ts";

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

  // Image attachments pasted/dropped into the composer (ADR-0011). Mirrors
  //  the desktop's ComposerImageAttachment but in-memory + sent as
  //  ImagePayload alongside the text. Steer turns never carry images.
  type DraftImage = { id: string; name: string; mimeType: string; data: string; url: string };
  let images = $state<DraftImage[]>([]);

  const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  const MAX_IMAGES = 8;
  // ~10MB base64 cap per image — bounded relay body.
  const MAX_IMAGE_BASE64 = 14_000_000;

  const activeModel = $derived(overrideModel ?? sessionModel);
  const activeThinking = $derived(overrideThinking ?? sessionThinking);

  // Pinned slider slots: STABLE first-three scoped models (catalog order). The
  // thumb slides to whichever slot is active — slots never reorder (that was
  // the "it just replaces the first one" bug). Mirrors desktop ModelSelector:
  // when the active model isn't one of the three pinned, it's appended as a
  // 4th overflow slot so the thumb still has somewhere to point.
  const keyOf = (m: ScopedModel | ModelInfo) => `${m.provider}:${m.id}`;
  const activeKey = $derived(activeModel ? keyOf(activeModel) : null);
  const scopedModels = $derived(models.filter((m) => m.scoped));
  const pinnedSlots = $derived(scopedModels.slice(0, 3));
  const overflowSlot = $derived.by(() => {
    if (!activeKey || pinnedSlots.some((m) => keyOf(m) === activeKey)) return null;
    return scopedModels.find((m) => keyOf(m) === activeKey) ?? null;
  });
  const sliderSlots = $derived(overflowSlot ? [...pinnedSlots, overflowSlot] : pinnedSlots);
  const sliderSpan = $derived(Math.max(1, sliderSlots.length - 1));
  const sliderPosition = $derived.by(() => {
    const idx = sliderSlots.findIndex((m) => keyOf(m) === activeKey);
    return idx >= 0 ? idx : 0;
  });

  function shortLabel(label: string): string {
    return label
      .replace(/^claude\s+/i, "Claude ")
      .replace(/^gpt-?5/i, "GPT-5")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Tap-anywhere / drag the metallic track. While dragging the thumb tracks
  // the pointer continuously (--drag-frac, no transition); each time the
  // nearest slot changes we apply it (detent tick). On release the thumb snaps
  // back to the discrete slot (transition re-enables).
  let sliderEl = $state<HTMLElement | null>(null);
  let dragging = $state(false);
  let dragFrac = $state(0);
  let dragSlot = -1;

  function applyDrag(clientX: number): void {
    if (!sliderEl) return;
    const r = sliderEl.getBoundingClientRect();
    if (r.width <= 0) return;
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    dragFrac = frac;
    const idx = Math.max(0, Math.min(sliderSpan, Math.round(frac * sliderSpan)));
    if (idx !== dragSlot) {
      dragSlot = idx; // crossed into a new model slot → detent
      const m = sliderSlots[idx];
      if (m) pickSlot(m); // pickSlot fires the haptic
    }
  }

  function onSliderPointerDown(e: PointerEvent): void {
    e.preventDefault();
    dragging = true;
    dragSlot = -1;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    applyDrag(e.clientX);
  }
  function onSliderPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    applyDrag(e.clientX);
  }
  function onSliderPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }
  function onSliderPointerCancel(): void {
    dragging = false;
  }

  const hasText = $derived(text.trim().length > 0);
  // Empty + running → the button stops the run (mirrors the desktop send-dial).
  const isStop = $derived(running && !hasText);

  function grow(): void {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  function pickSlot(m: ScopedModel): void {
    // Only tick when the selection actually crosses into a new slot, so a
    // drag across the track feels like detents rather than a buzz.
    if (overrideModel?.provider === m.provider && overrideModel?.id === m.id) return;
    overrideModel = { provider: m.provider, id: m.id, name: m.name };
    haptic(6);
  }

  async function submit(): Promise<void> {
    if (isStop) return void stop();
    const body = text.trim();
    if (!body || sending) return;
    haptic(12);
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
    haptic(12);
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
    haptic(6);
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
              class="model-selector__badge model-selector__badge--slider{dragging ? ' is-dragging' : ''}"
              style="--model-slider-position: {sliderPosition}; --slider-span: {sliderSpan}; --drag-frac: {dragFrac}"
            >
              <span
                bind:this={sliderEl}
                class="model-selector__slider"
                aria-hidden="true"
                onpointerdown={onSliderPointerDown}
                onpointermove={onSliderPointerMove}
                onpointerup={onSliderPointerUp}
                onpointercancel={onSliderPointerCancel}
              >
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
    padding: 8px 8px 7px;
    border-radius: 13px;
    overflow: hidden;
  }
  .composer-device .composer__screen {
    min-height: 50px;
    padding: 9px 12px;
    border-radius: 11px;
  }
  /* Desktop uses display:contents so the footer lays out its tools directly.
     On the phone we want controls to be a real flex row holding slider + dial,
     with the send dial pulled out to the actions cluster on the right edge. */
  .composer-device .composer__controls,
  .composer-device .composer__actions {
    display: flex;
    align-items: center;
  }
  .composer-device .composer__controls {
    min-width: 0;
    flex: 1 1 auto;
    gap: 6px;
  }
  .composer-device .composer__actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* Two-row chassis like desktop: screen, then a single controls row. The
     controls never wrap — the slider flexes to fill, the dial/send are fixed
     compact widths. */
  .composer-device .composer__key-mount {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
  }
  .composer-device .reasoning-dial {
    --dial-size: 36px;
    flex: 0 0 auto;
  }
  .composer-device .send-dial,
  .composer-device .send-dial--stop {
    width: 38px;
    min-width: 38px;
    height: 38px;
    margin-left: 4px;
    flex: 0 0 auto;
  }
  /* The slider badge is 360px on desktop with fixed-px thumb/tick geometry
     (52px + pos*128px) that overflows a phone. Let it flex full width and
     re-derive the thumb/ticks as percentages of the actual track so nothing
     spills past the viewport (was the source of horizontal scroll). */
  .composer-device .model-selector__badge--slider,
  :root[data-composer="dark"].composer-device .model-selector__badge--slider {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: 56px;
  }
  /* Keep the three model captions from colliding when the slider is narrow:
     each is capped to a third of the track and anchored to its tick. */
  .composer-device .model-selector__badge--slider .model-selector__slider-label--slot {
    width: 34%;
    max-width: 34%;
  }
  .composer-device .model-selector__badge--slider .model-selector__slider-label--slot-2 {
    left: auto;
    right: 0;
  }
  .composer-device .model-selector__slider {
    pointer-events: auto;
    touch-action: none;
    cursor: pointer;
  }
  /* Percentage thumb/tick geometry keyed off --slider-span (= slots - 1).
     20px inset keeps the ~40px thumb fully on-track at the extremes. */
  .composer-device .model-selector__badge--slider .model-selector__slider-thumb,
  .composer-device .model-selector__badge--slider .model-selector__slider-glow {
    left: calc(20px + (var(--model-slider-position, 0) / var(--slider-span, 2)) * (100% - 40px));
  }
  .composer-device .model-selector__badge--slider .model-selector__slider-ticks {
    left: 0;
    right: 0;
  }
  .composer-device .model-selector__badge--slider .model-selector__slider-tick--0 { left: 20px; }
  .composer-device .model-selector__badge--slider .model-selector__slider-tick--1 { left: 50%; }
  .composer-device .model-selector__badge--slider .model-selector__slider-tick--2 { left: calc(100% - 20px); }
  .composer-device .model-selector__badge--slider .model-selector__slider-label--slot-2 {
    right: 0;
  }
  /* While dragging: thumb tracks the pointer continuously (--drag-frac),
     no transition lag. On release the class drops and the 460ms transition
     snaps it back to the discrete slot. */
  .composer-device .model-selector__badge--slider.is-dragging .model-selector__slider-thumb,
  .composer-device .model-selector__badge--slider.is-dragging .model-selector__slider-glow {
    left: calc(20px + var(--drag-frac, 0) * (100% - 40px)) !important;
    transition: none !important;
  }
  .composer-device .composer__footer-row {
    flex-wrap: nowrap;
    gap: 4px;
    justify-content: flex-start;
    min-height: 0;
    padding: 8px 8px 2px;
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
