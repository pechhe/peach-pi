/* ── "Done" sound design ───────────────────────────────────────────────────
 *
 * A small palette of celebratory cues played when a thread is marked done.
 * Most cues are synthesized with WebAudio; a handful are bundled
 * close-mic'd metal SFX samples (decoded from inlined data: URIs so they
 * work under file:// in packaged builds). The active variant is chosen in
 * Settings → Sounds (persisted to localStorage) and replayed from the
 * preview there.
 *
 * Variants:
 *  - "archive"   Precision Archive: soft press → tiny brushed-metal sheen →
 *                sealed latch click. Low, tactile, no melody. Complements
 *                the archiveSlide animation. (Default.)
 *  - "metalWhoosh4"  Bundled metal whoosh hit (floraphonic).
 *  - "metalWhoosh3"  Bundled metal whoosh hit, alt take.
 *  - "steelSlice1"   Bundled steel blade slice.
 *  - "steelSlice2"   Bundled steel blade slice, alt take.
 *  - "motionMetalHit" Bundled motion metal hit.
 *  - "arpeggio"  Bright ascending major arpeggio (E5→G♯5→B5→E6). Triangle.
 *  - "marimba"   Two warm, woody plucks. Soft and understated.
 *  - "bell"      A single shimmering bell with a long, glassy tail.
 *  - "pop"       A quick upward pitch blip. Playful and snappy.
 *  - "coin"      Classic two-note game "pickup". Square waves, retro.
 *  - "chord"     A full major chord struck together with a soft swell.
 */

import { getArchiveSoundVariant, getDoneSoundVariant, soundsMuted } from "./sound-prefs";

export type DoneSoundVariant =
  | "archive"
  | "arpeggio"
  | "marimba"
  | "bell"
  | "pop"
  | "coin"
  | "chord"
  | "metalWhoosh4"
  | "metalWhoosh3"
  | "steelSlice1"
  | "steelSlice2"
  | "motionMetalHit";

/** Selectable cues surfaced in Settings → Sounds. */
export const DONE_SOUND_OPTIONS: ReadonlyArray<{
  id: DoneSoundVariant;
  label: string;
  description: string;
}> = [
  { id: "archive", label: "Precision Archive", description: "Soft press · brushed-metal sheen · sealed latch click. Low and tactile." },
  { id: "arpeggio", label: "Arpeggio", description: "Bright ascending major arpeggio (E5→G♯5→B5→E6). Triangle." },
  { id: "marimba", label: "Marimba", description: "Two warm, woody plucks. Soft and understated." },
  { id: "bell", label: "Bell", description: "A single shimmering bell with a long, glassy tail." },
  { id: "pop", label: "Pop", description: "A quick upward pitch blip. Playful and snappy." },
  { id: "coin", label: "Coin", description: "Classic two-note game \"pickup\". Square waves, retro." },
  { id: "chord", label: "Chord", description: "A full major chord struck together with a soft swell." },
  { id: "metalWhoosh4", label: "Metal whoosh", description: "Close-mic'd metal whoosh hit. Recorded, not synthesized." },
  { id: "metalWhoosh3", label: "Metal whoosh (alt)", description: "Metal whoosh hit, alternate take." },
  { id: "steelSlice1", label: "Steel blade slice", description: "Steel blade slice — bright, precise, metallic." },
  { id: "steelSlice2", label: "Steel blade slice (alt)", description: "Steel blade slice, alternate take." },
  { id: "motionMetalHit", label: "Motion metal hit", description: "Motion metal hit — heavier, percussive." },
];

const DEFAULT_VARIANT: DoneSoundVariant = "archive";

/* ── Bundled metal SFX samples (inlined data: URIs) ─────────────────────── */
import metalWhoosh4Mp3 from "./samples/floraphonic-metal-whoosh-hit-4-201906.mp3?inline";
import metalWhoosh3Mp3 from "./samples/floraphonic-metal-whoosh-hit-3-201902.mp3?inline";
import steelSlice1Mp3 from "./samples/floraphonic-steel-blade-slice-1-188213.mp3?inline";
import steelSlice2Mp3 from "./samples/floraphonic-steel-blade-slice-2-188214.mp3?inline";
import motionMetalHitMp3 from "./samples/alexis_gaming_cam-ks-motion-metal-hit-351564.mp3?inline";

const SAMPLE_SOURCES: Partial<Record<DoneSoundVariant, string>> = {
  metalWhoosh4: metalWhoosh4Mp3,
  metalWhoosh3: metalWhoosh3Mp3,
  steelSlice1: steelSlice1Mp3,
  steelSlice2: steelSlice2Mp3,
  motionMetalHit: motionMetalHitMp3,
};
const SAMPLE_IDS = Object.keys(SAMPLE_SOURCES) as DoneSoundVariant[];

