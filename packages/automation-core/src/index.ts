import { Cron } from "croner";

/**
 * Pure scheduling functions for the automation engine. Deterministic —
 * every function takes an explicit `now`.
 *
 * Engine contract: persist `nextFireAt`; on each tick fire automations whose
 * `nextFireAt <= now` once (missed windows collapse into a single fire), then
 * persist `computeNextFire(cron, now)`.
 */

export function isValidCron(expression: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new Cron(expression, { paused: true });
    return true;
  } catch {
    return false;
  }
}

/** Next fire time strictly after `after`, as ISO string. Null if none/invalid. */
export function computeNextFire(expression: string, after: Date): string | null {
  try {
    const cron = new Cron(expression, { paused: true });
    const next = cron.nextRun(after);
    return next ? next.toISOString() : null;
  } catch {
    return null;
  }
}

/** Whether a persisted nextFireAt is due at `now`. */
export function isDue(nextFireAt: string | null, now: Date): boolean {
  return nextFireAt !== null && new Date(nextFireAt).getTime() <= now.getTime();
}

/** Common presets surfaced in the create form. */
export const CRON_PRESETS = [
  { label: "Every hour", expression: "0 * * * *" },
  { label: "Every morning (9:00)", expression: "0 9 * * *" },
  { label: "Weekdays at 9:00", expression: "0 9 * * 1-5" },
  { label: "Every Monday (9:00)", expression: "0 9 * * 1" },
  { label: "Every 15 minutes", expression: "*/15 * * * *" },
] as const;
