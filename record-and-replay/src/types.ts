/**
 * Shared types for Record & Replay.
 *
 * The event stream is the contract between the native capture helper
 * (Swift, macOS) and the synthesizer. Raw pixel coordinates alone are not
 * enough — every event MUST carry as much semantic context as the platform
 * can provide (window title, focused element role/value, URL bar content).
 */

/** Single captured event. Persisted verbatim to the recording JSON. */
export interface RecordEvent {
  /** Monotonic ms since recording start (t=0 = first event). */
  t: number;
  /** Wall-clock ISO timestamp of capture (for debugging/dedup). */
  ts: string;
  type: EventType;
  payload: EventPayload;
}

export type EventType =
  | "session_start"
  | "session_stop"
  | "session_cancel"
  | "click"
  | "keypress"
  | "text"
  | "focus"
  | "window"
  | "scroll"
  | "screenshot"
  | "note";

export type EventPayload =
  | ClickPayload
  | KeypressPayload
  | TextPayload
  | FocusPayload
  | WindowPayload
  | ScrollPayload
  | ScreenshotPayload
  | NotePayload
  | SessionPayload
  | UnknownPayload;

interface BasePayload {
  /** Process/bundle id of the app that owned focus, if known. */
  app?: string;
  /** AX role of the focused element (e.g. "AXButton", "AXTextField"). */
  role?: string;
  /** Window title of the frontmost window, if known. */
  window?: string;
}

export interface ClickPayload extends BasePayload {
  x: number;
  y: number;
  /** Semantic target label or AX title of the clicked element, if any. */
  target?: string;
  button: "left" | "right" | "other";
  /** AX value of the clicked element (button label, field text), if any. */
  value?: string;
  /** Ancestor element titles from root → clicked, for disambiguation. */
  targetPath?: string[];
  /** AX identifier/hint of the clicked element, if exposed (e.g. "AXTextField:email"). */
  elementId?: string;
}

export interface KeypressPayload extends BasePayload {
  /** Key name (e.g. "Return", "cmd+c", "tab"). Combo keys joined with "+". */
  key: string;
}

export interface TextPayload extends BasePayload {
  /** Text typed since the last text event (chunked to avoid per-char spam). */
  text: string;
}

export interface FocusPayload extends BasePayload {
  /** Focused element identifier, if resolvable. */
  element?: string;
  /** Current value/text of the focused element, if available. */
  value?: string;
  /** URL bar content, if the focused app is a browser. */
  url?: string;
}

export interface WindowPayload extends BasePayload {
  /** "open" | "close" | "activate" | "deactivate" | "title" */
  action: "open" | "close" | "activate" | "deactivate" | "title";
  window: string;
}

export interface ScrollPayload extends BasePayload {
  dx: number;
  dy: number;
}

export interface ScreenshotPayload extends BasePayload {
  /** Absolute path to the PNG, agent-readable via analyze_image. */
  path: string;
  /** Why this screenshot was captured. */
  trigger: "click" | "keypress" | "focus" | "window" | "typing-burst";
  /** 1-based index of this screenshot within the recording. */
  index: number;
}

export interface NotePayload {
  /** Free-text annotation pinned to a timestamp. */
  note: string;
}

export interface SessionPayload {
  reason: "start" | "stop" | "cancel" | "timeout";
  maxMs?: number;
}

/** Catch-all so the native helper can add fields we don't model yet. */
export interface UnknownPayload {
  [k: string]: unknown;
}

/** A saved recording. */
export interface Recording {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  durationMs: number;
  eventCount: number;
  status: "active" | "stopped" | "cancelled" | "timeout";
  eventsPath: string;
  skillPath: string | null;
  /** Digest handed to the synthesizer; null until stop. */
  digest: string | null;
}

/** Parsed frontmatter of a generated skill.md. */
export interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];
  created: string;
  /** Absolute path to the skill file. */
  path: string;
}

export const MAX_DURATION_MS = 30 * 60 * 1000;
export const MATCH_THRESHOLD = 0.35;
