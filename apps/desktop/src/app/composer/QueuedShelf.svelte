<script lang="ts">
  // Queued follow-up messages shelf — the metal chassis bar above the composer
  // surface. Extracted from Composer.svelte (issue #55). One row per queued
  // message with steer/remove controls. Routing the promote/delete IPC calls
  // here keeps the host free of per-row plumbing; the typed `api` seam is the
  // only main-process touch.
  import { api } from "../../lib/ipc";

  let {
    threadId,
    followUp,
  }: {
    threadId: string;
    followUp: string[];
  } = $props();
</script>

{#if followUp.length > 0}
  <section
    class="qq"
    data-testid="queued-shelf"
    role="list"
    aria-label={`${followUp.length} queued`}
  >
    {#each followUp as t, i ("f-" + i)}
      <div class="qq-row" role="listitem">
        <span class="qq-row__dot" aria-hidden="true"></span>
        <span class="qq-row__label">QUEUE</span>
        <span class="qq-row__count" aria-hidden="true">{i + 1}</span>
        <span class="qq-row__text" title={t}>{t}</span>
        <button
          class="qq-row__btn qq-row__btn--promote"
          onclick={() => api.invoke("threads:promoteFollowUpToSteer", threadId, i)}
          title="Steer now"
          aria-label="Steer now"
          data-testid="promote-steer"
        ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        <button
          class="qq-row__btn qq-row__btn--delete"
          onclick={() => api.invoke("threads:deleteFollowUp", threadId, i).catch(console.error)}
          title="Remove"
          aria-label="Remove queued message"
          data-testid="delete-followup"
        ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button>
      </div>
    {/each}
  </section>
{/if}

<style>
  /* Queued-messages shelf — metallic chassis bar matching composer surface.
     One raised metal row per queued message: dot + QUEUE wordmark + pos +
     mono text + steer/remove controls. Reuses --crt-body* so dark mode
     (composer-device-dark.css overrides) stays in sync. */
  .qq {
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .qq-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 8px 6px 10px;
    border-radius: 9px;
    isolation: isolate;
    min-width: 0;
    background:
      linear-gradient(180deg, oklch(1 0.002 250 / 0.5), oklch(0.92 0.003 250 / 0.12) 48%, oklch(0.66 0.003 250 / 0.1) 100%),
      linear-gradient(180deg, var(--crt-body-top) 0%, var(--crt-body) 52%, var(--crt-body-bottom) 100%);
    box-shadow:
      inset 0 1px 0 oklch(1 0.002 250 / 0.9),
      inset 0 2px 3px oklch(1 0.002 250 / 0.32),
      inset 1px 0 0 oklch(1 0.002 250 / 0.42),
      inset -1px 0 0 oklch(0.34 0.004 250 / 0.3),
      0 0 0 0.5px oklch(0.9 0.002 250 / 0.7),
      0 1px 0 0.5px oklch(0.58 0.004 250 / 0.5),
      0 2px 4px -1px oklch(0.22 0.004 250 / 0.45),
      0 5px 10px -4px oklch(0 0 0 / 0.4);
    animation: qq-slide 160ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .qq-row::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    border-radius: inherit;
    opacity: 0.5;
    background:
      linear-gradient(90deg, oklch(1 0.002 250 / 0.24), transparent 8%, transparent 92%, oklch(0.3 0.004 250 / 0.1)),
      linear-gradient(180deg, oklch(1 0.002 250 / 0.3), transparent 12%, transparent 88%, oklch(0.3 0.004 250 / 0.12));
  }
  .qq-row > * { position: relative; z-index: 1; }

  .qq-row__dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: oklch(0.72 0.19 52);
    box-shadow:
      0 0 6px 0 oklch(0.72 0.19 52 / 0.7),
      inset 0 0 0 0.5px oklch(0.55 0.2 52 / 0.6);
    animation: qq-pulse 1.6s ease-out infinite;
  }
  .qq-row__label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: oklch(0.42 0.004 250);
    user-select: none;
  }
  .qq-row__count {
    flex: none;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums;
    color: oklch(0.4 0.004 250);
    background: oklch(0.94 0.003 250 / 0.55);
    box-shadow:
      inset 0 1px 0 oklch(1 / 0.6),
      inset 0 -1px 0 oklch(0.6 0.004 250 / 0.18),
      0 0 0 0.5px oklch(0.7 0.004 250 / 0.4);
  }
  .qq-row__text {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12px;
    line-height: 1.35;
    font-family: ui-monospace, "SF Mono", Menlo, "Roboto Mono", monospace;
    color: oklch(0.5 0.004 250 / 0.85);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: text;
  }
  .qq-row__btn {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.4 0.004 250 / 0.7);
    opacity: 0.6;
    cursor: pointer;
    background: oklch(0.92 0.003 250 / 0.4);
    box-shadow:
      inset 0 1px 0 oklch(1 / 0.5),
      0 0 0 0.5px oklch(0.7 0.004 250 / 0.35);
    transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
  }
  .qq-row:hover .qq-row__btn,
  .qq-row:focus-within .qq-row__btn { opacity: 1; }
  .qq-row__btn--promote:hover {
    background: oklch(0.72 0.19 52 / 0.22);
    color: oklch(0.62 0.2 52);
  }
  .qq-row__btn--delete:hover {
    background: oklch(0.6 0.22 25 / 0.2);
    color: oklch(0.55 0.24 25);
  }
  .qq-row__btn svg { width: 11px; height: 11px; }

  /* Dark-mode reassurance: chassis vars are overridden by composer-device-dark,
     but the muted ink/espresso text helpers below use color-mix on those vars so
     both themes read correctly without per-theme rules. */
  :global([data-composer="dark"]) .qq-row__label {
    color: color-mix(in oklch, var(--crt-body-top) 55%, oklch(0.7 0.004 250));
  }
  :global([data-composer="dark"]) .qq-row__text {
    color: color-mix(in oklch, var(--crt-body-top) 48%, transparent);
  }
  :global([data-composer="dark"]) .qq-row__btn {
    color: color-mix(in oklch, var(--crt-body-top) 55%, transparent);
  }

  @keyframes qq-pulse {
    0% { box-shadow: 0 0 0 0 oklch(0.72 0.19 52 / 0.5), inset 0 0 0 0.5px oklch(0.55 0.2 52 / 0.6); }
    70% { box-shadow: 0 0 0 4px oklch(0.72 0.19 52 / 0), inset 0 0 0 0.5px oklch(0.55 0.2 52 / 0.6); }
    100% { box-shadow: 0 0 0 0 oklch(0.72 0.19 52 / 0), inset 0 0 0 0.5px oklch(0.55 0.2 52 / 0.6); }
  }
  @keyframes qq-slide {
    from { opacity: 0; transform: translateY(-3px) scale(0.985); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .qq-row { animation: none; }
    .qq-row__dot { animation: none; }
  }
</style>