function isSampleVariant(variant: DoneSoundVariant): boolean {
  return variant in SAMPLE_SOURCES;
}

function dataUriToArrayBuffer(uri: string): ArrayBuffer {
  const base64 = uri.slice(uri.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function decodeSample(ctx: AudioContext, uri: string): Promise<AudioBuffer | undefined> {
  try {
    // Samples are bundled as inline `data:` URIs. The app CSP blocks
    // fetch() of data: URIs, so decode the base64 payload directly.
    const data = uri.startsWith("data:") ? dataUriToArrayBuffer(uri) : await (await fetch(uri)).arrayBuffer();
    return await ctx.decodeAudioData(data);
  } catch {
    return undefined;
  }
}

let sampleLoadPromise: Promise<void> | undefined;
const sampleBuffers = new Map<DoneSoundVariant, AudioBuffer>();

function loadSamples(): Promise<void> {
  if (sampleLoadPromise) return sampleLoadPromise;
  const ctx = getAudioContext();
  if (!ctx) {
    sampleLoadPromise = Promise.resolve();
    return sampleLoadPromise;
  }
  sampleLoadPromise = (async () => {
    await Promise.all(
      Object.entries(SAMPLE_SOURCES).map(async ([id, uri]) => {
        const buffer = await decodeSample(ctx, uri);
        if (buffer) sampleBuffers.set(id as DoneSoundVariant, buffer);
      }),
    );
  })();
  return sampleLoadPromise;
}

/** Preload the bundled metal samples so the first Done click is instant. */
export function preloadDoneSamples(): void {
  void loadSamples();
}

function fireSample(ctx: AudioContext, buffer: AudioBuffer, peak = 0.4): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const duration = buffer.duration;
  // Short attack avoids a click; exponential decay lets the sample's own
  // tail breathe without lingering. Peak kept restrained (samples are hot).
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + duration + 0.02);
}

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

/* ── Filtered-noise layer (metallic scrape / sheen / damped click) ──────── */

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

/* Precision Archive — a quiet machined latch engaging after a smooth
 * brushed-metal slide. Three restrained layers over ~150ms:
 *   1. soft low press tap        (the row depressing)
 *   2. filtered metallic sheen   (the glint sweep)
 *   3. tiny damped latch click   (the archive lock)
 * Deliberately low/tactile — no melody, no chime, no whoosh. */
function playArchive(ctx: AudioContext, now: number): void {
  // 1. press: a soft, low-passed tick + faint body — the row depressing.
  //    (Felt more than heard; no broadband hiss.)
  noiseBurst(ctx, { start: now, duration: 0.03, peak: 0.038, type: "lowpass", frequency: 880, attack: 0.001 });
  tone(ctx, { frequency: 116, start: now, duration: 0.05, peak: 0.05, type: "sine", attack: 0.002 });

  // 2. sheen: a brief inharmonic metallic shimmer — three quiet high
  //    partials with a fast decay. Reads as polished metal, not static.
  [3140, 4710, 6290].forEach((frequency, i) => {
    tone(ctx, {
      frequency,
      start: now + 0.028,
      duration: 0.072 - i * 0.018,
      peak: 0.019 - i * 0.005,
      type: "sine",
      attack: 0.006,
    });
  });

  // 3. latch: a tight damped click — short high-passed tick + a faint
  //    pitched body = the archive sealing shut.
  noiseBurst(ctx, { start: now + 0.105, duration: 0.012, peak: 0.05, type: "highpass", frequency: 2700, attack: 0.0005 });
  tone(ctx, { frequency: 205, start: now + 0.105, duration: 0.03, peak: 0.042, type: "triangle", attack: 0.0008 });
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

const VARIANTS: Partial<Record<DoneSoundVariant, (ctx: AudioContext, now: number) => void>> = {
  archive: playArchive,
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

async function play(variant: DoneSoundVariant): Promise<void> {
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

/** Chime for when a thread *finishes* (agent done). Settings → Done chime. */
export function playDoneSound(variant?: DoneSoundVariant): Promise<void> {
  return play(resolveVariant(variant));
}

/** Cue for when the user *marks a thread done* (archives it). Defaults to the
 *  Precision Archive cue; chosen in Settings → Thread done sound. */
export function playArchiveSound(variant?: DoneSoundVariant): Promise<void> {
  if (variant) return play(variant);
  const stored = getArchiveSoundVariant() as DoneSoundVariant;
  return play(DONE_SOUND_OPTIONS.some((o) => o.id === stored) ? stored : "archive");
}
