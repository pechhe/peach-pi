/**
 * Decide whether an extension `notify` message should be suppressed rather
 * than surfaced as a toast. Pure policy: feature-specific knowledge of which
 * extensions are noisy lives here (and is unit-tested), not inline in the live
 * session callback.
 */
export function shouldSuppressNotice(
  message: string,
  level: string,
  ctx: { compacting: boolean },
): boolean {
  // Cymbal nudges are agent-internal guidance (also injected as a hidden
  // conversation message), so don't surface them as toasts.
  if (message.startsWith("Cymbal suggests:")) return true;

  // Smart auto-compact status surfaces as an inline compaction card, so
  // suppress its toasts. The pipeline (pi-smart-compact) fires many notify
  // strings between compaction_start/end — gate on the live compaction window
  // rather than matching individual prefixes. The wrapper's
  // threshold/completed/failed notices fire just outside that window, so keep
  // the prefix filter for those.
  if (ctx.compacting) return true;
  if (message.startsWith("Smart auto-compact")) return true;

  // Vision proxy runtime notices ("analyzing…", "analyzed N/M", "cancelled",
  // slash-command confirmations, consent/mode/model echoes) are noise during
  // normal use. The extension was renamed `pi-vision-proxy` → emits
  // `[multimodal-proxy]` prefixed notices and bare `Vision proxy …` echoes;
  // older builds emitted `[vision-proxy]`. Keep `error`-level ones so genuinely
  // broken vision calls surface.
  if (
    level !== "error" &&
    (message.startsWith("[vision-proxy]") ||
      message.startsWith("[multimodal-proxy]") ||
      message.startsWith("Vision proxy"))
  ) {
    return true;
  }

  return false;
}
