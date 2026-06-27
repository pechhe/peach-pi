<script lang="ts">
  import { telemetry } from "../stores/telemetry.svelte";
  import { setConsent } from "../lib/telemetry";
  import { trackFeature } from "../lib/telemetry";

  // Show only when consent is null (first launch) AND a build key exists,
  // so dev builds without keys never surface a pointless prompt.
  const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  // Main-process Sentry (via @sentry/electron) captures renderer crashes too,
  // so we only surface a consent prompt when PostHog is configured or the
  // build is signed for crash reporting (main process gates Sentry init).
  const hasAnyKey = !!POSTHOG_KEY;

  let visible = $state(false);

  telemetry.load().then(() => {
    visible = hasAnyKey && telemetry.consent === null;
  });

  async function respond(value: boolean) {
    visible = false;
    await setConsent(value);
    if (value) trackFeature("telemetry_opt_in");
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") void respond(false);
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if visible}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    style="padding-left: var(--content-left, 0px)"
  >
    <div
      class="w-[28rem] rounded-xl border border-border-strong bg-surface p-5 shadow-2xl"
      role="dialog"
      aria-label="Telemetry consent"
    >
      <h2 class="mb-2 text-base font-semibold text-text">Help improve Peach Pi</h2>
      <p class="mb-4 text-sm text-text-muted">
        Send anonymous usage stats (launch, activity, feature names) and crash reports to
        help us fix bugs and ship improvements. No conversation content, file contents,
        credentials, or personal data — ever. Offline events batch and send later. You can
        change this anytime in Settings.
      </p>
      <div class="flex justify-end gap-2">
        <button
          class="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover"
          onclick={() => respond(false)}
        >
          Not now
        </button>
        <button
          class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          onclick={() => respond(true)}
        >
          Allow
        </button>
      </div>
    </div>
  </div>
{/if}
