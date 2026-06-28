/**
 * Friendly recurring-schedule model for the automation builder. Storage stays
 * cron (the engine runs on `computeNextFire(cron)`); this layer only translates
 * a frequency + time-of-day into a cron string and back for display, the way
 * peche-pi's automation builder did. Custom cron strings that don't match a
 * known shape fall back to showing the raw expression.
 */

export type AutomationFrequency = "hourly" | "daily" | "weekly" | "monthly";

export interface AutomationSchedule {
  frequency: AutomationFrequency;
  /** "HH:MM" 24h. Only the minute is used for hourly. */
  time: string;
  /** 0 (Sun) – 6 (Sat). Weekly only. */
  dayOfWeek?: number;
}

export const DEFAULT_SCHEDULE: AutomationSchedule = {
  frequency: "daily",
  time: "09:00",
  dayOfWeek: 1,
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = (time ?? "").split(":");
  const hour = Number.parseInt(h ?? "0", 10);
  const minute = Number.parseInt(m ?? "0", 10);
  return {
    hour: Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 0,
    minute: Number.isFinite(minute) ? Math.max(0, Math.min(59, minute)) : 0,
  };
}

/** Convert a friendly schedule into a 5-field cron expression. */
export function scheduleToCron(schedule: AutomationSchedule): string {
  const { hour, minute } = parseTime(schedule.time);
  switch (schedule.frequency) {
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${schedule.dayOfWeek ?? 1}`;
    case "monthly":
      return `${minute} ${hour} 1 * *`;
  }
}

const isInt = (s: string) => /^\d+$/.test(s);
const pad = (n: number) => n.toString().padStart(2, "0");

/** Best-effort parse of a cron string back into a friendly schedule. Returns
 *  null for expressions that weren't produced by `scheduleToCron`. */
export function cronToSchedule(cron: string): AutomationSchedule | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  if (!isInt(min) || mon !== "*") return null;
  const minute = Number(min);

  if (hour === "*" && dom === "*" && dow === "*") {
    return { frequency: "hourly", time: `00:${pad(minute)}` };
  }
  if (!isInt(hour)) return null;
  const time = `${pad(Number(hour))}:${pad(minute)}`;

  if (dom === "*" && dow === "*") return { frequency: "daily", time };
  if (dom === "*" && isInt(dow)) {
    return { frequency: "weekly", time, dayOfWeek: Number(dow) };
  }
  if (dom === "1" && dow === "*") return { frequency: "monthly", time };
  return null;
}

function formatTime(time: string): string {
  const { hour, minute } = parseTime(time);
  return `${hour}:${pad(minute)}`;
}

/** Human-readable label for a friendly schedule. */
export function automationScheduleLabel(schedule: AutomationSchedule): string {
  switch (schedule.frequency) {
    case "hourly":
      return `Hourly at :${pad(parseTime(schedule.time).minute)}`;
    case "daily":
      return `Daily at ${formatTime(schedule.time)}`;
    case "weekly": {
      const day = DAY_LABELS[schedule.dayOfWeek ?? 1] ?? "Monday";
      return `${day}s at ${formatTime(schedule.time)}`;
    }
    case "monthly":
      return `Monthly on the 1st at ${formatTime(schedule.time)}`;
  }
}

/** Friendly label for a stored cron string, falling back to the raw cron. */
export function cronLabel(cron: string): string {
  const schedule = cronToSchedule(cron);
  return schedule ? automationScheduleLabel(schedule) : cron;
}
