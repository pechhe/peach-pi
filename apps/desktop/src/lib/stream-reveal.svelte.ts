/**
 * Streaming-text reveal preferences. Two orthogonal knobs, ported from
 * peche-pi:
 *
 *   - look  (data-stream-fx)    : how each word resolves in — plain fade,
 *                                 blur-to-sharp, blur+rise, warm ink, glow.
 *   - speed (data-stream-speed) : how fast the render-side typewriter trickles
 *                                 buffered text — low / medium / high.
 *
 * Both are written as attributes on <html> (like the theme store) so the
 * StreamingText component + the `.sw` CSS read them with no prop plumbing, and
 * they can be flipped live from devtools:
 *   localStorage["peachpi:streamFx"] = "glow"      // or document attr
 * Persisted to localStorage; the `storage` event keeps every window in sync.
 */

export type StreamLook = "plain" | "blur" | "blur-rise" | "warm" | "glow";
export type StreamSpeed = "low" | "medium" | "high";

export interface StreamLookOption {
  id: StreamLook;
  label: string;
  description: string;
}
export interface StreamSpeedOption {
  id: StreamSpeed;
  label: string;
  description: string;
}

export const STREAM_LOOKS: StreamLookOption[] = [
  { id: "plain", label: "Plain fade", description: "Words simply fade in — no blur, the lightest reveal." },
  { id: "blur", label: "Blur (default)", description: "Words resolve from soft-focus into sharp as they fade in." },
  { id: "blur-rise", label: "Blur + rise", description: "Blur reveal with a subtle upward settle, like text flowing in." },
  { id: "warm", label: "Warm ink", description: "Each new word starts in the accent colour and settles to ink." },
  { id: "glow", label: "Glow", description: "A faint accent glow trails each freshly revealed word, then fades." },
];

export const STREAM_SPEEDS: StreamSpeedOption[] = [
  { id: "low", label: "Low", description: "Calm, deliberate reveal close to the model's real cadence." },
  { id: "medium", label: "Medium (default)", description: "Balanced reveal — steady on a trickle, catches up on bursts." },
  { id: "high", label: "High", description: "Fast reveal that races through buffered text — minimal lag." },
];

/** Maps a look preset to the space-separated `data-stream-fx` tokens the `.sw` CSS reads. */
const LOOK_TOKENS: Record<StreamLook, string> = {
  plain: "plain",
  blur: "blur", // baseline blur-to-sharp is always on; this token is a no-op label
  "blur-rise": "rise",
  warm: "warm",
  glow: "glow",
};

const LOOK_KEY = "peachpi:streamLook";
const SPEED_KEY = "peachpi:streamSpeed";
const DEFAULT_LOOK: StreamLook = "blur";
const DEFAULT_SPEED: StreamSpeed = "medium";

function readStored<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && valid.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

class StreamRevealStore {
  look = $state<StreamLook>(DEFAULT_LOOK);
  speed = $state<StreamSpeed>(DEFAULT_SPEED);

  /** Apply persisted prefs to <html>. Call before mount to avoid a flash. */
  init(): void {
    this.look = readStored(
      LOOK_KEY,
      STREAM_LOOKS.map((l) => l.id),
      DEFAULT_LOOK,
    );
    this.speed = readStored(
      SPEED_KEY,
      STREAM_SPEEDS.map((s) => s.id),
      DEFAULT_SPEED,
    );
    this.applyToDocument();
    window.addEventListener("storage", (e) => {
      if (e.key === LOOK_KEY && e.newValue) {
        this.look = e.newValue as StreamLook;
        this.applyToDocument();
      } else if (e.key === SPEED_KEY && e.newValue) {
        this.speed = e.newValue as StreamSpeed;
        this.applyToDocument();
      }
    });
  }

  private applyToDocument(): void {
    const root = document.documentElement;
    root.setAttribute("data-stream-fx", LOOK_TOKENS[this.look]);
    root.setAttribute("data-stream-speed", this.speed);
  }

  setLook(look: StreamLook): void {
    this.look = look;
    this.applyToDocument();
    try {
      localStorage.setItem(LOOK_KEY, look);
    } catch {
      /* ignore */
    }
  }

  setSpeed(speed: StreamSpeed): void {
    this.speed = speed;
    this.applyToDocument();
    try {
      localStorage.setItem(SPEED_KEY, speed);
    } catch {
      /* ignore */
    }
  }
}

export const streamReveal = new StreamRevealStore();
