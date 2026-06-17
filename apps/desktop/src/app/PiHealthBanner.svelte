<script lang="ts">
  import { onMount } from "svelte";
  import type { PiHealth } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import AlertTriangle from "@lucide/svelte/icons/triangle-alert";
  import X from "@lucide/svelte/icons/x";

  // Startup compatibility report (bundled pi ↔ loaded extensions). Fetched once;
  // a banner appears only when there is a real mismatch, dismissible per session.
  let health = $state<PiHealth | null>(null);
  let dismissed = $state(false);

  onMount(async () => {
    try {
      health = await api.invoke("app:getPiHealth");
    } catch {
      health = null;
    }
  });

  const show = $derived(!dismissed && health !== null && health.status !== "ok");
  const isError = $derived(health?.status === "error");
</script>

{#if show && health}
  <div
    class="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-3"
    data-testid="pi-health-banner"
  >
    <div
      class="pointer-events-auto flex w-full max-w-2xl items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur
        {isError
        ? 'border-danger-border/50 bg-danger-surface/90 text-danger'
        : 'border-warning-border/50 bg-warning-surface/90 text-warning'}"
      role="alert"
    >
      <AlertTriangle size={18} class="mt-0.5 shrink-0" />
      <div class="min-w-0 flex-1 text-[13px] leading-relaxed">
        <p class="font-semibold">
          pi version mismatch{health.hostVersion ? ` — app bundles pi ${health.hostVersion}` : ""}
        </p>
        <ul class="mt-1 list-disc space-y-0.5 pl-4 text-fg-soft">
          {#each health.problems as problem (problem)}
            <li>{problem}</li>
          {/each}
        </ul>
        <p class="mt-1.5 text-xs text-muted">
          {isError
            ? "Subagents and other extension tools will likely fail. Update the app (or align the pi version) and restart."
            : "Extension tools may misbehave. Updating the app to a matching pi version is recommended."}
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-md p-1 text-muted transition-colors hover:text-fg"
        title="Dismiss"
        aria-label="Dismiss"
        onclick={() => (dismissed = true)}
      >
        <X size={16} />
      </button>
    </div>
  </div>
{/if}
