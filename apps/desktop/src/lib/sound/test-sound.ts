/**
 * "Mark to test" sound design
 * ----------------------------
 *
 * A small palette of inspection/lab cues played when a thread is marked
 * for testing (the Eye action). Semantically distinct from the Done
 * family — these read as test equipment / relay actuation, not completion.
 *
 * The active variant is chosen in Settings → Test bench sound (persisted
 * to localStorage) and replayed from the preview there.
 *
 * Variants:
 *  - "testBench"  Precision Test Bench: press relay tick → diagnostic
 *                scan chirp → imprint stamp. Sharper than Archive, no
 *                melody, no warning beep. Complements the testBench
 *                animation. (Default.)
 *
 * TODO(sound): the brief asks for a recorded "soft relay tick + tiny test
 * equipment chirp" sample. The current cue is synthesized as a placeholder
 * so the wiring is testable; drop a bundled sample (samples/*.mp3?inline)
 * into TEST_SAMPLE_SOURCES and switch the play path once chosen.
 */

import { getTestSoundVariant, soundsMuted } from "./sound-prefs";

export type TestSoundVariant = "testBench";

/** Selectable cues surfaced in Settings → Test bench sound. */
export const TEST_SOUND_OPTIONS: ReadonlyArray<{
  id: TestSoundVariant;
  label: string;
  description: string;
}> = [
  {
    id: "testBench",
    label: "Test Bench",
    description:
      "Relay tick · diagnostic scan chirp · imprint stamp. Sharper than Done. No warning beep.",
  },
];

const DEFAULT_VARIANT: TestSoundVariant = "testBench";

// Reserved for a future bundled sample (see TODO at top).
const TEST_SAMPLE_SOURCES: Partial<Record<TestSoundVariant, string>> = {};

function isSampleVariant(variant: TestSoundVariant): boolean {
  return variant in TEST_SAMPLE_SOURCES;
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

function tone(
  ctx: AudioContext,
  { frequency, start, duration, peak, type = "sine", attack = 0.012 }: ToneOptions,
): void {
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

/* ── Filtered-noise layer (relay tick / scan sweep / damped click) ─────── */

let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

interface NoiseOptions {
  readonly start: number;
  readonly duration: number;
  readonly peak: number;
  readonly type: BiquadFilterType;
  readonly frequency: number;
  readonly q?: number;
  readonly sweepTo?: number;
  readonly attack?: number;
}

function noiseBurst(
  ctx: AudioContext,
  { start, duration, peak, type, frequency, q = 1, sweepTo, attack = 0.004 }: NoiseOptions,
): void {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, start);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

/* ── Sample playback (reserved — no bundled samples yet) ────────────────── */

function dataUriToArrayBuffer(uri: string): ArrayBuffer {
  const base64 = uri.slice(uri.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function decodeSample(ctx: AudioContext, uri: string): Promise<AudioBuffer | undefined> {
  try {
    const data = uri.startsWith("data:")
      ? dataUriToArrayBuffer(uri)
      : await (await fetch(uri)).arrayBuffer();
    return await ctx.decodeAudioData(data);
  } catch {
    return undefined;
  }
}

const sampleBuffers = new Map<TestSoundVariant, AudioBuffer>();

async function loadSamples(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  await Promise.all(
    Object.entries(TEST_SAMPLE_SOURCES).map(async ([id, uri]) => {
      const buffer = await decodeSample(ctx, uri);
      if (buffer) sampleBuffers.set(id as TestSoundVariant, buffer);
    }),
  );
}

function fireSample(ctx: AudioContext, buffer: AudioBuffer, peak = 0.4): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const duration = buffer.duration;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.02);
}

/* Precision Test Bench — a sharper, more "instrument" feel than the Archive
 * cue, over ~220ms. Three layers:
 *   1. relay tick        (the row press — a crisp, dry mechanical snap)
 *   2. diagnostic sweep   (the scan line crossing the row)
 *   3. imprint stamp      (the TEST badge landing — a short, bright chirp)
 * No melody, no warning beep. Reads as test equipment actuating. */
function playTestBench(ctx: AudioContext, now: number): void {
  // 1. relay tick: a tight, dry high-passed click + a faint low body. This
  //    is the "press relay engaging" — sharper than Archive's soft press.
  noiseBurst(ctx, { start: now, duration: 0.018, peak: 0.06, type: "highpass", frequency: 2400, attack: 0.0005 });
  tone(ctx, { frequency: 168, start: now, duration: 0.035, peak: 0.05, type: "triangle", attack: 0.001 });

  // 2. diagnostic sweep: a faint band-passed noise sweep climbing in pitch —
  //    the scanning line travelling across the row. Amber/scientific feel.
  noiseBurst(ctx, {
    start: now + 0.06,
    duration: 0.09,
    peak: 0.028,
    type: "bandpass",
    frequency: 1800,
    sweepTo: 3600,
    q: 2.2,
    attack: 0.004,
  });

  // 3. imprint stamp: a short, bright two-step chirp — the badge landing.
  //    A crisp square-ish blip followed by a softer glass ping.
  tone(ctx, { frequency: 1320, start: now + 0.16, duration: 0.04, peak: 0.07, type: "square", attack: 0.001 });
  tone(ctx, { frequency: 2640, start: now + 0.16, duration: 0.06, peak: 0.03, type: "sine", attack: 0.002 });
}

const VARIANTS: Partial<Record<TestSoundVariant, (ctx: AudioContext, now: number) => void>> = {
  testBench: playTestBench,
};

function resolveVariant(variant?: TestSoundVariant): TestSoundVariant {
  if (variant) return variant;
  const stored = getTestSoundVariant() as TestSoundVariant;
  return TEST_SOUND_OPTIONS.some((o) => o.id === stored) ? stored : DEFAULT_VARIANT;
}

async function play(variant: TestSoundVariant): Promise<void> {
  if (soundsMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
  if (isSampleVariant(variant)) {
    await loadSamples();
    const buffer = sampleBuffers.get(variant);
    if (buffer) fireSample(ctx, buffer);
    return;
  }
  VARIANTS[variant]?.(ctx, ctx.currentTime);
}

/** Cue for when the user *marks a thread for testing* (the Eye action).
 *  Defaults to the Test Bench cue; chosen in Settings → Test bench sound. */
export function playTestSound(variant?: TestSoundVariant): Promise<void> {
  if (variant) return play(variant);
  const stored = getTestSoundVariant() as TestSoundVariant;
  return play(TEST_SOUND_OPTIONS.some((o) => o.id === stored) ? stored : "testBench");
}
