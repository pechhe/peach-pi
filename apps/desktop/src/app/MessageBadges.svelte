<script lang="ts">
  // Renders the @-connection and @-secret badges for a stored user message.
  //
  // A pinned prompt arrives as a plain-text hint block prepended to the body
  // (see lib/composer/hints.ts). The transcript shouldn't show that block — it
  // should show compact badges plus the body the user actually typed. This
  // component owns the two-step parse chain (connections, then secrets on the
  // remaining body) so callers don't have to duplicate it.
  //
  // `variant`:
  //   - "rich": full badges with logos + icons (Main Window timeline).
  //   - "hud":  minimal text badges (HUD composer peek).
  //
  // The message body left after stripping both hint blocks is yielded to the
  // `children` snippet as `{ body }`, so the caller renders the bubble text.
  import KeyRound from "@lucide/svelte/icons/key-round";
  import ConnectorIcon from "./ConnectorIcon.svelte";
  import { parseConnectionsHint, parseSecretsHint } from "../lib/composer/hints";

  let {
    text,
    variant = "rich",
    connLogos = new Map<string, string | null>(),
    children,
  }: {
    text: string;
    variant?: "rich" | "hud";
    /** name → logoUrl (rich variant only). */
    connLogos?: Map<string, string | null>;
    children: (args: { body: string }) => unknown;
  } = $props();

  const conn = $derived(parseConnectionsHint(text));
  const sec = $derived(parseSecretsHint(conn ? conn.body : text));
  const body = $derived(sec ? sec.body : conn ? conn.body : text);
</script>

{#if conn}
  {#if variant === "rich"}
    <div class="flex flex-wrap justify-end gap-1.5" data-testid="connection-badges">
      {#each conn.connections as c (c.integration + ":" + c.name)}
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border-strong/50 bg-surface-2/80 py-0.5 pl-1 pr-2.5 text-[11.5px] font-medium text-fg-soft"
          title={`Connection (${c.integration}): ${c.name}`}
        >
          <ConnectorIcon logoUrl={connLogos.get(c.name) ?? null} label={c.name} size={16} />
          <span>@{c.name}</span>
        </span>
      {/each}
    </div>
  {:else}
    <div class="msg-badges-row">
      {#each conn.connections as c (c.integration + ":" + c.name)}<span class="msg-badge">@{c.name}</span>{/each}
    </div>
  {/if}
{/if}
{#if sec}
  {#if variant === "rich"}
    <div class="flex flex-wrap justify-end gap-1.5" data-testid="secret-badges">
      {#each sec.secrets as s (s.id)}
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 py-0.5 pl-1 pr-2.5 text-[11.5px] font-medium text-amber-700"
          title={`BWS secret: ${s.name}`}
        >
          <KeyRound size={14} class="shrink-0" />
          <span class="font-mono">@{s.name}</span>
        </span>
      {/each}
    </div>
  {:else}
    <div class="msg-badges-row">
      {#each sec.secrets as s (s.id)}<span class="msg-badge msg-badge--secret">@{s.name}</span>{/each}
    </div>
  {/if}
{/if}
{@render children({ body })}

<style>
  /* HUD variant only — rich variant is styled inline via Tailwind classes. */
  .msg-badges-row {
    align-self: flex-end;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
  }
  .msg-badge {
    padding: 1px 7px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 500;
    border: 1px solid color-mix(in srgb, var(--color-border-strong) 50%, transparent);
    background: color-mix(in srgb, var(--color-surface-2) 80%, transparent);
    color: var(--color-fg-soft);
  }
  .msg-badge--secret {
    border-color: color-mix(in srgb, #f59e0b 45%, transparent);
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    color: #b45309;
    font-family: var(--font-mono, monospace);
  }
</style>
