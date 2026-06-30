<script lang="ts">
  // Context-usage bar under the textarea: percent fill, auto-compact marker,
  // token readout, and the manual Compact button. Extracted from
  // Composer.svelte (issue #55). The host derives the trigger percent/tokens
  // (from the live session meta + auto-compact prefs); this component only
  // renders. Manual compact fires the typed `api` seam directly (same as the
  // inline handler did).
  import type { SessionMeta } from "@peach-pi/shared-types";
  import Tooltip from "../Tooltip.svelte";
  import { api } from "../../lib/ipc";
  import { captureEvent } from "../../lib/telemetry";

  let {
    meta,
    running,
    threadId,
    autoCompactPercent,
    autoCompactTokens,
  }: {
    meta: SessionMeta | null | undefined;
    running: boolean;
    threadId: string;
    autoCompactPercent: number;
    autoCompactTokens: number | null;
  } = $props();

  const fmtTokens = (n: number | null | undefined): string => {
    if (n == null) return "\u2014";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(Math.round(n));
  };
</script>

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
          onclick={() => { captureEvent("context_compacted"); void api.invoke("threads:compact", threadId); }}
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
