/* ── "Done" sound design ───────────────────────────────────────────────────
 *
 * A small palette of celebratory cues played when a thread is marked done.
 * All are synthesized with WebAudio (no asset files). The active variant is
 * chosen in Settings → Sounds (persisted to localStorage) and replayed from
 * the playground there.
 *
 * Variants:
 *  - "arpeggio"  Bright ascending major arpeggio (E5→G♯5→B5→E6). Triangle.
 *  - "marimba"   Two warm, woody plucks. Soft and understated.
 *  - "bell"      A single shimmering bell with a long, glassy tail.
 *  - "pop"       A quick upward pitch blip. Playful and snappy.
 *  - "coin"      Classic two-note game "pickup". Square waves, retro.
 *  - "chord"     A full major chord struck together with a soft swell.
 */

import { getDoneSoundVariant, soundsMuted } from "./sound-prefs";

export type DoneSoundVariant = "arpeggio" | "marimba" | "bell" | "pop" | "coin" | "chord";

/** Selectable cues surfaced in Settings → Sounds. */
export const DONE_SOUND_OPTIONS: ReadonlyArray<{
  id: DoneSoundVariant;
  label: string;
  description: string;
}> = [
  { id: "arpeggio", label: "Arpeggio", description: "Bright ascending major arpeggio (E5→G♯5→B5→E6). Triangle." },
  { id: "marimba", label: "Marimba", description: "Two warm, woody plucks. Soft and understated." },
  { id: "bell", label: "Bell", description: "A single shimmering bell with a long, glassy tail." },
  { id: "pop", label: "Pop", description: "A quick upward pitch blip. Playful and snappy." },
  { id: "coin", label: "Coin", description: "Classic two-note game \"pickup\". Square waves, retro." },
  { id: "chord", label: "Chord", description: "A full major chord struck together with a soft swell." },
];

const DEFAULT_VARIANT: DoneSoundVariant = "arpeggio";

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new Ctor();
  }
  return sharedAudioContext;
}

interface ToneOptions {
  readonly frequency: number;
  readonly start: number;
  readonly duration: number;
  readonly peak: number;
  readonly type?: OscillatorType;
  readonly attack?: number;
}

function tone(ctx: AudioContext, { frequency, start, duration, peak, type = "sine", attack = 0.012 }: ToneOptions): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playArpeggio(ctx: AudioContext, now: number): void {
  const notes = [659.25, 830.61, 987.77, 1318.51];
  notes.forEach((frequency, index) => {
    tone(ctx, {
      frequency,
      start: now + index * 0.06,
      duration: 0.4,
      peak: index === notes.length - 1 ? 0.14 : 0.09,
      type: "triangle",
    });
  });
}

function playMarimba(ctx: AudioContext, now: number): void {
  [587.33, 880].forEach((frequency, index) => {
    tone(ctx, {
      frequency,
      start: now + index * 0.09,
      duration: 0.32,
      peak: 0.16,
      type: "sine",
      attack: 0.004,
    });
    // A soft octave overtone gives the woody marimba colour.
    tone(ctx, {
      frequency: frequency * 2,
      start: now + index * 0.09,
      duration: 0.16,
      peak: 0.04,
      type: "sine",
      attack: 0.004,
    });
  });
}

function playBell(ctx: AudioContext, now: number): void {
  // Inharmonic partials struck together → glassy bell.
  const partials: ReadonlyArray<readonly [number, number]> = [
    [880, 0.12],
    [880 * 2.76, 0.05],
    [880 * 5.4, 0.03],
  ];
  for (const [frequency, peak] of partials) {
    tone(ctx, { frequency, start: now, duration: 1.1, peak, type: "sine", attack: 0.005 });
  }
}

function playPop(ctx: AudioContext, now: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(420, now);
  oscillator.frequency.exponentialRampToValueAtTime(1180, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

function playCoin(ctx: AudioContext, now: number): void {
  tone(ctx, { frequency: 987.77, start: now, duration: 0.09, peak: 0.12, type: "square", attack: 0.002 });
  tone(ctx, { frequency: 1318.51, start: now + 0.08, duration: 0.34, peak: 0.12, type: "square", attack: 0.002 });
}

function playChord(ctx: AudioContext, now: number): void {
  // C major triad + octave, struck together with a gentle swell.
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    tone(ctx, {
      frequency,
      start: now,
      duration: 0.7,
      peak: index === 3 ? 0.06 : 0.08,
      type: "triangle",
      attack: 0.03,
    });
  });
}

const VARIANTS: Record<DoneSoundVariant, (ctx: AudioContext, now: number) => void> = {
  arpeggio: playArpeggio,
  marimba: playMarimba,
  bell: playBell,
  pop: playPop,
  coin: playCoin,
  chord: playChord,
};

function resolveVariant(variant?: DoneSoundVariant): DoneSoundVariant {
  if (variant) return variant;
  const stored = getDoneSoundVariant() as DoneSoundVariant;
  return DONE_SOUND_OPTIONS.some((o) => o.id === stored) ? stored : DEFAULT_VARIANT;
}

export function playDoneSound(variant?: DoneSoundVariant): void {
  if (soundsMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  VARIANTS[resolveVariant(variant)](ctx, ctx.currentTime);
}
