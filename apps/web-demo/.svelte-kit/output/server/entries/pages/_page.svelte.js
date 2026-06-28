import { h as hash, s as ssr_context, l as lifecycle_function_unavailable, a as attr_style, e as ensure_array_like, b as escape_html, F as FILENAME, g as getContext$1, c as attributes, d as clsx, v as validate_dynamic_element_tag, f as element, i as derived, j as spread_props, k as stringify, m as attr_class, n as hasContext, o as setContext, p as noop$1, r as rune_outside_svelte, A as ATTACHMENT_KEY, q as run, t as bind_props, u as props_id, w as getAllContexts, x as prevent_snippet_stringification, y as attr, z as validate_void_dynamic_element, B as store_get, C as unsubscribe_stores, D as head } from "../../chunks/index.js";
import { p as push_element, a as pop_element, v as validate_snippet_args } from "../../chunks/dev.js";
import { clsx as clsx$1 } from "clsx";
import { S as Square_1, a as Square_2, b as Square_3, c as Square_4, d as Square_5, e as Square_6, f as Square_7, g as Square_8, h as Square_9, i as Square_10, j as Square_11, k as Square_12, l as Square_13, m as Square_14, n as Square_15, o as Square_16, p as Square_17, q as Square_18, r as Square_19, s as Square_20, H as Hex_1, t as Hex_2, u as Hex_3, v as Hex_4, w as Hex_5, x as Hex_6, y as Hex_7, z as Hex_8, A as Hex_9, B as Hex_10, T as Triangle_1, C as Triangle_2, D as Triangle_3, E as Triangle_4, F as Triangle_5, G as Triangle_6, I as Triangle_7, J as Triangle_8, K as Triangle_9, L as Triangle_10, M as Triangle_11, N as Triangle_12, O as Triangle_13, P as Triangle_14, Q as Triangle_15, R as Triangle_16, U as Triangle_17, V as Triangle_18, W as Triangle_19, X as Triangle_20, Y as SvelteMap, Z as applyTranscriptOps, _ as createSubscriber, $ as SvelteSet, a0 as MediaQuery } from "../../chunks/triangle-20.js";
import parse from "style-to-object";
import { o as on } from "../../chunks/events.js";
import { tabbable, focusable, isFocusable, isTabbable } from "tabbable";
import { twMerge } from "tailwind-merge";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { isMotionValue, px, frame as frame$1, cancelFrame as cancelFrame$1, noop as noop$2, press, hover, inView, pipe, complex as complex$1, mixNumber as mixNumber$1, progress as progress$1, clamp as clamp$1, frameData as frameData$1, distance2D, secondsToMilliseconds as secondsToMilliseconds$1, millisecondsToSeconds, percent as percent$1, isCSSVariableName as isCSSVariableName$1 } from "framer-motion/dom";
import { time, frame, cancelFrame, isCSSVariableName, transformProps, motionValue, isMotionValue as isMotionValue$1, getValueTransition, makeAnimationInstant, JSAnimation, AsyncMotionValueAnimation, positionalKeys, mixNumber, KeyframeResolver, findValueType, complex, getAnimatableNone, microtask, DOMKeyframesResolver, transformPropOrder, getValueAsType, numberValueTypes, defaultTransformValue, readTransformValue, px as px$1, getDefaultValueType, percent, statsBuffer, isSVGElement as isSVGElement$1, isSVGSVGElement, frameData, frameSteps, activeAnimations } from "motion-dom";
import { MotionGlobalConfig, secondsToMilliseconds, warnOnce, isNumericalString, isZeroValueString, SubscriptionManager, addUniqueItem, removeItem, progress, circOut, noop as noop$3, clamp } from "motion-utils";
import { invariant, warning } from "hey-listen";
import { computePosition, offset, shift, limitShift, flip, size, arrow, hide } from "@floating-ui/dom";
import "posthog-js";
import * as SentryRenderer from "@sentry/electron/renderer";
import { w as writable } from "../../chunks/index2.js";
function html(value) {
  var html2 = String(value ?? "");
  var open = `<!--${hash(html2)}-->`;
  return open + html2 + "<!---->";
}
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
function mount() {
  lifecycle_function_unavailable("mount");
}
function unmount() {
  lifecycle_function_unavailable("unmount");
}
async function tick() {
}
const NEW_THREAD_TITLES = ["New thread", "New chat"];
function isNewThread(title) {
  return NEW_THREAD_TITLES.includes(title);
}
function arrayPref(key) {
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
    } catch {
      return [];
    }
  };
  const write = (value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
  };
  const sync = (cb) => {
    window.addEventListener("storage", (e) => {
      if (e.key === key) cb(e);
    });
  };
  return { read, write, sync };
}
function mapPref(key) {
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const write = (value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
  };
  const sync = (cb) => {
    window.addEventListener("storage", (e) => {
      if (e.key === key) cb(e);
    });
  };
  return { read, write, sync };
}
const pinned = arrayPref("peachpi:modelPinned");
const hidden = arrayPref("peachpi:modelHidden");
class ModelPrefsStore {
  pinnedKeys = [];
  hiddenKeys = [];
  initialized = false;
  /** Load persisted prefs and start cross-window sync. Idempotent. */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.pinnedKeys = pinned.read();
    this.hiddenKeys = hidden.read();
    pinned.sync(() => {
      this.pinnedKeys = pinned.read();
    });
    hidden.sync(() => {
      this.hiddenKeys = hidden.read();
    });
  }
  setPinned(keys) {
    this.pinnedKeys = keys;
    pinned.write(keys);
  }
  hide(key) {
    if (this.hiddenKeys.includes(key)) return;
    this.hiddenKeys = [...this.hiddenKeys, key];
    hidden.write(this.hiddenKeys);
  }
  clearHidden() {
    this.hiddenKeys = [];
    hidden.write([]);
  }
}
const modelPrefs = new ModelPrefsStore();
const ENTRIES = [
  {
    id: "square-1",
    name: "Neon Drift",
    shape: "square",
    component: Square_1
  },
  {
    id: "square-2",
    name: "Pulse Ladder",
    shape: "square",
    component: Square_2
  },
  {
    id: "square-3",
    name: "Core Spiral",
    shape: "square",
    component: Square_3
  },
  {
    id: "square-4",
    name: "Twin Orbit",
    shape: "square",
    component: Square_4
  },
  {
    id: "square-5",
    name: "Prism Sweep",
    shape: "square",
    component: Square_5
  },
  {
    id: "square-6",
    name: "Flux Columns",
    shape: "square",
    component: Square_6
  },
  {
    id: "square-7",
    name: "Block Drop",
    shape: "square",
    component: Square_7
  },
  {
    id: "square-8",
    name: "Strobe Stack",
    shape: "square",
    component: Square_8
  },
  {
    id: "square-9",
    name: "Glyph Pulse",
    shape: "square",
    component: Square_9
  },
  {
    id: "square-10",
    name: "CRT Glide",
    shape: "square",
    component: Square_10
  },
  {
    id: "square-11",
    name: "Echo Ring",
    shape: "square",
    component: Square_11
  },
  {
    id: "square-12",
    name: "Origin Wave",
    shape: "square",
    component: Square_12
  },
  {
    id: "square-13",
    name: "Core Rotar",
    shape: "square",
    component: Square_13
  },
  {
    id: "square-14",
    name: "Prism Bloom",
    shape: "square",
    component: Square_14
  },
  {
    id: "square-15",
    name: "Helix Glow",
    shape: "square",
    component: Square_15
  },
  {
    id: "square-16",
    name: "Helix Core",
    shape: "square",
    component: Square_16
  },
  {
    id: "square-17",
    name: "Half Helix",
    shape: "square",
    component: Square_17
  },
  {
    id: "square-18",
    name: "Sound Bars",
    shape: "square",
    component: Square_18
  },
  {
    id: "square-19",
    name: "Lemniscate Pulse",
    shape: "square",
    component: Square_19
  },
  {
    id: "square-20",
    name: "Mobius Ring",
    shape: "square",
    component: Square_20
  },
  {
    id: "hex-1",
    name: "Hex Orbit",
    shape: "hex",
    component: Hex_1
  },
  {
    id: "hex-2",
    name: "Prism Bloom",
    shape: "hex",
    component: Hex_2
  },
  {
    id: "hex-3",
    name: "Honey Gate",
    shape: "hex",
    component: Hex_3
  },
  {
    id: "hex-4",
    name: "Vertex Relay",
    shape: "hex",
    component: Hex_4
  },
  {
    id: "hex-5",
    name: "Spiral Lattice",
    shape: "hex",
    component: Hex_5
  },
  {
    id: "hex-6",
    name: "Chevron March",
    shape: "hex",
    component: Hex_6
  },
  {
    id: "hex-7",
    name: "Hourglass Flip",
    shape: "hex",
    component: Hex_7
  },
  {
    id: "hex-8",
    name: "Glyph Flip",
    shape: "hex",
    component: Hex_8
  },
  {
    id: "hex-9",
    name: "Petal Shimmer",
    shape: "hex",
    component: Hex_9
  },
  {
    id: "hex-10",
    name: "Liquid Vortex",
    shape: "hex",
    component: Hex_10
  },
  {
    id: "triangle-1",
    name: "Core Spokes",
    shape: "triangle",
    component: Triangle_1
  },
  {
    id: "triangle-2",
    name: "Altitude Wave",
    shape: "triangle",
    component: Triangle_2
  },
  {
    id: "triangle-3",
    name: "Corner Bounce",
    shape: "triangle",
    component: Triangle_3
  },
  {
    id: "triangle-4",
    name: "Vertex Chase",
    shape: "triangle",
    component: Triangle_4
  },
  {
    id: "triangle-5",
    name: "Row Sweep",
    shape: "triangle",
    component: Triangle_5
  },
  {
    id: "triangle-6",
    name: "Braille Beat",
    shape: "triangle",
    component: Triangle_6
  },
  {
    id: "triangle-7",
    name: "Oblique Weave",
    shape: "triangle",
    component: Triangle_7
  },
  {
    id: "triangle-8",
    name: "Wing Metronome",
    shape: "triangle",
    component: Triangle_8
  },
  {
    id: "triangle-9",
    name: "Corona Tier",
    shape: "triangle",
    component: Triangle_9
  },
  {
    id: "triangle-10",
    name: "Column Rake",
    shape: "triangle",
    component: Triangle_10
  },
  {
    id: "triangle-11",
    name: "Shelf Descent",
    shape: "triangle",
    component: Triangle_11
  },
  {
    id: "triangle-12",
    name: "Skew Drift",
    shape: "triangle",
    component: Triangle_12
  },
  {
    id: "triangle-13",
    name: "Serpent Zip",
    shape: "triangle",
    component: Triangle_13
  },
  {
    id: "triangle-14",
    name: "Pillar Sweep",
    shape: "triangle",
    component: Triangle_14
  },
  {
    id: "triangle-15",
    name: "Tripod Handoff",
    shape: "triangle",
    component: Triangle_15
  },
  {
    id: "triangle-16",
    name: "Updraft",
    shape: "triangle",
    component: Triangle_16
  },
  {
    id: "triangle-17",
    name: "Infinity Trace",
    shape: "triangle",
    component: Triangle_17
  },
  {
    id: "triangle-18",
    name: "Hollow Shell",
    shape: "triangle",
    component: Triangle_18
  },
  {
    id: "triangle-19",
    name: "Pivot Ray",
    shape: "triangle",
    component: Triangle_19
  },
  {
    id: "triangle-20",
    name: "Twin Perimeter",
    shape: "triangle",
    component: Triangle_20
  }
];
const DEFAULT_SQUARE = [
  "square-1",
  "square-3",
  "square-4",
  "square-5",
  "square-7",
  "square-8",
  "square-10",
  "square-11",
  "square-12",
  "square-18"
];
const DEFAULT_HEX = [
  "hex-1",
  "hex-2",
  "hex-3",
  "hex-4",
  "hex-5",
  "hex-6",
  "hex-7",
  "hex-8",
  "hex-9",
  "hex-10"
];
const DEFAULT_TRIANGLE = [
  "triangle-1",
  "triangle-2",
  "triangle-3",
  "triangle-4",
  "triangle-5",
  "triangle-6",
  "triangle-13",
  "triangle-14",
  "triangle-16",
  "triangle-17"
];
function byId(id2) {
  return ENTRIES.find((e) => e.id === id2);
}
const KEY$1 = {
  square: "peachpi:dotMatrixLoaders:square",
  hex: "peachpi:dotMatrixLoaders:hex",
  triangle: "peachpi:dotMatrixLoaders:triangle"
};
const DEFAULTS = {
  square: DEFAULT_SQUARE,
  hex: DEFAULT_HEX,
  triangle: DEFAULT_TRIANGLE
};
const prefs = {
  square: arrayPref(KEY$1.square),
  hex: arrayPref(KEY$1.hex),
  triangle: arrayPref(KEY$1.triangle)
};
function readStored(shape) {
  try {
    const raw = localStorage.getItem(KEY$1[shape]);
    if (!raw) return [...DEFAULTS[shape]];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULTS[shape]];
  } catch {
    return [...DEFAULTS[shape]];
  }
}
function persist(shape, ids) {
  prefs[shape].write(ids);
}
class LoaderPrefsStore {
  square = [...DEFAULT_SQUARE];
  hex = [...DEFAULT_HEX];
  triangle = [...DEFAULT_TRIANGLE];
  /** Hydrate from localStorage. Call once before mount. */
  init() {
    this.square = readStored("square");
    this.hex = readStored("hex");
    this.triangle = readStored("triangle");
    window.addEventListener("storage", (e) => {
      if (e.key === KEY$1.square && e.newValue) this.square = safeParse(e.newValue, "square");
      else if (e.key === KEY$1.hex && e.newValue) this.hex = safeParse(e.newValue, "hex");
      else if (e.key === KEY$1.triangle && e.newValue) this.triangle = safeParse(e.newValue, "triangle");
    });
  }
  /** The set the picker should draw from for a given shape. */
  selection(shape) {
    const ids = this[shape];
    return ids.length > 0 ? ids : [...DEFAULTS[shape]];
  }
  toggle(shape, id2) {
    const current = this[shape];
    const next = current.includes(id2) ? current.filter((x) => x !== id2) : [...current, id2];
    this[shape] = next.length > 0 ? next : [...DEFAULTS[shape]];
    persist(shape, this[shape]);
  }
  setSelection(shape, ids) {
    this[shape] = ids.length > 0 ? ids : [...DEFAULTS[shape]];
    persist(shape, this[shape]);
  }
}
function safeParse(raw, shape) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULTS[shape]];
  } catch {
    return [...DEFAULTS[shape]];
  }
}
const loaderPrefs = new LoaderPrefsStore();
const api = window.peachPi;
class SnapshotStore {
  current = null;
  /** Last-seen top-level arrays/objects keyed by id (where stable). When a
   *  fresh snapshot arrives, entries that are shallow-equal to the cached ref
   *  reuse the *existing* ref so Svelte's keyed `{#each}` and `$derived`
   *  comparisons skip reconciliation. The main process emits a full snapshot
   *  on every status flip; without this, every Thread object gets a new ref
   *  even when unchanged → sidebar rows + `selectedThread` churn on each
   *  transition. With it, only actually-changed threads invalidate. */
  threadCache = /* @__PURE__ */ new Map();
  prevThreads = [];
  prevProjects = [];
  prevWorktrees = [];
  prevAutomations = [];
  prevUi = null;
  async init() {
    this.current = await api.invoke("app:getSnapshot");
    this.cacheCurrent();
    api.on("event:snapshot", (snapshot2) => {
      this.current = this.reconcile(snapshot2);
    });
  }
  cacheCurrent() {
    if (!this.current) return;
    for (const t of this.current.threads) this.threadCache.set(t.id, t);
    this.prevThreads = this.current.threads;
    this.prevProjects = this.current.projects;
    this.prevWorktrees = this.current.worktrees;
    this.prevAutomations = this.current.automations;
    this.prevUi = this.current.ui;
  }
  /** Reuse existing refs for unchanged entries so downstream reactivity
   *  invalidates only for entries that actually changed. Returns a snapshot
   *  with stable identity for unchanged threads/projects/etc. */
  reconcile(next) {
    const threads = [];
    const seen = /* @__PURE__ */ new Set();
    for (const t of next.threads) {
      seen.add(t.id);
      const prev = this.threadCache.get(t.id);
      if (prev && shallowEqualThread(prev, t)) {
        threads.push(prev);
      } else {
        this.threadCache.set(t.id, t);
        threads.push(t);
      }
    }
    for (const id2 of this.threadCache.keys()) {
      if (!seen.has(id2)) this.threadCache.delete(id2);
    }
    this.prevThreads = threads;
    this.prevProjects = shallowEqual(this.prevProjects, next.projects) ? this.prevProjects : next.projects;
    this.prevWorktrees = shallowEqual(this.prevWorktrees, next.worktrees) ? this.prevWorktrees : next.worktrees;
    this.prevAutomations = shallowEqual(this.prevAutomations, next.automations) ? this.prevAutomations : next.automations;
    this.prevUi = this.prevUi && shallowEqual(this.prevUi, next.ui) ? this.prevUi : next.ui;
    return {
      ...next,
      threads,
      projects: this.prevProjects,
      worktrees: this.prevWorktrees,
      automations: this.prevAutomations,
      ui: this.prevUi ?? next.ui
    };
  }
}
const snapshot = new SnapshotStore();
function shallowEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (typeof a === "object" && typeof b === "object" && a && b) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (a[k] !== b[k]) return false;
    }
    return true;
  }
  return false;
}
function shallowEqualThread(a, b) {
  if (a === b) return true;
  const ra = a;
  const rb = b;
  for (const k in rb) {
    if (ra[k] !== rb[k]) return false;
  }
  return true;
}
class TranscriptStore {
  byThread = new SvelteMap();
  loaded = /* @__PURE__ */ new Set();
  /** Deltas captured while a backfill fetch is in flight, keyed by thread, so
   *  they can be replayed on top of the authoritative snapshot. */
  buffering = /* @__PURE__ */ new Map();
  /** The remote thread currently attached to the (single) remote tap, so
   *  `event:remoteTap` frames (keyed by the master's threadId) fold into the
   *  right composite-id transcript. */
  activeRemote = null;
  started = false;
  init() {
    if (this.started) return;
    this.started = true;
    api.on("event:transcript", ({ threadId, ops, seq }) => {
      this.buffering.get(threadId)?.push({ seq, ops });
      this.byThread.set(threadId, applyTranscriptOps(this.byThread.get(threadId) ?? [], ops));
    });
    api.on("event:remoteTap", (frame2) => {
      const ar = this.activeRemote;
      if (!ar || frame2.threadId !== ar.remoteThreadId) return;
      if (frame2.kind === "backfill") {
        this.byThread.set(ar.compositeId, [...frame2.items]);
      } else if (frame2.kind === "transcript") {
        this.byThread.set(ar.compositeId, applyTranscriptOps(this.byThread.get(ar.compositeId) ?? [], frame2.ops));
      }
    });
  }
  itemsFor(threadId) {
    return this.byThread.get(threadId) ?? [];
  }
  /** Ensure full history is loaded once per thread (resume / mid-run view).
   *  The snapshot is authoritative; live deltas that raced the fetch are
   *  replayed on top by flush seq, so nothing is dropped or double-applied. */
  async ensure(threadId) {
    const thread = snapshot.current?.threads.find((t) => t.id === threadId);
    if (thread?.remoteHostId && thread.remoteThreadId) {
      if (this.activeRemote?.compositeId === threadId) return;
      this.activeRemote = { compositeId: threadId, remoteThreadId: thread.remoteThreadId };
      await api.invoke("remote:attach", thread.remoteHostId, thread.remoteThreadId);
      return;
    }
    if (this.loaded.has(threadId)) return;
    this.loaded.add(threadId);
    const buffered = [];
    this.buffering.set(threadId, buffered);
    try {
      const { items, seq } = await api.invoke("threads:getTranscript", threadId);
      let next = items;
      for (const d of buffered) {
        if (d.seq > seq) next = applyTranscriptOps(next, d.ops);
      }
      this.byThread.set(threadId, next);
    } finally {
      this.buffering.delete(threadId);
    }
  }
}
const transcripts = new TranscriptStore();
const emptyDraft = () => ({
  text: "",
  attachments: [],
  mode: "build",
  command: null,
  connections: [],
  secrets: [],
  planPromptSent: false
});
const STORAGE_KEY$2 = "peach-pi:composer-drafts";
const PERSIST_DEBOUNCE_MS = 300;
function isDraftEmpty(d) {
  return d.text === "" && d.attachments.length === 0 && d.command === null && d.connections.length === 0 && d.secrets.length === 0;
}
function loadPersistedDrafts() {
  const out = /* @__PURE__ */ new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY$2);
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    for (const [id2, d] of Object.entries(parsed)) {
      if (!d || typeof d.text !== "string") continue;
      const draft = { ...emptyDraft(), ...d };
      if (!isDraftEmpty(draft)) out.set(id2, draft);
    }
  } catch {
  }
  return out;
}
function serializeDrafts(byThread) {
  const obj = {};
  for (const [id2, d] of byThread) {
    if (isDraftEmpty(d)) continue;
    obj[id2] = d;
  }
  return Object.keys(obj).length ? JSON.stringify(obj) : null;
}
function serializeLightDrafts(byThread) {
  const obj = {};
  for (const [id2, d] of byThread) {
    if (isDraftEmpty(d)) continue;
    const light = d.attachments.filter((a) => a.kind !== "image");
    obj[id2] = light.length === d.attachments.length ? d : { ...d, attachments: light };
  }
  return Object.keys(obj).length ? JSON.stringify(obj) : null;
}
class DraftStore {
  byThread = new SvelteMap(loadPersistedDrafts());
  persistTimer = null;
  constructor() {
    window.addEventListener("beforeunload", () => this.flushPersist());
  }
  /** Pure read — safe inside $derived. Missing drafts materialize on first update(). */
  for(threadId) {
    return this.byThread.get(threadId) ?? emptyDraft();
  }
  update(threadId, patch) {
    this.byThread.set(threadId, { ...this.for(threadId), ...patch });
    this.schedulePersist();
  }
  clearText(threadId) {
    this.update(threadId, {
      text: "",
      attachments: [],
      command: null,
      connections: [],
      secrets: []
    });
  }
  schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flushPersist(), PERSIST_DEBOUNCE_MS);
  }
  flushPersist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const json = serializeDrafts(this.byThread);
    try {
      if (json === null) localStorage.removeItem(STORAGE_KEY$2);
      else localStorage.setItem(STORAGE_KEY$2, json);
    } catch {
      const light = serializeLightDrafts(this.byThread);
      try {
        if (light === null) localStorage.removeItem(STORAGE_KEY$2);
        else localStorage.setItem(STORAGE_KEY$2, light);
      } catch {
      }
    }
  }
}
class QueueStore {
  byThread = new SvelteMap();
  init() {
    api.on("event:queue", (q) => this.byThread.set(q.threadId, q));
  }
  for(threadId) {
    return this.byThread.get(threadId) ?? { threadId, steering: [], followUp: [] };
  }
}
const drafts = new DraftStore();
const queues = new QueueStore();
let settingsNav = null;
function actionForTarget(target, label) {
  if (target === "utility-model" && settingsNav) {
    return { label, run: () => settingsNav("utility model") };
  }
  return void 0;
}
const HIDDEN_STATUS_KEYS = /* @__PURE__ */ new Set(["caveman", "vision-proxy", "multimodal-proxy", "mcp"]);
class ExtensionUiStore {
  dialogs = [];
  toasts = [];
  /** Latest frame of a live extension `custom()` TUI, or null when none. */
  terminalCustom = null;
  /** Package names with available updates (shown as badge in sidebar). */
  extUpdates = [];
  /** True when a manual update was queued while runs were active; cleared
   *  when the update applies (extUpdates empties). Survives popover
   *  close/reopen since it lives on the store, not the component. */
  extUpdateQueued = false;
  /** threadId → (key → text) */
  statuses = new SvelteMap();
  /** threadId → (key → widget lines) — e.g. pi-subagents fleet feed. */
  widgets = new SvelteMap();
  toastSeq = 0;
  started = false;
  init() {
    if (this.started) return;
    this.started = true;
    api.on("event:extensionUi", (req) => {
      this.dialogs = [...this.dialogs, req];
    });
    api.on("event:notice", (notice) => this.pushToast(notice));
    api.on("event:extUpdatesAvailable", ({ packages }) => {
      this.extUpdates = packages;
      if (packages.length === 0) this.extUpdateQueued = false;
    });
    api.on("event:extensionStatus", ({ threadId, key, text }) => {
      let map = this.statuses.get(threadId);
      if (!map) {
        map = new SvelteMap();
        this.statuses.set(threadId, map);
      }
      if (text === null || text === "") map.delete(key);
      else map.set(key, text);
    });
    api.on("event:terminalCustom", (frame2) => {
      this.terminalCustom = frame2.closed ? null : frame2;
    });
    api.on("event:extensionWidget", ({ threadId, key, lines }) => {
      let map = this.widgets.get(threadId);
      if (!map) {
        map = new SvelteMap();
        this.widgets.set(threadId, map);
      }
      if (lines === null) map.delete(key);
      else map.set(key, lines);
    });
  }
  /** Register the renderer's settings-navigation handler (called by App.svelte
   *  during init). Enables action buttons on `event:notice` toasts whose
   *  `action.target` is a settings section. */
  setSettingsNav(fn) {
    settingsNav = fn;
  }
  pushToast(notice) {
    const toast = {
      ...notice,
      id: ++this.toastSeq,
      action: notice.action ? actionForTarget(notice.action.target, notice.action.label) : void 0
    };
    this.toasts = [...this.toasts, toast];
    setTimeout(() => this.dismiss(toast.id), 5e3);
  }
  /** Renderer-originated toast, optionally with an action (e.g. Undo) and a
   *  leading icon. */
  notify(message, action, level = "info", icon) {
    const toast = { message, level, action, icon, id: ++this.toastSeq };
    this.toasts = [...this.toasts, toast];
    setTimeout(() => this.dismiss(toast.id), 5e3);
  }
  dismiss(id2) {
    this.toasts = this.toasts.filter((t) => t.id !== id2);
  }
  statusesFor(threadId) {
    const map = this.statuses.get(threadId);
    if (!map) return [];
    const out = [];
    for (const [key, text] of map) {
      if (HIDDEN_STATUS_KEYS.has(key)) continue;
      out.push(text);
    }
    return out;
  }
  widgetsFor(threadId) {
    return [...this.widgets.get(threadId)?.entries() ?? []].map(([key, lines]) => ({ key, lines }));
  }
  /** Iterate (threadId → widget map) for reactive cross-thread scans (e.g.
   *  the sidebar spinner that stays lit while a background subagent runs). */
  widgetEntries() {
    return this.widgets.entries();
  }
  async respond(requestId, value) {
    this.dialogs = this.dialogs.filter((d) => d.requestId !== requestId);
    await api.invoke("threads:respondExtensionUi", requestId, value);
  }
  /** Forward a keystroke from the overlay to the live `custom()` component. */
  terminalCustomInput(threadId, requestId, data) {
    void api.invoke("threads:terminalCustomInput", threadId, requestId, data);
  }
  /** Cancel the live `custom()` TUI (esc / overlay close). */
  cancelTerminalCustom(threadId, requestId) {
    this.terminalCustom = null;
    void api.invoke("threads:terminalCustomCancel", threadId, requestId);
  }
}
const extensionUi = new ExtensionUiStore();
function badgeCount(issues) {
  const parents = new Set(issues.filter((i) => i.parent !== null).map((i) => i.parent));
  return issues.filter((i) => i.state === "open" && !(i.isPrd && parents.has(i.number))).length;
}
class WorkQueueStore {
  result = null;
  loading = false;
  projectId = null;
  /** Open-issue counts for the sidebar badge, keyed by project id. Loaded
   *  once on mount via {@link loadCounts} and refreshed alongside the Work
   *  Queue view. Always a number (0 means zero issues or fetch failure). */
  counts = /* @__PURE__ */ new Map();
  async load(projectId) {
    this.projectId = projectId;
    this.result = null;
    if (!projectId) return;
    this.loading = true;
    try {
      const res = await api.invoke("workQueue:list", projectId);
      if (this.projectId === projectId) {
        this.result = res;
        this.setCount(projectId, res.ok ? badgeCount(res.issues) : 0);
      }
    } finally {
      if (this.projectId === projectId) this.loading = false;
    }
  }
  /** Set the cached open count for one project, triggering Map reactivity. */
  setCount(projectId, count) {
    this.counts.set(projectId, count);
    this.counts = new Map(this.counts);
  }
  /** Fetch open-issue counts for every repo project. Best-effort: failures and
   *  non-GitHub projects land as 0. Called once on mount. */
  async loadCounts(projectIds) {
    await Promise.all(projectIds.map(async (id2) => {
      const res = await api.invoke("workQueue:openCount", id2);
      this.counts.set(id2, res.ok ? res.count : 0);
      this.counts = new Map(this.counts);
    }));
  }
  /** Count for a single project (cached). 0 when unknown / not fetched. */
  countFor(projectId) {
    return this.counts.get(projectId) ?? 0;
  }
}
const workQueue = new WorkQueueStore();
const FLEET_WIDGET_KEY = "subagent-status";
function stripTreePrefix(line) {
  return line.replace(/^[\s│├└─◜◠◝◞◡◟●◍•]+/u, "").trim();
}
const BADGE_PATTERN = /^(.+?)\s+\[([a-z0-9-]+)\](?:\s*·\s*(.*))?$/;
function parseFleet(lines) {
  if (lines.length === 0) return null;
  const headerLine = lines.find((line) => /Agents/.test(line) && /running/.test(line));
  const count = Number(headerLine?.match(/(\d+)\s+running/)?.[1] ?? 0);
  const agents = [];
  let current = null;
  for (const raw of lines) {
    if (raw === headerLine) continue;
    const line = stripTreePrefix(raw);
    if (!line) continue;
    const badge = line.match(BADGE_PATTERN);
    if (badge) {
      const stats = badge[3];
      current = {
        name: (badge[1] ?? "").trim(),
        agent: badge[2],
        stats: stats ? stats.split(/\s*·\s*/).filter(Boolean) : []
      };
      agents.push(current);
      continue;
    }
    if (current) {
      if (current.title === void 0) current.title = line;
      else if (current.activity === void 0) current.activity = line;
    }
  }
  if (agents.length === 0 && count === 0) return null;
  return { count: count || agents.length, agents };
}
const KEY = "peachpi:sounds-muted";
function soundsMuted() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
const clickMp3 = "data:audio/mpeg;base64,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";
const buttonDownMp3 = "data:audio/mpeg;base64,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";
const buttonUpMp3 = "data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYyLjMuMTAwAAAAAAAAAAAAAAD/+1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYaW5nAAAADwAAAAwAABimACoqKioqKioqTExMTExMTExaWlpaWlpaWmtra2tra2tra3x8fHx8fHx8np6enp6enp6vr6+vr6+vr6/AwMDAwMDAwNHR0dHR0dHR4uLi4uLi4uLi8/Pz8/Pz8/P//////////wAAAABMYXZjNjIuMTEAAAAAAAAAAAAAAAAkA4QAAAAAAAAYpjbm8XMAAAAAAAAAAAAAAAAAAAAA//vQZAAAAmYAT+0AAAgAAA/woAABIUYTNfm3gEDECmV3AiAACATbcctirc4PjgQDAJg+D4Pg+CAIAgCAJg+XPwACAIAgCYPh/OKBAEAHbgh/E4IAgCAIf4gBMP/y4f/gmD7/y7ygIawfB8CAg7KAhl0YKhGdXdHdHk95+9TIoxKTGl5AIe8SjzAc+QgQKDHMw0dHQ4EAAcpmVhhbl8jAAswMCEJIYKCFwEsHINML4kpnDkRAVCyX88gQK4NRRFE/D1DJGFDWUaU4jqNYkNQZcmgu5YDKXY6zoIEpV2n8HK8J6wo0v6OQhgaDWUSdJ4fJtsqqVDHXEWVyRC5bUKSSin0eLFEUr6JZ6rn6GWeVgN7P9vnjI3xnJ9HUMZ8wQXCdabrbeR53LO40GLuNtyn3F0zq6A7cKVo3vpX8Bu3VxrHWG/T6tE4e7x/iMfrdEfuDOqYKGQXaxEbkWlWDXVr9ie0xqn////////////3jOv///////////Ht5bsFuawCS97NByBUCAgANtvKZiEkYn93c7FUW5nyD0AxyT9Pz+ebf/WVEzw7/3FySv9IASI141oZmeGa+qBtuRKk05UZJhEja1rg8PL4GnqaPgdZmcgpoMSaoRBYUGjUxEBFgUFJQiKFpNyPblsnloCmNBTPWS25bkrEHPigwIHJYnOlz2KypfDBwyAZ9DAvRRuVLYyrZF4+wV2WIpzono/hCH9pXobnlRUTdo3LIwzeA7bDF2NMWO1+xG3glE/G4XJkvG9h2MRyopuhQ4liWVLFZyYdtyqnuWLUed+epuafytlPPpAjX37i8s+7atS2aqU83ybkfJTetQ/cobGqt+2/jkRh36lqXw/bp5HrHG1ckOdidppmpVp5VTfP81LLWNjs7T2bdXsonMKfLUruWKPG3IMKetYrZf//////////////9QQhn/8c4AMSA1AglUZVWxlxNlBEABHGY7LgtoL3wFHiC0H6cOtUDq6VJibAp0OY1jGYH2PywfgkU132Bn/DC2PEJPTX//////+ljGXFVFVBgBRCoIpw7W17M+kgIjA5kGQ7ntkQFAjKWIwsdMZGTIFkSERUlBhCGExkqIGGIkejRaDAQUf/70GTLgAi+dM7+bwSARENJr8EUkCc2Ezv5vIBAsQAmfwIAAMsEcga2QKIrEFZDvUmFkKnWtThzQ/st8dBMANaDhqtY+lWpqX6sMLIQwEaDnkupiVsyTBXO5DW0tUNk5G2qKYtxcVQVcjPGNsWlfFfv8XGVnaa8YiDLzJJSq1Gn+ZWzllzWbEZd9Yr6QPRT0SuwJAjLYcqx+NU0GO+wPB76XcPSihXq7auYJd2cbG5EYlt6Jz0MtdgqHnaq5SuE3oevS+9Odn49ygluNypPyjGNVYKiMMvq+zvOjJH2i0phmAdUtmnisvlkzOxiii0pw5clFaBItA8ukEizszVuNwzBcd//3////////////////3/////////////////+7f3Y6AGAGYA4BBgZt33O5BQBAA94Y1v17yOU3qsFEGrXlbOIbH3dTze3xD///i/ZCIWXWmU5ZbY3CbizhIgaJSA9QsQSVAWUq1TsTXrIFHUP2TQIavLwKgmCCknybPcVDqJWePrkIgNp8tcTTU8gbLnV7SVRIVH1z51hxQopjTcqH5A3KGomhON3Pd2vKJ1ijKco6GW/ZLYhtWyahzWXFVcbPn22pNLOqGNtOrq1X8e65qH3b4m6n73sa5P9x1irmVKzXLOSa49PTjk1fC7EgDTckSqxADUYofQ/Pvott6NXyf6HX/3X/QnJZJGVCk2SDgwAEAEhNZborOYzGsqGqHVACqQuGqsxqMOurp9WmwMzmOTFHAPFCy6Mdpyo6kTdEIwJbRK69vLdNjrqTbZ1jFSZZoxipcTOt7Sj0S82YydLXU3GDdMWrvkpiKaNObLTUnwfZy8nP3JX6ZIZ18zCysR7zZNkLgyE8U4pkZ7UmQ8yy5DKkeR5GKPevHmvf12IDbtjTUKLAAYxI1rkVRZrHtt+2z2/3ay7lHcIO/3fUghVh0ZUO2RIAE8TYKQbCEjCLIiAwpCYHBAKsHAJJT6wKgsANStOnJn9gENAUTFTpAiaSD7Q4JQsDsWj5I5UKIC811YOYXmnKCNJiRFBApJEKwoCE4qlSWj2EGj7s5jojBkq+cx9xdaS2rZUnEUqZrSx6ZCTkzdPV/M69OnNKddpY7ODnqT/+4Bk+gAE+2fQ/2FgChkAGTzgAAES6YkxrCRzyHwAJXQAAAQ7woGjrSaC3NItYUHQVmJJJJJH2m0Uj6zAVS5bntsSHnqlH627K/fb/t6nSNntsR+7/Oa/s/OmvrCFSLiXZpdG0AjV6HDZILLg8MTFCZAGM3IOQuwKGZ4mkr5rz0w1MQDDcki92C0IkIGAYg1URKRgys2K2IMTKE4kgzoqRCNHdr7pcpqPyXfNBFFrKF+0lfXc3txXVimltOu3Ph8w22klJv/xbnH1WXtHIjmcpm07nkZMyfULp01jFlD7pXMjhh7h3BoeiFFQO0l9o5M70fuBDNVCFZ83EmwCkpopHgnttEvcHOzo009Lf1Pp4h1HRO5OsJbsV6oEh7d5ZorjbQAOoEUfAqNiZhhjOwcbL7l7wQCWkPB1TL0dFE5wWeUrcoce6HaWUUFC7TcZTEHnmEInazCU8zckONsKtk5ag++XfizpXuLIGrRtXP/7kGTnAASbZs37KRxaKiAJfQAAARLZoznsJHPgmgRl/BAJRFyq0SZAglLppHL3o5vthJNNGxRuM4oazJ1T1GZLp2oVWZmMRY7lJXLU3uyctTxSQsuAsmIsZU2JaU1ur9rYXayQ0bRwMtT/7DCUkS31doBmdFq1NdPolRWpbO5PVfRxF9aX5D9mr+2nMq9gNM2707trXGCCdTKlRjxjWwquKCjzgODM8JgLQkBamiX8qZK87RTQ4DgmiImFREWUIhsscGgUg8kUaSgwcUqkhY75oq5x81koag8wfFHzpylDqCBJXNTzzZ5s01Nj9Sk08e7gyhZZdncM90zTf9r4i+5bdTD3uOxMVnHS+HnNj28xbtneyatz3PdFWxkWyZiLdLae17nx2xOHzE3TqOdNlOqQQzNThkStNsgh3pal1VPDs2V2Vd2nZ0/dSVnIe0/su81//v+l1UJYeHOFNWVHNvLlMjgYjETMmAAYAUYMAGjGgFMaQYITBE5NQpMopO0wAgJcANOhhMxcky4heCGbXQ4A4kG8SfRwBoJeQKxsGdw0Q//7kGToAATWX037SR1qIuHZLAQiChQ9nzv1lYAok4SlvoQQBCYIDHiwKA+NMSYS7SnyIQoUAz4OYaNF6Rlr3LDMtjD2sgLboApCSjmyjDLJOwPCMZCsWa6/FtY7iw+7Cr2zVKR1HxkL5vNfcuFSGrE3ni8bfZkjNHDbeG47Bn1Iu3eI35ypejdaHIfl0OMTo8JyAlqJmNPp5XVrw7XuZVZNLJqFvu69PKPicP07qUrH28funbslYrx24feZs1TOZpKa38xjLql2dl1BP08jqReH43qMVHbd+Nv/TtPTrlU4ySILopKzuQPMxeRx3///////////////////lmGEX1//////////////7X3Mn5Q86iGOdggEYGeOozFYDAQBAhY2MnTAoJnvb9ZCE7MrsU7/ZeTIT/2O1TiP8h//gg7/0id3//8gQLh8vmVUs6mSGLGRCUC0VASUU4NGI9bCIWMmhjKDgo7zAkA6GnN5JTCSY5g8MHMza483svMHJjCwgy00MWAQKmccKKY7I+gEjDDzRhONVgYURLJGMO67AhIc3f/70GTkAAm7hNH+aySAOUTaP8CIEComEW35vJBBJgcrvwRQUITpnNsFOVQZ+HKUNWcrU4q9Vj6AJZpqrTkCmrG16xFas5eboDmxUEFByJyy1ag0Gsxd2IRZkaw22dsifNZ7F2GKZoAQwdISq/rTYjEqF4GPMSFmtv8ypPZKRCBibuMxAxaAVJIHCTm3+a9LqCQwFEakjxZm3sMQXyla0IQWbDx5bRHst6i2gozZStuNA3GOvVP5QDSOlA76W6G3nFrkZcXD2MBgwOEZW+KEx0U4WhMsVwpm8DCGsvwymWNlp4Fn3K9wr199cdPY/zpS+RWI7DNx/qkkjU9jG56DoX////////////////dtav////////////////1d6pnUKEGAUABAUVYREbLrdR8EYHg1HM4Org5angQxp4M07Lyp0/ifORFS6u/QLVrOzp2uXUJ2QVnXUaH8YRPLDv1mRgsaA7oUaeOj1alzlDURJIJoqUITGBRg0wixgMFuDrI8IZQBpgp+M8TlRRYmzd0p9he+OIPLI2qKjhyxVLN1xaJRlCXR9edhldaE5OVrNZla6tnTl3sx37QR0Z5q1aoV3Gb6wmXJd3avTmV6cdcjlr7zWu1rMy099Vrq1llS69b8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";
const keyOnMp3 = "data:audio/mpeg;base64,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";
const keyOffMp3 = "data:audio/mpeg;base64,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";
const click01Mp3 = "data:audio/mpeg;base64,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";
const URLS = {
  click: clickMp3,
  down: buttonDownMp3,
  up: buttonUpMp3,
  keys: [keyOnMp3, keyOffMp3],
  rotary: [click01Mp3]
};
const CLICK_RATE = { down: 0.78, up: 1 };
let context;
let masterGain;
let clickBuffer;
let downClickBuffer;
let upClickBuffer;
let rotaryBuffers = [];
let loadPromise;
function getContext() {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    masterGain = context.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(context.destination);
  }
  return context;
}
function dataUriToArrayBuffer(uri) {
  const base64 = uri.slice(uri.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
async function fetchBuffer(ctx, url) {
  try {
    let data;
    if (url.startsWith("data:")) {
      data = dataUriToArrayBuffer(url);
    } else {
      const response = await fetch(url);
      if (!response.ok) return void 0;
      data = await response.arrayBuffer();
    }
    return await ctx.decodeAudioData(data);
  } catch {
    return void 0;
  }
}
function computeEnvelope(channel, windowSize) {
  const numWindows = Math.floor(channel.length / windowSize);
  const envelope = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w += 1) {
    let sumSq = 0;
    const start = w * windowSize;
    for (let i = 0; i < windowSize; i += 1) {
      const sample = channel[start + i] ?? 0;
      sumSq += sample * sample;
    }
    envelope[w] = Math.sqrt(sumSq / windowSize);
  }
  return envelope;
}
function sliceBuffer(ctx, source, startSample, endSample) {
  const length = Math.max(1, endSample - startSample);
  const out = ctx.createBuffer(source.numberOfChannels, length, source.sampleRate);
  for (let ch = 0; ch < source.numberOfChannels; ch += 1) {
    const channelData = source.getChannelData(ch);
    if (channelData) {
      const data = channelData.subarray(startSample, startSample + length);
      out.copyToChannel(data, ch);
    }
  }
  return out;
}
function trimSilence(ctx, buffer) {
  const channel = buffer.getChannelData(0);
  if (!channel) return buffer;
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(1, Math.floor(sampleRate * 3e-3));
  const envelope = computeEnvelope(channel, windowSize);
  let peak = 0;
  for (let i = 0; i < envelope.length; i += 1) {
    const val = envelope[i] ?? 0;
    if (val > peak) peak = val;
  }
  if (peak === 0) return buffer;
  const threshold = peak * 0.04;
  let firstWindow = 0;
  while (firstWindow < envelope.length && (envelope[firstWindow] ?? 0) < threshold) firstWindow += 1;
  let lastWindow = envelope.length - 1;
  while (lastWindow > firstWindow && (envelope[lastWindow] ?? 0) < threshold) lastWindow -= 1;
  const lead = Math.floor(sampleRate * 2e-3);
  const tail = Math.floor(sampleRate * 0.025);
  const start = Math.max(0, firstWindow * windowSize - lead);
  const end = Math.min(channel.length, (lastWindow + 1) * windowSize + tail);
  if (end - start < windowSize * 2) return buffer;
  return sliceBuffer(ctx, buffer, start, end);
}
function splitKeySample(ctx, buffer) {
  const channel = buffer.getChannelData(0);
  if (!channel) {
    const whole = trimSilence(ctx, buffer);
    return { press: whole, release: whole };
  }
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(1, Math.floor(sampleRate * 3e-3));
  const envelope = computeEnvelope(channel, windowSize);
  let peakAIdx = 0;
  let peakAVal = 0;
  for (let i = 0; i < envelope.length; i += 1) {
    const val = envelope[i] ?? 0;
    if (val > peakAVal) {
      peakAVal = val;
      peakAIdx = i;
    }
  }
  const minGap = Math.max(1, Math.floor(0.04 / 3e-3));
  const valleyThreshold = peakAVal * 0.08;
  let valleyIdx = peakAIdx + minGap;
  while (valleyIdx < envelope.length && (envelope[valleyIdx] ?? 0) >= valleyThreshold) valleyIdx += 1;
  if (valleyIdx >= envelope.length) {
    const whole = trimSilence(ctx, buffer);
    return { press: whole, release: whole };
  }
  let peakBIdx = valleyIdx;
  let peakBVal = 0;
  for (let i = valleyIdx; i < envelope.length; i += 1) {
    const val = envelope[i] ?? 0;
    if (val > peakBVal) {
      peakBVal = val;
      peakBIdx = i;
    }
  }
  if (peakBVal < peakAVal * 0.1) {
    const whole = trimSilence(ctx, buffer);
    return { press: whole, release: whole };
  }
  let splitWindowIdx = peakBIdx;
  let splitVal = envelope[peakBIdx] ?? 0;
  for (let i = peakAIdx + minGap; i < peakBIdx; i += 1) {
    const val = envelope[i] ?? 0;
    if (val < splitVal) {
      splitVal = val;
      splitWindowIdx = i;
    }
  }
  const lead = Math.floor(sampleRate * 3e-3);
  const tail = Math.floor(sampleRate * 0.025);
  const pressStart = Math.max(0, peakAIdx * windowSize - lead);
  const splitSample = splitWindowIdx * windowSize;
  const pressEnd = Math.min(channel.length, splitSample + Math.floor(sampleRate * 0.01));
  const releaseStart = Math.max(splitSample, peakBIdx * windowSize - lead);
  let releaseEndWindow = envelope.length - 1;
  const tailThreshold = peakBVal * 0.08;
  while (releaseEndWindow > peakBIdx && (envelope[releaseEndWindow] ?? 0) < tailThreshold) {
    releaseEndWindow -= 1;
  }
  const releaseEnd = Math.min(channel.length, (releaseEndWindow + 1) * windowSize + tail);
  return {
    press: sliceBuffer(ctx, buffer, pressStart, pressEnd),
    release: sliceBuffer(ctx, buffer, releaseStart, releaseEnd)
  };
}
function loadAll() {
  if (loadPromise) return loadPromise;
  const ctx = getContext();
  if (!ctx) {
    loadPromise = Promise.resolve();
    return loadPromise;
  }
  const urls = URLS;
  loadPromise = (async () => {
    const [rawClick, rawDown, rawUp, ...rawKeys] = await Promise.all([
      fetchBuffer(ctx, urls.click),
      fetchBuffer(ctx, urls.down),
      fetchBuffer(ctx, urls.up),
      ...urls.keys.map((url) => fetchBuffer(ctx, url))
    ]);
    if (rawClick) clickBuffer = trimSilence(ctx, rawClick);
    if (rawDown) downClickBuffer = trimSilence(ctx, rawDown);
    if (rawUp) upClickBuffer = trimSilence(ctx, rawUp);
    rawKeys.filter((b) => Boolean(b)).map((b) => splitKeySample(ctx, b));
    const rawRotary = await Promise.all(
      urls.rotary.map((url) => fetchBuffer(ctx, url))
    );
    rotaryBuffers = rawRotary.filter((b) => Boolean(b)).map((b) => trimSilence(ctx, b));
  })();
  return loadPromise;
}
async function ensureContextRunning(ctx) {
  if (ctx.state === "running") return true;
  try {
    await ctx.resume();
    return true;
  } catch {
    return false;
  }
}
async function fire(buffer, rate = 1) {
  const ctx = getContext();
  if (!ctx || !masterGain) return;
  if (!await ensureContextRunning(ctx)) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  source.connect(masterGain);
  source.start();
}
function playClick(kind = "down") {
  if (soundsMuted()) return;
  const dedicated = kind === "down" ? downClickBuffer : upClickBuffer;
  if (dedicated) {
    void fire(dedicated);
    return;
  }
  if (clickBuffer) {
    void fire(clickBuffer, CLICK_RATE[kind] ?? 1);
    return;
  }
  void loadAll().then(() => {
    const buf = kind === "down" ? downClickBuffer : upClickBuffer;
    if (buf) void fire(buf);
    else if (clickBuffer) void fire(clickBuffer, CLICK_RATE[kind] ?? 1);
  });
}
function playRotary() {
  if (soundsMuted()) return;
  if (rotaryBuffers.length === 0) {
    void loadAll().then(() => {
      if (rotaryBuffers.length > 0) playRotary();
    });
    return;
  }
  const idx = Math.floor(Math.random() * rotaryBuffers.length);
  const buffer = rotaryBuffers[idx];
  if (buffer) void fire(buffer, 0.9 + Math.random() * 0.2);
}
SnoozePicker[FILENAME] = "src/desktop-renderer/app/SnoozePicker.svelte";
function SnoozePicker($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { anchor, onPick, onClose } = $$props;
      const options = [
        { label: "1 hour", ms: 36e5 },
        { label: "3 hours", ms: 3 * 36e5 },
        { label: "Tomorrow", ms: 24 * 36e5 },
        { label: "3 days", ms: 3 * 24 * 36e5 },
        { label: "1 week", ms: 7 * 24 * 36e5 }
      ];
      $$renderer2.push(`<div class="fixed z-50 w-32 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl" data-testid="snooze-picker"${attr_style("", {
        top: (
          // Fixed positioning escapes every overflow ancestor (project body
          // overflow:hidden, chats max-h-48 overflow-auto, sidebar nav overflow-y-auto)
          // that otherwise clipped the picker to a couple of options. Flip upward when
          // there's no room below. Close on scroll rather than chase the anchor —
          // standard for transient menus and avoids the picker drifting off the anchor.
          // Only dismiss when a scroll actually moves the anchor — i.e. the anchor
          // itself or one of its scroll-container ancestors. Scrolls elsewhere must
          // not close the menu: notably the main thread view re-pinning
          // `scrollTop = scrollHeight` while *another* thread streams fires window
          // scroll events that have nothing to do with this picker's anchor.
          "-9999px"
        ),
        left: void 0
      })}>`);
      push_element($$renderer2, "div", 85, 0);
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(options);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let opt = each_array[$$index];
        $$renderer2.push(`<button class="block w-full px-3 py-1.5 text-left text-xs text-fg-soft hover:bg-surface-2">`);
        push_element($$renderer2, "button", 94, 4);
        $$renderer2.push(`${escape_html(opt.label)}</button>`);
        pop_element();
      }
      $$renderer2.push(`<!--]--></div>`);
      pop_element();
    },
    SnoozePicker
  );
}
SnoozePicker.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
/**
 * @file
 * @license @lucide/svelte v1.18.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
/**
 * @file
 * @license @lucide/svelte v1.18.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};
/**
 * @file
 * @license @lucide/svelte v1.18.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const LucideContext = Symbol("lucide-context");
const getLucideContext = () => getContext$1(LucideContext);
Icon[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/Icon.svelte";
function Icon($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const globalProps = getLucideContext() ?? {};
      const {
        name,
        color = globalProps.color ?? "currentColor",
        size: size2 = globalProps.size ?? 24,
        strokeWidth = globalProps.strokeWidth ?? 2,
        absoluteStrokeWidth = globalProps.absoluteStrokeWidth ?? false,
        iconNode = [],
        children,
        $$slots,
        $$events,
        ...props
      } = $$props;
      const calculatedStrokeWidth = derived(() => absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size2) : strokeWidth);
      $$renderer2.push(`<svg${attributes(
        {
          ...defaultAttributes,
          ...!children && !hasA11yProp(props) && { "aria-hidden": "true" },
          ...props,
          width: size2,
          height: size2,
          stroke: color,
          "stroke-width": calculatedStrokeWidth(),
          class: clsx([
            "lucide-icon lucide",
            globalProps.class,
            name && `lucide-${name}`,
            props.class
          ])
        },
        void 0,
        void 0,
        void 0,
        3
      )}>`);
      push_element($$renderer2, "svg", 9, 0);
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(iconNode);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let [tag, attrs] = each_array[$$index];
        validate_dynamic_element_tag(() => tag);
        push_element($$renderer2, tag, 20, 4);
        element($$renderer2, tag, () => {
          $$renderer2.push(`${attributes({ ...attrs }, void 0, void 0, void 0, 3)}`);
        });
        pop_element();
      }
      $$renderer2.push(`<!--]-->`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></svg>`);
      pop_element();
    },
    Icon
  );
}
Icon.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Alarm_clock[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/alarm-clock.svelte";
function Alarm_clock($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["circle", { "cx": "12", "cy": "13", "r": "8" }],
        ["path", { "d": "M12 9v4l2 2" }],
        ["path", { "d": "M5 3 2 6" }],
        ["path", { "d": "m22 6-3-3" }],
        ["path", { "d": "M6.38 18.7 4 21" }],
        ["path", { "d": "M17.64 18.67 20 21" }]
      ];
      Icon($$renderer2, spread_props([{ name: "alarm-clock" }, props, { iconNode }]));
    },
    Alarm_clock
  );
}
Alarm_clock.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Sparkles[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/sparkles.svelte";
function Sparkles($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
          }
        ],
        ["path", { "d": "M20 2v4" }],
        ["path", { "d": "M22 4h-4" }],
        ["circle", { "cx": "4", "cy": "20", "r": "2" }]
      ];
      Icon($$renderer2, spread_props([{ name: "sparkles" }, props, { iconNode }]));
    },
    Sparkles
  );
}
Sparkles.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Bug[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/bug.svelte";
function Bug($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M12 20v-9" }],
        [
          "path",
          {
            "d": "M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"
          }
        ],
        ["path", { "d": "M14.12 3.88 16 2" }],
        ["path", { "d": "M21 21a4 4 0 0 0-3.81-4" }],
        ["path", { "d": "M21 5a4 4 0 0 1-3.55 3.97" }],
        ["path", { "d": "M22 13h-4" }],
        ["path", { "d": "M3 21a4 4 0 0 1 3.81-4" }],
        ["path", { "d": "M3 5a4 4 0 0 0 3.55 3.97" }],
        ["path", { "d": "M6 13H2" }],
        ["path", { "d": "m8 2 1.88 1.88" }],
        ["path", { "d": "M9 7.13V6a3 3 0 1 1 6 0v1.13" }]
      ];
      Icon($$renderer2, spread_props([{ name: "bug" }, props, { iconNode }]));
    },
    Bug
  );
}
Bug.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Wrench[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/wrench.svelte";
function Wrench($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "wrench" }, props, { iconNode }]));
    },
    Wrench
  );
}
Wrench.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
File_text[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/file-text.svelte";
function File_text($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
          }
        ],
        ["path", { "d": "M14 2v5a1 1 0 0 0 1 1h5" }],
        ["path", { "d": "M10 9H8" }],
        ["path", { "d": "M16 13H8" }],
        ["path", { "d": "M16 17H8" }]
      ];
      Icon($$renderer2, spread_props([{ name: "file-text" }, props, { iconNode }]));
    },
    File_text
  );
}
File_text.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Cog[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/cog.svelte";
function Cog($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M11 10.27 7 3.34" }],
        ["path", { "d": "m11 13.73-4 6.93" }],
        ["path", { "d": "M12 22v-2" }],
        ["path", { "d": "M12 2v2" }],
        ["path", { "d": "M14 12h8" }],
        ["path", { "d": "m17 20.66-1-1.73" }],
        ["path", { "d": "m17 3.34-1 1.73" }],
        ["path", { "d": "M2 12h2" }],
        ["path", { "d": "m20.66 17-1.73-1" }],
        ["path", { "d": "m20.66 7-1.73 1" }],
        ["path", { "d": "m3.34 17 1.73-1" }],
        ["path", { "d": "m3.34 7 1.73 1" }],
        ["circle", { "cx": "12", "cy": "12", "r": "2" }],
        ["circle", { "cx": "12", "cy": "12", "r": "8" }]
      ];
      Icon($$renderer2, spread_props([{ name: "cog" }, props, { iconNode }]));
    },
    Cog
  );
}
Cog.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Circle[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/circle.svelte";
function Circle($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [["circle", { "cx": "12", "cy": "12", "r": "10" }]];
      Icon($$renderer2, spread_props([{ name: "circle" }, props, { iconNode }]));
    },
    Circle
  );
}
Circle.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const TAG_META = {
  feature: { icon: Sparkles, label: "New feature" },
  bugfix: { icon: Bug, label: "Bug fix" },
  refactor: { icon: Wrench, label: "Refactor" },
  docs: { icon: File_text, label: "Docs" },
  chore: { icon: Cog, label: "Chore" },
  other: { icon: Circle, label: "Other" }
};
SnoozedPopover[FILENAME] = "src/desktop-renderer/app/SnoozedPopover.svelte";
function SnoozedPopover($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { anchor, threads, onSelect, onUnsnooze, onClose } = $$props;
      let pos = { top: 0, left: 0 };
      function timeLeft(until) {
        const ms = new Date(until).getTime() - Date.now();
        if (ms <= 0) return "soon";
        const h = Math.floor(ms / 36e5);
        return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${Math.max(1, h)}h`;
      }
      $$renderer2.push(`<div class="fixed z-40 w-80 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"${attr_style(`top: ${stringify(pos.top)}px; left: ${stringify(pos.left)}px`)} data-testid="snoozed-popover">`);
      push_element($$renderer2, "div", 56, 0);
      $$renderer2.push(`<div class="border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-fainter uppercase">`);
      push_element($$renderer2, "div", 63, 2);
      $$renderer2.push(`Snoozed · ${escape_html(threads.length)}</div>`);
      pop_element();
      $$renderer2.push(` <div class="max-h-72 overflow-y-auto py-1">`);
      push_element($$renderer2, "div", 66, 2);
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(threads);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let thread = each_array[$$index];
        const Tag = TAG_META[thread.tag ?? "other"];
        $$renderer2.push(`<div class="group flex items-center gap-2 px-2 py-1 hover:bg-surface-2">`);
        push_element($$renderer2, "div", 69, 6);
        $$renderer2.push(`<button class="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] text-muted hover:text-fg">`);
        push_element($$renderer2, "button", 70, 8);
        if (Tag.icon) {
          $$renderer2.push("<!--[-->");
          Tag.icon($$renderer2, { size: 13, class: "shrink-0 text-faint" });
          $$renderer2.push("<!--]-->");
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push("<!--]-->");
        }
        $$renderer2.push(` <span class="truncate">`);
        push_element($$renderer2, "span", 78, 10);
        $$renderer2.push(`${escape_html(thread.title || "Untitled")}</span>`);
        pop_element();
        $$renderer2.push(`</button>`);
        pop_element();
        $$renderer2.push(` `);
        if (thread.snoozedUntil) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="shrink-0 text-[10px] text-fainter">`);
          push_element($$renderer2, "span", 81, 10);
          $$renderer2.push(`${escape_html(timeLeft(thread.snoozedUntil))}</span>`);
          pop_element();
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> <button class="shrink-0 rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:text-fg" title="Unsnooze" aria-label="Unsnooze">`);
        push_element($$renderer2, "button", 83, 8);
        Alarm_clock($$renderer2, { size: 14 });
        $$renderer2.push(`<!----></button>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      }
      $$renderer2.push(`<!--]--></div>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
    },
    SnoozedPopover
  );
}
SnoozedPopover.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Check[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/check.svelte";
function Check($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [["path", { "d": "M20 6 9 17l-5-5" }]];
      Icon($$renderer2, spread_props([{ name: "check" }, props, { iconNode }]));
    },
    Check
  );
}
Check.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
DotMatrixLoader[FILENAME] = "src/desktop-renderer/components/ui/dot-matrix/DotMatrixLoader.svelte";
function DotMatrixLoader($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        shape = "square",
        size: size2 = 18,
        dotSize = 3,
        bloom = true,
        $$slots,
        $$events,
        ...rest
      } = $$props;
      const pool = loaderPrefs.selection(shape);
      const chosenId = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : void 0;
      const entry = chosenId ? byId(chosenId) : void 0;
      const Loader = entry?.component;
      if (Loader) {
        $$renderer2.push("<!--[0-->");
        Loader($$renderer2, spread_props([{ size: size2, dotSize, bloom, animated: true }, rest]));
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    },
    DotMatrixLoader
  );
}
DotMatrixLoader.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
BrailleSpinner[FILENAME] = "src/desktop-renderer/app/BrailleSpinner.svelte";
function BrailleSpinner($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        class: klass = "",
        title,
        shape = "square",
        size: size2 = 18,
        dotSize = 3
      } = $$props;
      DotMatrixLoader($$renderer2, {
        class: klass,
        shape,
        size: size2,
        dotSize,
        "aria-label": title ?? "Loading",
        "aria-hidden": title ? void 0 : true,
        animated: true
      });
    },
    BrailleSpinner
  );
}
BrailleSpinner.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
MovingHighlight[FILENAME] = "src/desktop-renderer/app/MovingHighlight.svelte";
function MovingHighlight($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        class: className = "",
        itemSelector,
        activeSelector,
        previewSelector = "",
        children
        /** CSS selector matching the highlightable items inside this group. */
        /** CSS selector matching the currently-selected item. */
        /** Optional CSS selector for a keyboard-previewed item (e.g. ⌘⇧↑/↓
         *  traversal). When it matches an item here, the hover indicator glides
         *  to it regardless of the pointer. */
      } = $$props;
      const hidden2 = () => ({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        ready: false,
        visible: false
      });
      let hover2 = hidden2();
      let active = hidden2();
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const transition = derived(() => "opacity 150ms ease");
      $$renderer2.push(`<div${attr_class(`sidebar-moving-highlight ${stringify(className)}`)}>`);
      push_element($$renderer2, "div", 241, 0);
      $$renderer2.push(`<div aria-hidden="true" class="sidebar-moving-highlight__indicator sidebar-moving-highlight__indicator--hover"${attr_style(`transform: translate3d(${stringify(hover2.left)}px, ${stringify(hover2.top)}px, 0); width: ${stringify(hover2.width)}px; height: ${stringify(hover2.height)}px; opacity: ${stringify(0)}; transition: ${transition()};`)}>`);
      push_element($$renderer2, "div", 266, 2);
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(` <div aria-hidden="true" class="sidebar-moving-highlight__indicator sidebar-moving-highlight__indicator--active"${attr_style(`transform: translate3d(${stringify(active.left)}px, ${stringify(active.top)}px, 0); width: ${stringify(active.width)}px; height: ${stringify(active.height)}px; opacity: ${stringify(0)}; transition: ${transition()};`)}>`);
      push_element($$renderer2, "div", 272, 2);
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(` `);
      children($$renderer2);
      $$renderer2.push(`<!----></div>`);
      pop_element();
    },
    MovingHighlight
  );
}
MovingHighlight.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Tooltip[FILENAME] = "src/desktop-renderer/app/Tooltip.svelte";
function Tooltip($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { text, children, delay: delay2 = 250, class: klass = "", style: style2 = "" } = $$props;
      $$renderer2.push(`<span${attr_class(`pp-tooltip ${stringify(
        // Position the popover with position:fixed so it escapes ancestor scroll
        // containers (e.g. the sidebar's overflow-y-auto panels) that would clip a
        // position:absolute pop. Runs after the pop mounts (open === true).
        // Prefer above the trigger; fall back below if near the viewport top.
        // Center on the trigger, then clamp into the viewport so a pop near the
        // right (or left) edge isn't clipped.
        klass
      )}`)}${attr_style(style2)}>`);
      push_element($$renderer2, "span", 57, 0);
      children?.($$renderer2);
      $$renderer2.push(`<!----> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></span>`);
      pop_element();
    },
    Tooltip
  );
}
Tooltip.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Search[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/search.svelte";
function Search($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "m21 21-4.34-4.34" }],
        ["circle", { "cx": "11", "cy": "11", "r": "8" }]
      ];
      Icon($$renderer2, spread_props([{ name: "search" }, props, { iconNode }]));
    },
    Search
  );
}
Search.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Eye[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/eye.svelte";
function Eye($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
          }
        ],
        ["circle", { "cx": "12", "cy": "12", "r": "3" }]
      ];
      Icon($$renderer2, spread_props([{ name: "eye" }, props, { iconNode }]));
    },
    Eye
  );
}
Eye.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Eye_off[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/eye-off.svelte";
function Eye_off($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
          }
        ],
        ["path", { "d": "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
        [
          "path",
          {
            "d": "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
          }
        ],
        ["path", { "d": "m2 2 20 20" }]
      ];
      Icon($$renderer2, spread_props([{ name: "eye-off" }, props, { iconNode }]));
    },
    Eye_off
  );
}
Eye_off.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Bell_ring[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/bell-ring.svelte";
function Bell_ring($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M10.268 21a2 2 0 0 0 3.464 0" }],
        ["path", { "d": "M22 8c0-2.3-.8-4.3-2-6" }],
        [
          "path",
          {
            "d": "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
          }
        ],
        ["path", { "d": "M4 2C2.8 3.7 2 5.7 2 8" }]
      ];
      Icon($$renderer2, spread_props([{ name: "bell-ring" }, props, { iconNode }]));
    },
    Bell_ring
  );
}
Bell_ring.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Plug[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/plug.svelte";
function Plug($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M12 22v-5" }],
        ["path", { "d": "M15 8V2" }],
        [
          "path",
          {
            "d": "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"
          }
        ],
        ["path", { "d": "M9 8V2" }]
      ];
      Icon($$renderer2, spread_props([{ name: "plug" }, props, { iconNode }]));
    },
    Plug
  );
}
Plug.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Key_round[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/key-round.svelte";
function Key_round($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"
          }
        ],
        [
          "circle",
          { "cx": "16.5", "cy": "7.5", "r": ".5", "fill": "currentColor" }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "key-round" }, props, { iconNode }]));
    },
    Key_round
  );
}
Key_round.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Radio[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/radio.svelte";
function Radio($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M16.247 7.761a6 6 0 0 1 0 8.478" }],
        ["path", { "d": "M19.075 4.933a10 10 0 0 1 0 14.134" }],
        ["path", { "d": "M4.925 19.067a10 10 0 0 1 0-14.134" }],
        ["path", { "d": "M7.753 16.239a6 6 0 0 1 0-8.478" }],
        ["circle", { "cx": "12", "cy": "12", "r": "2" }]
      ];
      Icon($$renderer2, spread_props([{ name: "radio" }, props, { iconNode }]));
    },
    Radio
  );
}
Radio.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Gauge[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/gauge.svelte";
function Gauge($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "m12 14 4-4" }],
        ["path", { "d": "M3.34 19a10 10 0 1 1 17.32 0" }]
      ];
      Icon($$renderer2, spread_props([{ name: "gauge" }, props, { iconNode }]));
    },
    Gauge
  );
}
Gauge.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Book_open[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/book-open.svelte";
function Book_open($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M12 7v14" }],
        [
          "path",
          {
            "d": "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "book-open" }, props, { iconNode }]));
    },
    Book_open
  );
}
Book_open.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Puzzle[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/puzzle.svelte";
function Puzzle($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "puzzle" }, props, { iconNode }]));
    },
    Puzzle
  );
}
Puzzle.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Settings[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/settings.svelte";
function Settings($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
          }
        ],
        ["circle", { "cx": "12", "cy": "12", "r": "3" }]
      ];
      Icon($$renderer2, spread_props([{ name: "settings" }, props, { iconNode }]));
    },
    Settings
  );
}
Settings.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Rotate_cw[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/rotate-cw.svelte";
function Rotate_cw($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          { "d": "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" }
        ],
        ["path", { "d": "M21 3v5h-5" }]
      ];
      Icon($$renderer2, spread_props([{ name: "rotate-cw" }, props, { iconNode }]));
    },
    Rotate_cw
  );
}
Rotate_cw.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Arrow_left[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/arrow-left.svelte";
function Arrow_left($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "m12 19-7-7 7-7" }],
        ["path", { "d": "M19 12H5" }]
      ];
      Icon($$renderer2, spread_props([{ name: "arrow-left" }, props, { iconNode }]));
    },
    Arrow_left
  );
}
Arrow_left.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Arrow_right[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/arrow-right.svelte";
function Arrow_right($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M5 12h14" }],
        ["path", { "d": "m12 5 7 7-7 7" }]
      ];
      Icon($$renderer2, spread_props([{ name: "arrow-right" }, props, { iconNode }]));
    },
    Arrow_right
  );
}
Arrow_right.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Clock[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/clock.svelte";
function Clock($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["circle", { "cx": "12", "cy": "12", "r": "10" }],
        ["path", { "d": "M12 6v6l4 2" }]
      ];
      Icon($$renderer2, spread_props([{ name: "clock" }, props, { iconNode }]));
    },
    Clock
  );
}
Clock.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Archive_restore[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/archive-restore.svelte";
function Archive_restore($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "rect",
          { "width": "20", "height": "5", "x": "2", "y": "3", "rx": "1" }
        ],
        ["path", { "d": "M4 8v11a2 2 0 0 0 2 2h2" }],
        ["path", { "d": "M20 8v11a2 2 0 0 1-2 2h-2" }],
        ["path", { "d": "m9 15 3-3 3 3" }],
        ["path", { "d": "M12 12v9" }]
      ];
      Icon($$renderer2, spread_props([{ name: "archive-restore" }, props, { iconNode }]));
    },
    Archive_restore
  );
}
Archive_restore.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const STORAGE_KEY$1 = "peachpi:doneAnim";
const VALID$1 = [
  "archiveSlide",
  "archiveSwipe",
  "archiveShing",
  "archiveVacuum",
  "popSpark",
  "stamp",
  "confetti",
  "twos",
  "spring"
];
function load$1() {
  if (typeof localStorage === "undefined") return "archiveSlide";
  const v = localStorage.getItem(STORAGE_KEY$1);
  return v && VALID$1.includes(v) ? v : "archiveSlide";
}
class DoneAnimStore {
  current = load$1();
  set(id2) {
    this.current = id2;
    try {
      localStorage.setItem(STORAGE_KEY$1, id2);
    } catch {
    }
  }
}
const doneAnim = new DoneAnimStore();
DoneBurst[FILENAME] = "src/desktop-renderer/app/DoneBurst.svelte";
function DoneBurst($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { ondone } = $$props;
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const DURATIONS = {
        archiveSlide: 480,
        archiveSwipe: 420,
        archiveShing: 460,
        archiveVacuum: 500,
        popSpark: 560,
        stamp: 520,
        confetti: 720,
        twos: 560,
        spring: 600
      };
      const N = 16;
      const colors = [
        "var(--color-accent)",
        "#ffffff",
        "#fbbf24",
        "#f472b6",
        "#34d399"
      ];
      let variant = derived(() => doneAnim.current);
      let duration = derived(() => reduce ? 0 : DURATIONS[variant()]);
      let bare = derived(() => variant().startsWith("archive"));
      let particles = derived(() => {
        const isConfetti = variant() === "confetti";
        return Array.from({ length: N }, (_, i) => {
          const a = i / N * Math.PI * 2 + i % 2 * 0.2;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          return {
            dx: cos * 32,
            dy: sin * 32,
            cf: cos * 26,
            spin: (i % 2 ? 1 : -1) * (360 + i * 28),
            color: colors[i % colors.length],
            size: isConfetti ? 4 + i % 2 : 3 + i % 3,
            square: isConfetti ? i % 2 === 0 : false
          };
        });
      });
      $$renderer2.push(`<div${attr_class(`burst burst--${stringify(variant())}`)}${attr_style(`--dur:${stringify(duration())}ms`)}>`);
      push_element($$renderer2, "div", 58, 0);
      if (!bare()) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<span class="ring">`);
        push_element($$renderer2, "span", 60, 2);
        $$renderer2.push(`</span>`);
        pop_element();
        $$renderer2.push(` <span class="ring ring2">`);
        push_element($$renderer2, "span", 61, 2);
        $$renderer2.push(`</span>`);
        pop_element();
        $$renderer2.push(` <!--[-->`);
        const each_array = ensure_array_like(particles());
        for (let i = 0, $$length = each_array.length; i < $$length; i++) {
          let p = each_array[i];
          $$renderer2.push(`<span${attr_class("spark", void 0, { "square": p.square })}${attr_style(`--dx:${stringify(p.dx)}px; --dy:${stringify(p.dy)}px; --cf:${stringify(p.cf)}px; --spin:${stringify(p.spin)}deg; width:${stringify(p.size)}px; height:${stringify(p.size)}px; background:${stringify(p.color)};`)}>`);
          push_element($$renderer2, "span", 63, 4);
          $$renderer2.push(`</span>`);
          pop_element();
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
      pop_element();
    },
    DoneBurst
  );
}
DoneBurst.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const STORAGE_KEY = "peachpi:testAnim";
const VALID = ["testBench"];
function load() {
  if (typeof localStorage === "undefined") return "testBench";
  const v = localStorage.getItem(STORAGE_KEY);
  return v && VALID.includes(v) ? v : "testBench";
}
class TestAnimStore {
  current = load();
  set(id2) {
    this.current = id2;
    try {
      localStorage.setItem(STORAGE_KEY, id2);
    } catch {
    }
  }
}
const testAnim = new TestAnimStore();
TestBurst[FILENAME] = "src/desktop-renderer/app/TestBurst.svelte";
function TestBurst($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { ondone } = $$props;
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const DURATIONS = { testBench: 280 };
      let variant = derived(() => testAnim.current);
      let duration = derived(() => reduce ? 0 : DURATIONS[variant()]);
      let bare = derived(() => true);
      $$renderer2.push(`<div${attr_class(`burst burst--${stringify(variant())}`)}${attr_style(`--dur:${stringify(duration())}ms`)}>`);
      push_element($$renderer2, "div", 27, 0);
      if (!bare()) {
        $$renderer2.push("<!--[0-->");
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
      pop_element();
    },
    TestBurst
  );
}
TestBurst.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Trash_2[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/trash-2.svelte";
function Trash_2($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M10 11v6" }],
        ["path", { "d": "M14 11v6" }],
        ["path", { "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
        ["path", { "d": "M3 6h18" }],
        ["path", { "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }]
      ];
      Icon($$renderer2, spread_props([{ name: "trash-2" }, props, { iconNode }]));
    },
    Trash_2
  );
}
Trash_2.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Plus[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/plus.svelte";
function Plus($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [["path", { "d": "M5 12h14" }], ["path", { "d": "M12 5v14" }]];
      Icon($$renderer2, spread_props([{ name: "plus" }, props, { iconNode }]));
    },
    Plus
  );
}
Plus.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Git_branch[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/git-branch.svelte";
function Git_branch($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M15 6a9 9 0 0 0-9 9V3" }],
        ["circle", { "cx": "18", "cy": "6", "r": "3" }],
        ["circle", { "cx": "6", "cy": "18", "r": "3" }]
      ];
      Icon($$renderer2, spread_props([{ name: "git-branch" }, props, { iconNode }]));
    },
    Git_branch
  );
}
Git_branch.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Folder[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/folder.svelte";
function Folder($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "folder" }, props, { iconNode }]));
    },
    Folder
  );
}
Folder.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Message_square[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/message-square.svelte";
function Message_square($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "message-square" }, props, { iconNode }]));
    },
    Message_square
  );
}
Message_square.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Archive[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/archive.svelte";
function Archive($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "rect",
          { "width": "20", "height": "5", "x": "2", "y": "3", "rx": "1" }
        ],
        ["path", { "d": "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" }],
        ["path", { "d": "M10 12h4" }]
      ];
      Icon($$renderer2, spread_props([{ name: "archive" }, props, { iconNode }]));
    },
    Archive
  );
}
Archive.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Git_branch_plus[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/git-branch-plus.svelte";
function Git_branch_plus($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M6 3v12" }],
        ["path", { "d": "M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" }],
        ["path", { "d": "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" }],
        ["path", { "d": "M15 6a9 9 0 0 0-9 9" }],
        ["path", { "d": "M18 15v6" }],
        ["path", { "d": "M21 18h-6" }]
      ];
      Icon($$renderer2, spread_props([{ name: "git-branch-plus" }, props, { iconNode }]));
    },
    Git_branch_plus
  );
}
Git_branch_plus.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
List_checks[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/list-checks.svelte";
function List_checks($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M13 5h8" }],
        ["path", { "d": "M13 12h8" }],
        ["path", { "d": "M13 19h8" }],
        ["path", { "d": "m3 17 2 2 4-4" }],
        ["path", { "d": "m3 7 2 2 4-4" }]
      ];
      Icon($$renderer2, spread_props([{ name: "list-checks" }, props, { iconNode }]));
    },
    List_checks
  );
}
List_checks.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Chevron_right[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/chevron-right.svelte";
function Chevron_right($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [["path", { "d": "m9 18 6-6-6-6" }]];
      Icon($$renderer2, spread_props([{ name: "chevron-right" }, props, { iconNode }]));
    },
    Chevron_right
  );
}
Chevron_right.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Chevron_down[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/chevron-down.svelte";
function Chevron_down($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [["path", { "d": "m6 9 6 6 6-6" }]];
      Icon($$renderer2, spread_props([{ name: "chevron-down" }, props, { iconNode }]));
    },
    Chevron_down
  );
}
Chevron_down.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
function isFunction$1(value) {
  return typeof value === "function";
}
function isObject(value) {
  return value !== null && typeof value === "object";
}
const CLASS_VALUE_PRIMITIVE_TYPES = ["string", "number", "bigint", "boolean"];
function isClassValue(value) {
  if (value === null || value === void 0)
    return true;
  if (CLASS_VALUE_PRIMITIVE_TYPES.includes(typeof value))
    return true;
  if (Array.isArray(value))
    return value.every((item) => isClassValue(item));
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype)
      return false;
    return true;
  }
  return false;
}
const BoxSymbol = Symbol("box");
const isWritableSymbol = Symbol("is-writable");
function boxWith(getter, setter) {
  const derived$1 = derived(getter);
  if (setter) {
    return {
      [BoxSymbol]: true,
      [isWritableSymbol]: true,
      get current() {
        return derived$1();
      },
      set current(v) {
        setter(v);
      }
    };
  }
  return {
    [BoxSymbol]: true,
    get current() {
      return getter();
    }
  };
}
function isBox(value) {
  return isObject(value) && BoxSymbol in value;
}
function boxFrom(value) {
  if (isBox(value)) return value;
  if (isFunction$1(value)) return boxWith(value);
  return simpleBox(value);
}
function simpleBox(initialValue) {
  let current = initialValue;
  return {
    [BoxSymbol]: true,
    [isWritableSymbol]: true,
    get current() {
      return current;
    },
    set current(v) {
      current = v;
    }
  };
}
function composeHandlers(...handlers) {
  return function(e) {
    for (const handler of handlers) {
      if (!handler)
        continue;
      if (e.defaultPrevented)
        return;
      if (typeof handler === "function") {
        handler.call(this, e);
      } else {
        handler.current?.call(this, e);
      }
    }
  };
}
const NUMBER_CHAR_RE = /\d/;
const STR_SPLITTERS = ["-", "_", "/", "."];
function isUppercase(char = "") {
  if (NUMBER_CHAR_RE.test(char))
    return void 0;
  return char !== char.toLowerCase();
}
function splitByCase(str) {
  const parts = [];
  let buff = "";
  let previousUpper;
  let previousSplitter;
  for (const char of str) {
    const isSplitter = STR_SPLITTERS.includes(char);
    if (isSplitter === true) {
      parts.push(buff);
      buff = "";
      previousUpper = void 0;
      continue;
    }
    const isUpper = isUppercase(char);
    if (previousSplitter === false) {
      if (previousUpper === false && isUpper === true) {
        parts.push(buff);
        buff = char;
        previousUpper = isUpper;
        continue;
      }
      if (previousUpper === true && isUpper === false && buff.length > 1) {
        const lastChar = buff.at(-1);
        parts.push(buff.slice(0, Math.max(0, buff.length - 1)));
        buff = lastChar + char;
        previousUpper = isUpper;
        continue;
      }
    }
    buff += char;
    previousUpper = isUpper;
    previousSplitter = isSplitter;
  }
  parts.push(buff);
  return parts;
}
function pascalCase(str) {
  if (!str)
    return "";
  return splitByCase(str).map((p) => upperFirst(p)).join("");
}
function camelCase(str) {
  return lowerFirst(pascalCase(str || ""));
}
function upperFirst(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : "";
}
function lowerFirst(str) {
  return str ? str[0].toLowerCase() + str.slice(1) : "";
}
function cssToStyleObj(css2) {
  if (!css2)
    return {};
  const styleObj = {};
  function iterator(name, value) {
    if (name.startsWith("-moz-") || name.startsWith("-webkit-") || name.startsWith("-ms-") || name.startsWith("-o-")) {
      styleObj[pascalCase(name)] = value;
      return;
    }
    if (name.startsWith("--")) {
      styleObj[name] = value;
      return;
    }
    styleObj[camelCase(name)] = value;
  }
  parse(css2, iterator);
  return styleObj;
}
function executeCallbacks(...callbacks) {
  return (...args) => {
    for (const callback of callbacks) {
      if (typeof callback === "function") {
        callback(...args);
      }
    }
  };
}
function createParser(matcher, replacer) {
  const regex = RegExp(matcher, "g");
  return (str) => {
    if (typeof str !== "string") {
      throw new TypeError(`expected an argument of type string, but got ${typeof str}`);
    }
    if (!str.match(regex))
      return str;
    return str.replace(regex, replacer);
  };
}
const camelToKebab$1 = createParser(/[A-Z]/, (match) => `-${match.toLowerCase()}`);
function styleToCSS(styleObj) {
  if (!styleObj || typeof styleObj !== "object" || Array.isArray(styleObj)) {
    throw new TypeError(`expected an argument of type object, but got ${typeof styleObj}`);
  }
  return Object.keys(styleObj).map((property) => `${camelToKebab$1(property)}: ${styleObj[property]};`).join("\n");
}
function styleToString(style2 = {}) {
  return styleToCSS(style2).replace("\n", " ");
}
const EVENT_LIST = [
  "onabort",
  "onanimationcancel",
  "onanimationend",
  "onanimationiteration",
  "onanimationstart",
  "onauxclick",
  "onbeforeinput",
  "onbeforetoggle",
  "onblur",
  "oncancel",
  "oncanplay",
  "oncanplaythrough",
  "onchange",
  "onclick",
  "onclose",
  "oncompositionend",
  "oncompositionstart",
  "oncompositionupdate",
  "oncontextlost",
  "oncontextmenu",
  "oncontextrestored",
  "oncopy",
  "oncuechange",
  "oncut",
  "ondblclick",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "ondurationchange",
  "onemptied",
  "onended",
  "onerror",
  "onfocus",
  "onfocusin",
  "onfocusout",
  "onformdata",
  "ongotpointercapture",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "onlostpointercapture",
  "onmousedown",
  "onmouseenter",
  "onmouseleave",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onpaste",
  "onpause",
  "onplay",
  "onplaying",
  "onpointercancel",
  "onpointerdown",
  "onpointerenter",
  "onpointerleave",
  "onpointermove",
  "onpointerout",
  "onpointerover",
  "onpointerup",
  "onprogress",
  "onratechange",
  "onreset",
  "onresize",
  "onscroll",
  "onscrollend",
  "onsecuritypolicyviolation",
  "onseeked",
  "onseeking",
  "onselect",
  "onselectionchange",
  "onselectstart",
  "onslotchange",
  "onstalled",
  "onsubmit",
  "onsuspend",
  "ontimeupdate",
  "ontoggle",
  "ontouchcancel",
  "ontouchend",
  "ontouchmove",
  "ontouchstart",
  "ontransitioncancel",
  "ontransitionend",
  "ontransitionrun",
  "ontransitionstart",
  "onvolumechange",
  "onwaiting",
  "onwebkitanimationend",
  "onwebkitanimationiteration",
  "onwebkitanimationstart",
  "onwebkittransitionend",
  "onwheel"
];
const EVENT_LIST_SET = new Set(EVENT_LIST);
function isEventHandler(key) {
  return EVENT_LIST_SET.has(key);
}
function mergeProps(...args) {
  const result = { ...args[0] };
  for (let i = 1; i < args.length; i++) {
    const props = args[i];
    if (!props)
      continue;
    for (const key of Object.keys(props)) {
      const a = result[key];
      const b = props[key];
      const aIsFunction = typeof a === "function";
      const bIsFunction = typeof b === "function";
      if (aIsFunction && typeof bIsFunction && isEventHandler(key)) {
        const aHandler = a;
        const bHandler = b;
        result[key] = composeHandlers(aHandler, bHandler);
      } else if (aIsFunction && bIsFunction) {
        result[key] = executeCallbacks(a, b);
      } else if (key === "class") {
        const aIsClassValue = isClassValue(a);
        const bIsClassValue = isClassValue(b);
        if (aIsClassValue && bIsClassValue) {
          result[key] = clsx$1(a, b);
        } else if (aIsClassValue) {
          result[key] = clsx$1(a);
        } else if (bIsClassValue) {
          result[key] = clsx$1(b);
        }
      } else if (key === "style") {
        const aIsObject = typeof a === "object";
        const bIsObject = typeof b === "object";
        const aIsString = typeof a === "string";
        const bIsString = typeof b === "string";
        if (aIsObject && bIsObject) {
          result[key] = { ...a, ...b };
        } else if (aIsObject && bIsString) {
          const parsedStyle = cssToStyleObj(b);
          result[key] = { ...a, ...parsedStyle };
        } else if (aIsString && bIsObject) {
          const parsedStyle = cssToStyleObj(a);
          result[key] = { ...parsedStyle, ...b };
        } else if (aIsString && bIsString) {
          const parsedStyleA = cssToStyleObj(a);
          const parsedStyleB = cssToStyleObj(b);
          result[key] = { ...parsedStyleA, ...parsedStyleB };
        } else if (aIsObject) {
          result[key] = a;
        } else if (bIsObject) {
          result[key] = b;
        } else if (aIsString) {
          result[key] = a;
        } else if (bIsString) {
          result[key] = b;
        }
      } else {
        result[key] = b !== void 0 ? b : a;
      }
    }
    for (const key of Object.getOwnPropertySymbols(props)) {
      const a = result[key];
      const b = props[key];
      result[key] = b !== void 0 ? b : a;
    }
  }
  if (typeof result.style === "object") {
    result.style = styleToString(result.style).replaceAll("\n", " ");
  }
  if (result.hidden === false) {
    result.hidden = void 0;
    delete result.hidden;
  }
  if (result.disabled === false) {
    result.disabled = void 0;
    delete result.disabled;
  }
  return result;
}
const defaultWindow = void 0;
function getActiveElement$1(document2) {
  let activeElement = document2.activeElement;
  while (activeElement?.shadowRoot) {
    const node = activeElement.shadowRoot.activeElement;
    if (node === activeElement)
      break;
    else
      activeElement = node;
  }
  return activeElement;
}
class ActiveElement {
  #document;
  #subscribe;
  constructor(options = {}) {
    const { window: window2 = defaultWindow, document: document2 = window2?.document } = options;
    if (window2 === void 0) return;
    this.#document = document2;
    this.#subscribe = createSubscriber();
  }
  get current() {
    this.#subscribe?.();
    if (!this.#document) return null;
    return getActiveElement$1(this.#document);
  }
}
new ActiveElement();
function isFunction(value) {
  return typeof value === "function";
}
let Context$1 = class Context {
  #name;
  #key;
  /**
   * @param name The name of the context.
   * This is used for generating the context key and error messages.
   */
  constructor(name) {
    this.#name = name;
    this.#key = Symbol(name);
  }
  /**
   * The key used to get and set the context.
   *
   * It is not recommended to use this value directly.
   * Instead, use the methods provided by this class.
   */
  get key() {
    return this.#key;
  }
  /**
   * Checks whether this has been set in the context of a parent component.
   *
   * Must be called during component initialisation.
   */
  exists() {
    return hasContext(this.#key);
  }
  /**
   * Retrieves the context that belongs to the closest parent component.
   *
   * Must be called during component initialisation.
   *
   * @throws An error if the context does not exist.
   */
  get() {
    const context2 = getContext$1(this.#key);
    if (context2 === void 0) {
      throw new Error(`Context "${this.#name}" not found`);
    }
    return context2;
  }
  /**
   * Retrieves the context that belongs to the closest parent component,
   * or the given fallback value if the context does not exist.
   *
   * Must be called during component initialisation.
   */
  getOr(fallback) {
    const context2 = getContext$1(this.#key);
    if (context2 === void 0) {
      return fallback;
    }
    return context2;
  }
  /**
   * Associates the given value with the current component and returns it.
   *
   * Must be called during component initialisation.
   */
  set(context2) {
    return setContext(this.#key, context2);
  }
};
function runWatcher$1(sources, flush, effect, options = {}) {
  const { lazy = false } = options;
}
function watch$1(sources, effect, options) {
  runWatcher$1(sources, "post", effect, options);
}
function watchPre$1(sources, effect, options) {
  runWatcher$1(sources, "pre", effect, options);
}
watch$1.pre = watchPre$1;
function get$1(value) {
  if (isFunction(value)) {
    return value();
  }
  return value;
}
class ElementSize {
  // no need to use `$state` here since we are using createSubscriber
  #size = { width: 0, height: 0 };
  #observed = false;
  #options;
  #node;
  #window;
  // we use a derived here to extract the width so that if the width doesn't change we don't get a state update
  // which we would get if we would just use a getter since the version of the subscriber will be changing
  #width = derived(() => {
    this.#subscribe()?.();
    return this.getSize().width;
  });
  // we use a derived here to extract the height so that if the height doesn't change we don't get a state update
  // which we would get if we would just use a getter since the version of the subscriber will be changing
  #height = derived(() => {
    this.#subscribe()?.();
    return this.getSize().height;
  });
  // we need to use a derived here because the class will be created before the node is bound to the ref
  #subscribe = derived(() => {
    const node$ = get$1(this.#node);
    if (!node$) return;
    return createSubscriber();
  });
  constructor(node, options = { box: "border-box" }) {
    this.#window = options.window ?? defaultWindow;
    this.#options = options;
    this.#node = node;
    this.#size = { width: 0, height: 0 };
  }
  calculateSize() {
    const element2 = get$1(this.#node);
    if (!element2 || !this.#window) {
      return;
    }
    const offsetWidth = element2.offsetWidth;
    const offsetHeight = element2.offsetHeight;
    if (this.#options.box === "border-box") {
      return { width: offsetWidth, height: offsetHeight };
    }
    const style2 = this.#window.getComputedStyle(element2);
    const paddingWidth = parseFloat(style2.paddingLeft) + parseFloat(style2.paddingRight);
    const paddingHeight = parseFloat(style2.paddingTop) + parseFloat(style2.paddingBottom);
    const borderWidth = parseFloat(style2.borderLeftWidth) + parseFloat(style2.borderRightWidth);
    const borderHeight = parseFloat(style2.borderTopWidth) + parseFloat(style2.borderBottomWidth);
    const contentWidth = offsetWidth - paddingWidth - borderWidth;
    const contentHeight = offsetHeight - paddingHeight - borderHeight;
    return { width: contentWidth, height: contentHeight };
  }
  getSize() {
    return this.#observed ? this.#size : this.calculateSize() ?? this.#size;
  }
  get current() {
    this.#subscribe()?.();
    return this.getSize();
  }
  get width() {
    return this.#width();
  }
  get height() {
    return this.#height();
  }
}
function afterSleep(ms, cb) {
  return setTimeout(cb, ms);
}
function afterTick(fn) {
  tick().then(fn);
}
const ELEMENT_NODE = 1;
const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;
function isHTMLElement$2(node) {
  return isObject(node) && node.nodeType === ELEMENT_NODE && typeof node.nodeName === "string";
}
function isDocument(node) {
  return isObject(node) && node.nodeType === DOCUMENT_NODE;
}
function isWindow(node) {
  return isObject(node) && node.constructor?.name === "VisualViewport";
}
function isNode(node) {
  return isObject(node) && node.nodeType !== void 0;
}
function isShadowRoot(node) {
  return isNode(node) && node.nodeType === DOCUMENT_FRAGMENT_NODE && "host" in node;
}
function contains(parent, child) {
  if (!parent || !child)
    return false;
  if (!isHTMLElement$2(parent) || !isHTMLElement$2(child))
    return false;
  const rootNode = child.getRootNode?.();
  if (parent === child)
    return true;
  if (parent.contains(child))
    return true;
  if (rootNode && isShadowRoot(rootNode)) {
    let next = child;
    while (next) {
      if (parent === next)
        return true;
      next = next.parentNode || next.host;
    }
  }
  return false;
}
function getDocument(node) {
  if (isDocument(node))
    return node;
  if (isWindow(node))
    return node.document;
  return node?.ownerDocument ?? document;
}
function getWindow(node) {
  if (isShadowRoot(node))
    return getWindow(node.host);
  if (isDocument(node))
    return node.defaultView ?? window;
  if (isHTMLElement$2(node))
    return node.ownerDocument?.defaultView ?? window;
  return window;
}
function getActiveElement(rootNode) {
  let activeElement = rootNode.activeElement;
  while (activeElement?.shadowRoot) {
    const el = activeElement.shadowRoot.activeElement;
    if (el === activeElement)
      break;
    else
      activeElement = el;
  }
  return activeElement;
}
class DOMContext {
  element;
  #root = derived(() => {
    if (!this.element.current) return document;
    const rootNode = this.element.current.getRootNode() ?? document;
    return rootNode;
  });
  get root() {
    return this.#root();
  }
  set root($$value) {
    return this.#root($$value);
  }
  constructor(element2) {
    if (typeof element2 === "function") {
      this.element = boxWith(element2);
    } else {
      this.element = element2;
    }
  }
  getDocument = () => {
    return getDocument(this.root);
  };
  getWindow = () => {
    return this.getDocument().defaultView ?? window;
  };
  getActiveElement = () => {
    return getActiveElement(this.root);
  };
  isActiveElement = (node) => {
    return node === this.getActiveElement();
  };
  getElementById(id2) {
    return this.root.getElementById(id2);
  }
  querySelector = (selector) => {
    if (!this.root) return null;
    return this.root.querySelector(selector);
  };
  querySelectorAll = (selector) => {
    if (!this.root) return [];
    return this.root.querySelectorAll(selector);
  };
  setTimeout = (callback, delay2) => {
    return this.getWindow().setTimeout(callback, delay2);
  };
  clearTimeout = (timeoutId) => {
    return this.getWindow().clearTimeout(timeoutId);
  };
}
const now = () => Date.now();
const raf = {
  // don't access requestAnimationFrame eagerly outside method
  // this allows basic testing of user code without JSDOM
  // bunder will eval and remove ternary when the user's app is built
  tick: (
    /** @param {any} _ */
    (_) => noop$1()
  ),
  now: () => now(),
  tasks: /* @__PURE__ */ new Set()
};
function loop(callback) {
  let task;
  if (raf.tasks.size === 0) ;
  return {
    promise: new Promise((fulfill) => {
      raf.tasks.add(task = { c: callback, f: fulfill });
    }),
    abort() {
      raf.tasks.delete(task);
    }
  };
}
{
  let throw_rune_error = function(rune) {
    if (!(rune in globalThis)) {
      let value;
      Object.defineProperty(globalThis, rune, {
        configurable: true,
        // eslint-disable-next-line getter-return
        get: () => {
          if (value !== void 0) {
            return value;
          }
          rune_outside_svelte(rune);
        },
        set: (v) => {
          value = v;
        }
      });
    }
  };
  throw_rune_error("$state");
  throw_rune_error("$effect");
  throw_rune_error("$derived");
  throw_rune_error("$inspect");
  throw_rune_error("$props");
  throw_rune_error("$bindable");
}
function createAttachmentKey() {
  return Symbol(ATTACHMENT_KEY);
}
function attachRef(ref, onChange) {
  return {
    [createAttachmentKey()]: (node) => {
      if (isBox(ref)) {
        ref.current = node;
        run(() => onChange?.(node));
        return () => {
          if ("isConnected" in node && node.isConnected)
            return;
          ref.current = null;
          onChange?.(null);
        };
      }
      ref(node);
      run(() => onChange?.(node));
      return () => {
        if ("isConnected" in node && node.isConnected)
          return;
        ref(null);
        onChange?.(null);
      };
    }
  };
}
function boolToStr(condition) {
  return condition ? "true" : "false";
}
function boolToEmptyStrOrUndef(condition) {
  return condition ? "" : void 0;
}
function getDataOpenClosed(condition) {
  return condition ? "open" : "closed";
}
function getDataTransitionAttrs(state) {
  if (state === "starting")
    return { "data-starting-style": "" };
  if (state === "ending")
    return { "data-ending-style": "" };
  return {};
}
class BitsAttrs {
  #variant;
  #prefix;
  attrs;
  constructor(config) {
    this.#variant = config.getVariant ? config.getVariant() : null;
    this.#prefix = this.#variant ? `data-${this.#variant}-` : `data-${config.component}-`;
    this.getAttr = this.getAttr.bind(this);
    this.selector = this.selector.bind(this);
    this.attrs = Object.fromEntries(config.parts.map((part) => [part, this.getAttr(part)]));
  }
  getAttr(part, variantOverride) {
    if (variantOverride)
      return `data-${variantOverride}-${part}`;
    return `${this.#prefix}${part}`;
  }
  selector(part, variantOverride) {
    return `[${this.getAttr(part, variantOverride)}]`;
  }
}
function createBitsAttrs(config) {
  const bitsAttrs = new BitsAttrs(config);
  return {
    ...bitsAttrs.attrs,
    selector: bitsAttrs.selector,
    getAttr: bitsAttrs.getAttr
  };
}
const ENTER = "Enter";
const ESCAPE = "Escape";
const SPACE = " ";
const isBrowser$1 = typeof document !== "undefined";
const isIOS = getIsIOS();
function getIsIOS() {
  return isBrowser$1 && window?.navigator?.userAgent && (/iP(ad|hone|od)/.test(window.navigator.userAgent) || // The new iPad Pro Gen3 does not identify itself as iPad, but as Macintosh.
  window?.navigator?.maxTouchPoints > 2 && /iPad|Macintosh/.test(window?.navigator.userAgent));
}
function isHTMLElement$1(element2) {
  return element2 instanceof HTMLElement;
}
function isElement(element2) {
  return element2 instanceof Element;
}
function isElementOrSVGElement(element2) {
  return element2 instanceof Element || element2 instanceof SVGElement;
}
function isTouch(e) {
  return e.pointerType === "touch";
}
function isNotNull$1(value) {
  return value !== null;
}
class AnimationsComplete {
  #opts;
  #currentFrame = null;
  #observer = null;
  #runId = 0;
  constructor(opts) {
    this.#opts = opts;
  }
  #cleanup() {
    if (this.#currentFrame !== null) {
      window.cancelAnimationFrame(this.#currentFrame);
      this.#currentFrame = null;
    }
    this.#observer?.disconnect();
    this.#observer = null;
    this.#runId++;
  }
  run(fn) {
    this.#cleanup();
    const node = this.#opts.ref.current;
    if (!node)
      return;
    if (typeof node.getAnimations !== "function") {
      this.#executeCallback(fn);
      return;
    }
    const runId = this.#runId;
    const executeIfCurrent = () => {
      if (runId !== this.#runId)
        return;
      this.#executeCallback(fn);
    };
    const waitForAnimations = () => {
      if (runId !== this.#runId)
        return;
      const animations = node.getAnimations();
      if (animations.length === 0) {
        executeIfCurrent();
        return;
      }
      Promise.all(animations.map((animation) => animation.finished)).then(() => {
        executeIfCurrent();
      }).catch(() => {
        if (runId !== this.#runId)
          return;
        const currentAnimations = node.getAnimations();
        const hasRunningAnimations = currentAnimations.some((animation) => animation.pending || animation.playState !== "finished");
        if (hasRunningAnimations) {
          waitForAnimations();
          return;
        }
        executeIfCurrent();
      });
    };
    const requestWaitForAnimations = () => {
      this.#currentFrame = window.requestAnimationFrame(() => {
        this.#currentFrame = null;
        waitForAnimations();
      });
    };
    if (!this.#opts.afterTick.current) {
      requestWaitForAnimations();
      return;
    }
    this.#currentFrame = window.requestAnimationFrame(() => {
      this.#currentFrame = null;
      const startingStyleAttr = "data-starting-style";
      if (!node.hasAttribute(startingStyleAttr)) {
        requestWaitForAnimations();
        return;
      }
      this.#observer = new MutationObserver(() => {
        if (runId !== this.#runId)
          return;
        if (node.hasAttribute(startingStyleAttr))
          return;
        this.#observer?.disconnect();
        this.#observer = null;
        requestWaitForAnimations();
      });
      this.#observer.observe(node, {
        attributes: true,
        attributeFilter: [startingStyleAttr]
      });
    });
  }
  #executeCallback(fn) {
    const execute = () => {
      fn();
    };
    if (this.#opts.afterTick) {
      afterTick(execute);
    } else {
      execute();
    }
  }
}
class PresenceManager {
  #opts;
  #enabled;
  #afterAnimations;
  #shouldRender = false;
  #transitionStatus = void 0;
  #hasMounted = false;
  #transitionFrame = null;
  constructor(opts) {
    this.#opts = opts;
    this.#shouldRender = opts.open.current;
    this.#enabled = opts.enabled ?? true;
    this.#afterAnimations = new AnimationsComplete({ ref: this.#opts.ref, afterTick: this.#opts.open });
    watch$1(() => this.#opts.open.current, (isOpen) => {
      if (!this.#hasMounted) {
        this.#hasMounted = true;
        return;
      }
      this.#clearTransitionFrame();
      if (!isOpen && this.#opts.shouldSkipExitAnimation?.()) {
        this.#shouldRender = false;
        this.#transitionStatus = void 0;
        this.#opts.onComplete?.();
        return;
      }
      if (isOpen) this.#shouldRender = true;
      this.#transitionStatus = isOpen ? "starting" : "ending";
      if (isOpen) {
        this.#transitionFrame = window.requestAnimationFrame(() => {
          this.#transitionFrame = null;
          if (this.#opts.open.current) {
            this.#transitionStatus = void 0;
          }
        });
      }
      if (!this.#enabled) {
        if (!isOpen) {
          this.#shouldRender = false;
        }
        this.#transitionStatus = void 0;
        this.#opts.onComplete?.();
        return;
      }
      this.#afterAnimations.run(() => {
        if (isOpen === this.#opts.open.current) {
          if (!this.#opts.open.current) {
            this.#shouldRender = false;
          }
          this.#transitionStatus = void 0;
          this.#opts.onComplete?.();
        }
      });
    });
  }
  get shouldRender() {
    return this.#shouldRender;
  }
  get transitionStatus() {
    return this.#transitionStatus;
  }
  #clearTransitionFrame() {
    if (this.#transitionFrame === null) return;
    window.cancelAnimationFrame(this.#transitionFrame);
    this.#transitionFrame = null;
  }
}
function noop() {
}
function createId(prefixOrUid, uid) {
  return `bits-${prefixOrUid}`;
}
const dialogAttrs = createBitsAttrs({
  component: "dialog",
  parts: [
    "content",
    "trigger",
    "overlay",
    "title",
    "description",
    "close",
    "cancel",
    "action"
  ]
});
const DialogRootContext = new Context$1("Dialog.Root | AlertDialog.Root");
class DialogRootState {
  static create(opts) {
    const parent = DialogRootContext.getOr(null);
    return DialogRootContext.set(new DialogRootState(opts, parent));
  }
  opts;
  triggerNode = null;
  contentNode = null;
  overlayNode = null;
  descriptionNode = null;
  contentId = void 0;
  titleId = void 0;
  triggerId = void 0;
  descriptionId = void 0;
  cancelNode = null;
  nestedOpenCount = 0;
  depth;
  parent;
  contentPresence;
  overlayPresence;
  constructor(opts, parent) {
    this.opts = opts;
    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.handleOpen = this.handleOpen.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.contentPresence = new PresenceManager({
      ref: boxWith(() => this.contentNode),
      open: this.opts.open,
      enabled: true,
      onComplete: () => {
        this.opts.onOpenChangeComplete.current(this.opts.open.current);
      }
    });
    this.overlayPresence = new PresenceManager({
      ref: boxWith(() => this.overlayNode),
      open: this.opts.open,
      enabled: true
    });
    watch$1(
      () => this.opts.open.current,
      (isOpen) => {
        if (!this.parent) return;
        if (isOpen) {
          this.parent.incrementNested();
        } else {
          this.parent.decrementNested();
        }
      },
      { lazy: true }
    );
  }
  handleOpen() {
    if (this.opts.open.current) return;
    this.opts.open.current = true;
  }
  handleClose() {
    if (!this.opts.open.current) return;
    this.opts.open.current = false;
  }
  getBitsAttr = (part) => {
    return dialogAttrs.getAttr(part, this.opts.variant.current);
  };
  incrementNested() {
    this.nestedOpenCount++;
    this.parent?.incrementNested();
  }
  decrementNested() {
    if (this.nestedOpenCount === 0) return;
    this.nestedOpenCount--;
    this.parent?.decrementNested();
  }
  #sharedProps = derived(() => ({ "data-state": getDataOpenClosed(this.opts.open.current) }));
  get sharedProps() {
    return this.#sharedProps();
  }
  set sharedProps($$value) {
    return this.#sharedProps($$value);
  }
}
class DialogActionState {
  static create(opts) {
    return new DialogActionState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [this.root.getBitsAttr("action")]: "",
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class DialogTitleState {
  static create(opts) {
    return new DialogTitleState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.root.titleId = this.opts.id.current;
    this.attachment = attachRef(this.opts.ref);
    watch$1.pre(() => this.opts.id.current, (id2) => {
      this.root.titleId = id2;
    });
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    role: "heading",
    "aria-level": this.opts.level.current,
    [this.root.getBitsAttr("title")]: "",
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class DialogDescriptionState {
  static create(opts) {
    return new DialogDescriptionState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.root.descriptionId = this.opts.id.current;
    this.attachment = attachRef(this.opts.ref, (v) => {
      this.root.descriptionNode = v;
    });
    watch$1.pre(() => this.opts.id.current, (id2) => {
      this.root.descriptionId = id2;
    });
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [this.root.getBitsAttr("description")]: "",
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class DialogContentState {
  static create(opts) {
    return new DialogContentState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => {
      this.root.contentNode = v;
      this.root.contentId = v?.id;
    });
  }
  #snippetProps = derived(() => ({ open: this.root.opts.open.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    role: this.root.opts.variant.current === "alert-dialog" ? "alertdialog" : "dialog",
    "aria-modal": "true",
    "aria-describedby": this.root.descriptionId,
    "aria-labelledby": this.root.titleId,
    [this.root.getBitsAttr("content")]: "",
    style: {
      pointerEvents: "auto",
      outline: this.root.opts.variant.current === "alert-dialog" ? "none" : void 0,
      "--bits-dialog-depth": this.root.depth,
      "--bits-dialog-nested-count": this.root.nestedOpenCount,
      contain: "layout style"
    },
    tabindex: this.root.opts.variant.current === "alert-dialog" ? -1 : void 0,
    "data-nested-open": boolToEmptyStrOrUndef(this.root.nestedOpenCount > 0),
    "data-nested": boolToEmptyStrOrUndef(this.root.parent !== null),
    ...getDataTransitionAttrs(this.root.contentPresence.transitionStatus),
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  get shouldRender() {
    return this.root.contentPresence.shouldRender;
  }
}
class DialogOverlayState {
  static create(opts) {
    return new DialogOverlayState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => this.root.overlayNode = v);
  }
  #snippetProps = derived(() => ({ open: this.root.opts.open.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [this.root.getBitsAttr("overlay")]: "",
    style: {
      pointerEvents: "auto",
      "--bits-dialog-depth": this.root.depth,
      "--bits-dialog-nested-count": this.root.nestedOpenCount
    },
    "data-nested-open": boolToEmptyStrOrUndef(this.root.nestedOpenCount > 0),
    "data-nested": boolToEmptyStrOrUndef(this.root.parent !== null),
    ...getDataTransitionAttrs(this.root.overlayPresence.transitionStatus),
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  get shouldRender() {
    return this.root.overlayPresence.shouldRender;
  }
}
class AlertDialogCancelState {
  static create(opts) {
    return new AlertDialogCancelState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => this.root.cancelNode = v);
    this.onclick = this.onclick.bind(this);
    this.onkeydown = this.onkeydown.bind(this);
  }
  onclick(e) {
    if (this.opts.disabled.current) return;
    if (e.button > 0) return;
    this.root.handleClose();
  }
  onkeydown(e) {
    if (this.opts.disabled.current) return;
    if (e.key === SPACE || e.key === ENTER) {
      e.preventDefault();
      this.root.handleClose();
    }
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [this.root.getBitsAttr("cancel")]: "",
    onclick: this.onclick,
    onkeydown: this.onkeydown,
    tabindex: 0,
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
Alert_dialog[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/alert-dialog/components/alert-dialog.svelte";
function Alert_dialog($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        open = false,
        onOpenChange = noop,
        onOpenChangeComplete = noop,
        children
      } = $$props;
      DialogRootState.create({
        variant: boxWith(() => "alert-dialog"),
        open: boxWith(() => open, (v) => {
          open = v;
          onOpenChange(v);
        }),
        onOpenChangeComplete: boxWith(() => onOpenChangeComplete)
      });
      children?.($$renderer2);
      $$renderer2.push(`<!---->`);
      bind_props($$props, { open });
    },
    Alert_dialog
  );
}
Alert_dialog.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Dialog_title[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/dialog/components/dialog-title.svelte";
function Dialog_title($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const uid = props_id($$renderer2);
      let {
        id: id2 = createId(uid),
        ref = null,
        child,
        children,
        level = 2,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const titleState = DialogTitleState.create({
        id: boxWith(() => id2),
        level: boxWith(() => level),
        ref: boxWith(() => ref, (v) => ref = v)
      });
      const mergedProps = derived(() => mergeProps(restProps, titleState.props));
      if (child) {
        $$renderer2.push("<!--[0-->");
        child($$renderer2, { props: mergedProps() });
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
        push_element($$renderer2, "div", 33, 1);
        children?.($$renderer2);
        $$renderer2.push(`<!----></div>`);
        pop_element();
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Dialog_title
  );
}
Dialog_title.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Alert_dialog_action[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/alert-dialog/components/alert-dialog-action.svelte";
function Alert_dialog_action($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const uid = props_id($$renderer2);
      let {
        children,
        child,
        id: id2 = createId(uid),
        ref = null,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const actionState = DialogActionState.create({
        id: boxWith(() => id2),
        ref: boxWith(() => ref, (v) => ref = v)
      });
      const mergedProps = derived(() => mergeProps(restProps, actionState.props));
      if (child) {
        $$renderer2.push("<!--[0-->");
        child($$renderer2, { props: mergedProps() });
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<button${attributes({ ...mergedProps() })}>`);
        push_element($$renderer2, "button", 31, 1);
        children?.($$renderer2);
        $$renderer2.push(`<!----></button>`);
        pop_element();
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Alert_dialog_action
  );
}
Alert_dialog_action.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Alert_dialog_cancel[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/alert-dialog/components/alert-dialog-cancel.svelte";
function Alert_dialog_cancel($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const uid = props_id($$renderer2);
      let {
        id: id2 = createId(uid),
        ref = null,
        children,
        child,
        disabled = false,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const cancelState = AlertDialogCancelState.create({
        id: boxWith(() => id2),
        ref: boxWith(() => ref, (v) => ref = v),
        disabled: boxWith(() => Boolean(disabled))
      });
      const mergedProps = derived(() => mergeProps(restProps, cancelState.props));
      if (child) {
        $$renderer2.push("<!--[0-->");
        child($$renderer2, { props: mergedProps() });
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<button${attributes({ ...mergedProps() })}>`);
        push_element($$renderer2, "button", 33, 1);
        children?.($$renderer2);
        $$renderer2.push(`<!----></button>`);
        pop_element();
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Alert_dialog_cancel
  );
}
Alert_dialog_cancel.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const BitsConfigContext = new Context$1("BitsConfig");
function getBitsConfig() {
  const fallback = new BitsConfigState(null, {});
  return BitsConfigContext.getOr(fallback).opts;
}
class BitsConfigState {
  opts;
  constructor(parent, opts) {
    const resolveConfigOption = createConfigResolver(parent, opts);
    this.opts = {
      defaultPortalTo: resolveConfigOption((config) => config.defaultPortalTo),
      defaultLocale: resolveConfigOption((config) => config.defaultLocale)
    };
  }
}
function createConfigResolver(parent, currentOpts) {
  return (getter) => {
    const configOption = boxWith(() => {
      const value = getter(currentOpts)?.current;
      if (value !== void 0)
        return value;
      if (parent === null)
        return void 0;
      return getter(parent.opts)?.current;
    });
    return configOption;
  };
}
function createPropResolver(configOption, fallback) {
  return (getProp) => {
    const config = getBitsConfig();
    return boxWith(() => {
      const propValue = getProp();
      if (propValue !== void 0)
        return propValue;
      const option = configOption(config).current;
      if (option !== void 0)
        return option;
      return fallback;
    });
  };
}
const resolvePortalToProp = createPropResolver((config) => config.defaultPortalTo, "body");
Portal[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/portal/portal.svelte";
function Portal($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { to: toProp, children, disabled } = $$props;
      const to = resolvePortalToProp(() => toProp);
      getAllContexts();
      let target = derived(getTarget);
      function getTarget() {
        if (!isBrowser$1 || disabled) return null;
        let localTarget = null;
        if (typeof to.current === "string") {
          const target2 = document.querySelector(to.current);
          if (target2 === null) {
            throw new Error(`Target element "${to.current}" not found.`);
          }
          localTarget = target2;
        } else {
          localTarget = to.current;
        }
        if (!(localTarget instanceof Element)) {
          const type = localTarget === null ? "null" : typeof localTarget;
          throw new TypeError(`Unknown portal target type: ${type}. Allowed types: string (query selector) or Element.`);
        }
        return localTarget;
      }
      let instance;
      function unmountInstance() {
        if (instance) {
          unmount();
          instance = null;
        }
      }
      watch$1([() => target(), () => disabled], ([target2, disabled2]) => {
        if (!target2 || disabled2) {
          unmountInstance();
          return;
        }
        instance = mount();
        return () => {
          unmountInstance();
        };
      });
      if (disabled) {
        $$renderer2.push("<!--[0-->");
        children?.($$renderer2);
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    },
    Portal
  );
}
Portal.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
function debounce(fn, wait = 500) {
  let timeout = null;
  const debounced = (...args) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...args);
    }, wait);
  };
  debounced.destroy = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  return debounced;
}
function isOrContainsTarget(node, target) {
  return node === target || node.contains(target);
}
function getOwnerDocument(el) {
  return el?.ownerDocument ?? document;
}
function isClickTrulyOutside(event, contentNode) {
  const { clientX, clientY } = event;
  const rect = contentNode.getBoundingClientRect();
  return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}
const CONTEXT_MENU_TRIGGER_ATTR = "data-context-menu-trigger";
const CONTEXT_MENU_CONTENT_ATTR = "data-context-menu-content";
createBitsAttrs({
  component: "menu",
  parts: [
    "trigger",
    "content",
    "sub-trigger",
    "item",
    "group",
    "group-heading",
    "checkbox-group",
    "checkbox-item",
    "radio-group",
    "radio-item",
    "separator",
    "sub-content",
    "arrow"
  ]
});
globalThis.bitsDismissableLayers ??= /* @__PURE__ */ new Map();
class DismissibleLayerState {
  static create(opts) {
    return new DismissibleLayerState(opts);
  }
  opts;
  #interactOutsideProp;
  #behaviorType;
  #interceptedEvents = { pointerdown: false };
  #isResponsibleLayer = false;
  #isFocusInsideDOMTree = false;
  #documentObj = void 0;
  #onFocusOutside;
  #unsubClickListener = noop;
  constructor(opts) {
    this.opts = opts;
    this.#behaviorType = opts.interactOutsideBehavior;
    this.#interactOutsideProp = opts.onInteractOutside;
    this.#onFocusOutside = opts.onFocusOutside;
    let unsubEvents = noop;
    const cleanup = () => {
      this.#resetState();
      globalThis.bitsDismissableLayers.delete(this);
      this.#handleInteractOutside.destroy();
      unsubEvents();
    };
    watch$1([() => this.opts.enabled.current, () => this.opts.ref.current], () => {
      if (!this.opts.enabled.current || !this.opts.ref.current) return;
      afterSleep(1, () => {
        if (!this.opts.ref.current) return;
        globalThis.bitsDismissableLayers.set(this, this.#behaviorType);
        unsubEvents();
        unsubEvents = this.#addEventListeners();
      });
      return cleanup;
    });
  }
  #handleFocus = (event) => {
    if (event.defaultPrevented) return;
    if (!this.opts.ref.current) return;
    afterTick(() => {
      if (!this.opts.ref.current || this.#isTargetWithinLayer(event.target)) return;
      if (event.target && !this.#isFocusInsideDOMTree) {
        this.#onFocusOutside.current?.(event);
      }
    });
  };
  #addEventListeners() {
    return executeCallbacks(
      /**
       * CAPTURE INTERACTION START
       * mark interaction-start event as intercepted.
       * mark responsible layer during interaction start
       * to avoid checking if is responsible layer during interaction end
       * when a new floating element may have been opened.
       */
      on(this.#documentObj, "pointerdown", executeCallbacks(this.#markInterceptedEvent, this.#markResponsibleLayer), { capture: true }),
      /**
       * BUBBLE INTERACTION START
       * Mark interaction-start event as non-intercepted. Debounce `onInteractOutsideStart`
       * to avoid prematurely checking if other events were intercepted.
       */
      on(this.#documentObj, "pointerdown", executeCallbacks(this.#markNonInterceptedEvent, this.#handleInteractOutside)),
      /**
       * HANDLE FOCUS OUTSIDE
       */
      on(this.#documentObj, "focusin", this.#handleFocus)
    );
  }
  #handleDismiss = (e) => {
    let event = e;
    if (event.defaultPrevented) {
      event = createWrappedEvent(e);
    }
    this.#interactOutsideProp.current(e);
  };
  #handleInteractOutside = debounce(
    (e) => {
      if (!this.opts.ref.current) {
        this.#unsubClickListener();
        return;
      }
      const isEventValid = this.opts.isValidEvent.current(e, this.opts.ref.current) || isValidEvent(e, this.opts.ref.current);
      if (!this.#isResponsibleLayer || this.#isAnyEventIntercepted() || !isEventValid) {
        this.#unsubClickListener();
        return;
      }
      let event = e;
      if (event.defaultPrevented) {
        event = createWrappedEvent(event);
      }
      if (this.#behaviorType.current !== "close" && this.#behaviorType.current !== "defer-otherwise-close") {
        this.#unsubClickListener();
        return;
      }
      if (e.pointerType === "touch") {
        this.#unsubClickListener();
        this.#unsubClickListener = on(this.#documentObj, "click", this.#handleDismiss, { once: true });
      } else {
        this.#interactOutsideProp.current(event);
      }
    },
    10
  );
  #markInterceptedEvent = (e) => {
    this.#interceptedEvents[e.type] = true;
  };
  #markNonInterceptedEvent = (e) => {
    this.#interceptedEvents[e.type] = false;
  };
  #markResponsibleLayer = () => {
    if (!this.opts.ref.current) return;
    this.#isResponsibleLayer = isResponsibleLayer(this.opts.ref.current);
  };
  #isTargetWithinLayer = (target) => {
    if (!this.opts.ref.current) return false;
    return isOrContainsTarget(this.opts.ref.current, target);
  };
  #resetState = debounce(
    () => {
      for (const eventType in this.#interceptedEvents) {
        this.#interceptedEvents[eventType] = false;
      }
      this.#isResponsibleLayer = false;
    },
    20
  );
  #isAnyEventIntercepted() {
    const i = Object.values(this.#interceptedEvents).some(Boolean);
    return i;
  }
  #onfocuscapture = () => {
    this.#isFocusInsideDOMTree = true;
  };
  #onblurcapture = () => {
    this.#isFocusInsideDOMTree = false;
  };
  props = {
    onfocuscapture: this.#onfocuscapture,
    onblurcapture: this.#onblurcapture
  };
}
function getTopMostDismissableLayer(layersArr = [...globalThis.bitsDismissableLayers]) {
  return layersArr.findLast(([_, { current: behaviorType }]) => behaviorType === "close" || behaviorType === "ignore");
}
function isResponsibleLayer(node) {
  const layersArr = [...globalThis.bitsDismissableLayers];
  const topMostLayer = getTopMostDismissableLayer(layersArr);
  if (topMostLayer) return topMostLayer[0].opts.ref.current === node;
  const [firstLayerNode] = layersArr[0];
  return firstLayerNode.opts.ref.current === node;
}
function isValidEvent(e, node) {
  const target = e.target;
  if (!isElementOrSVGElement(target)) return false;
  const targetIsContextMenuTrigger = Boolean(target.closest(`[${CONTEXT_MENU_TRIGGER_ATTR}]`));
  const nodeIsContextMenu = Boolean(node.closest(`[${CONTEXT_MENU_CONTENT_ATTR}]`));
  if ("button" in e && e.button > 0 && !targetIsContextMenuTrigger) return false;
  if ("button" in e && e.button === 0 && targetIsContextMenuTrigger && nodeIsContextMenu) {
    return true;
  }
  if (targetIsContextMenuTrigger && nodeIsContextMenu) return false;
  const ownerDocument = getOwnerDocument(target);
  const isValid = ownerDocument.documentElement.contains(target) && !isOrContainsTarget(node, target) && isClickTrulyOutside(e, node);
  return isValid;
}
function createWrappedEvent(e) {
  const capturedCurrentTarget = e.currentTarget;
  const capturedTarget = e.target;
  let newEvent;
  if (e instanceof PointerEvent) {
    newEvent = new PointerEvent(e.type, e);
  } else {
    newEvent = new PointerEvent("pointerdown", e);
  }
  let isPrevented = false;
  const wrappedEvent = new Proxy(newEvent, {
    get: (target, prop) => {
      if (prop === "currentTarget") {
        return capturedCurrentTarget;
      }
      if (prop === "target") {
        return capturedTarget;
      }
      if (prop === "preventDefault") {
        return () => {
          isPrevented = true;
          if (typeof target.preventDefault === "function") {
            target.preventDefault();
          }
        };
      }
      if (prop === "defaultPrevented") {
        return isPrevented;
      }
      if (prop in target) {
        return target[prop];
      }
      return e[prop];
    }
  });
  return wrappedEvent;
}
Dismissible_layer[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/dismissible-layer/dismissible-layer.svelte";
function Dismissible_layer($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        interactOutsideBehavior = "close",
        onInteractOutside = noop,
        onFocusOutside = noop,
        id: id2,
        children,
        enabled,
        isValidEvent: isValidEvent2 = () => false,
        ref
      } = $$props;
      const dismissibleLayerState = DismissibleLayerState.create({
        id: boxWith(() => id2),
        interactOutsideBehavior: boxWith(() => interactOutsideBehavior),
        onInteractOutside: boxWith(() => onInteractOutside),
        enabled: boxWith(() => enabled),
        onFocusOutside: boxWith(() => onFocusOutside),
        isValidEvent: boxWith(() => isValidEvent2),
        ref
      });
      children?.($$renderer2, { props: dismissibleLayerState.props });
      $$renderer2.push(`<!---->`);
    },
    Dismissible_layer
  );
}
Dismissible_layer.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
globalThis.bitsEscapeLayers ??= /* @__PURE__ */ new Map();
class EscapeLayerState {
  static create(opts) {
    return new EscapeLayerState(opts);
  }
  opts;
  domContext;
  constructor(opts) {
    this.opts = opts;
    this.domContext = new DOMContext(this.opts.ref);
    let unsubEvents = noop;
    watch$1(() => opts.enabled.current, (enabled) => {
      if (enabled) {
        globalThis.bitsEscapeLayers.set(this, opts.escapeKeydownBehavior);
        unsubEvents = this.#addEventListener();
      }
      return () => {
        unsubEvents();
        globalThis.bitsEscapeLayers.delete(this);
      };
    });
  }
  #addEventListener = () => {
    return on(this.domContext.getDocument(), "keydown", this.#onkeydown, { passive: false });
  };
  #onkeydown = (e) => {
    if (e.key !== ESCAPE || !isResponsibleEscapeLayer(this)) return;
    const clonedEvent = new KeyboardEvent(e.type, e);
    e.preventDefault();
    const behaviorType = this.opts.escapeKeydownBehavior.current;
    if (behaviorType !== "close" && behaviorType !== "defer-otherwise-close") return;
    this.opts.onEscapeKeydown.current(clonedEvent);
  };
}
function isResponsibleEscapeLayer(instance) {
  const layersArr = [...globalThis.bitsEscapeLayers];
  const topMostLayer = layersArr.findLast(([_, { current: behaviorType }]) => behaviorType === "close" || behaviorType === "ignore");
  if (topMostLayer) return topMostLayer[0] === instance;
  const [firstLayerNode] = layersArr[0];
  return firstLayerNode === instance;
}
Escape_layer[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/escape-layer/escape-layer.svelte";
function Escape_layer($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        escapeKeydownBehavior = "close",
        onEscapeKeydown = noop,
        children,
        enabled,
        ref
      } = $$props;
      EscapeLayerState.create({
        escapeKeydownBehavior: boxWith(() => escapeKeydownBehavior),
        onEscapeKeydown: boxWith(() => onEscapeKeydown),
        enabled: boxWith(() => enabled),
        ref
      });
      children?.($$renderer2);
      $$renderer2.push(`<!---->`);
    },
    Escape_layer
  );
}
Escape_layer.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
class FocusScopeManager {
  static instance;
  #scopeStack = simpleBox([]);
  #focusHistory = /* @__PURE__ */ new WeakMap();
  #preFocusHistory = /* @__PURE__ */ new WeakMap();
  static getInstance() {
    if (!this.instance) {
      this.instance = new FocusScopeManager();
    }
    return this.instance;
  }
  register(scope) {
    const current = this.getActive();
    if (current && current !== scope) {
      current.pause();
    }
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body) {
      this.#preFocusHistory.set(scope, activeElement);
    }
    this.#scopeStack.current = this.#scopeStack.current.filter((s) => s !== scope);
    this.#scopeStack.current.unshift(scope);
  }
  unregister(scope) {
    this.#scopeStack.current = this.#scopeStack.current.filter((s) => s !== scope);
    const next = this.getActive();
    if (next) {
      next.resume();
    }
  }
  getActive() {
    return this.#scopeStack.current[0];
  }
  setFocusMemory(scope, element2) {
    this.#focusHistory.set(scope, element2);
  }
  getFocusMemory(scope) {
    return this.#focusHistory.get(scope);
  }
  isActiveScope(scope) {
    return this.getActive() === scope;
  }
  setPreFocusMemory(scope, element2) {
    this.#preFocusHistory.set(scope, element2);
  }
  getPreFocusMemory(scope) {
    return this.#preFocusHistory.get(scope);
  }
  clearPreFocusMemory(scope) {
    this.#preFocusHistory.delete(scope);
  }
}
class FocusScope {
  #paused = false;
  #container = null;
  #manager = FocusScopeManager.getInstance();
  #cleanupFns = [];
  #opts;
  constructor(opts) {
    this.#opts = opts;
  }
  get paused() {
    return this.#paused;
  }
  pause() {
    this.#paused = true;
  }
  resume() {
    this.#paused = false;
  }
  #cleanup() {
    for (const fn of this.#cleanupFns) {
      fn();
    }
    this.#cleanupFns = [];
  }
  mount(container) {
    if (this.#container) {
      this.unmount();
    }
    this.#container = container;
    this.#manager.register(this);
    this.#setupEventListeners();
    this.#handleOpenAutoFocus();
  }
  unmount() {
    if (!this.#container) return;
    this.#cleanup();
    this.#handleCloseAutoFocus();
    this.#manager.unregister(this);
    this.#manager.clearPreFocusMemory(this);
    this.#container = null;
  }
  #handleOpenAutoFocus() {
    if (!this.#container) return;
    const event = new CustomEvent("focusScope.onOpenAutoFocus", { bubbles: false, cancelable: true });
    this.#opts.onOpenAutoFocus.current(event);
    if (!event.defaultPrevented) {
      requestAnimationFrame(() => {
        if (!this.#container) return;
        const firstTabbable = this.#getFirstTabbable();
        if (firstTabbable) {
          firstTabbable.focus();
          this.#manager.setFocusMemory(this, firstTabbable);
        } else {
          this.#container.focus();
        }
      });
    }
  }
  #handleCloseAutoFocus() {
    const event = new CustomEvent("focusScope.onCloseAutoFocus", { bubbles: false, cancelable: true });
    this.#opts.onCloseAutoFocus.current?.(event);
    if (!event.defaultPrevented) {
      const preFocusedElement = this.#manager.getPreFocusMemory(this);
      if (preFocusedElement && document.contains(preFocusedElement)) {
        try {
          preFocusedElement.focus();
        } catch {
          document.body.focus();
        }
      }
    }
  }
  #setupEventListeners() {
    if (!this.#container || !this.#opts.trap.current) return;
    const container = this.#container;
    const doc = container.ownerDocument;
    const handleFocus = (e) => {
      if (this.#paused || !this.#manager.isActiveScope(this)) return;
      const target = e.target;
      if (!target) return;
      const isInside = container.contains(target);
      if (isInside) {
        this.#manager.setFocusMemory(this, target);
      } else {
        const lastFocused = this.#manager.getFocusMemory(this);
        if (lastFocused && container.contains(lastFocused) && isFocusable(lastFocused)) {
          e.preventDefault();
          lastFocused.focus();
        } else {
          const firstTabbable = this.#getFirstTabbable();
          const firstFocusable = this.#getAllFocusables()[0];
          (firstTabbable || firstFocusable || container).focus();
        }
      }
    };
    const handleKeydown = (e) => {
      if (!this.#opts.loop || this.#paused || e.key !== "Tab") return;
      if (!this.#manager.isActiveScope(this)) return;
      const tabbables = this.#getTabbables();
      if (tabbables.length === 0) return;
      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };
    this.#cleanupFns.push(on(doc, "focusin", handleFocus, { capture: true }), on(container, "keydown", handleKeydown));
    const observer = new MutationObserver(() => {
      const lastFocused = this.#manager.getFocusMemory(this);
      if (lastFocused && !container.contains(lastFocused)) {
        const firstTabbable = this.#getFirstTabbable();
        const firstFocusable = this.#getAllFocusables()[0];
        const elementToFocus = firstTabbable || firstFocusable;
        if (elementToFocus) {
          elementToFocus.focus();
          this.#manager.setFocusMemory(this, elementToFocus);
        } else {
          container.focus();
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    this.#cleanupFns.push(() => observer.disconnect());
  }
  #getTabbables() {
    if (!this.#container) return [];
    return tabbable(this.#container, { includeContainer: false, getShadowRoot: true });
  }
  #getFirstTabbable() {
    const tabbables = this.#getTabbables();
    return tabbables[0] || null;
  }
  #getAllFocusables() {
    if (!this.#container) return [];
    return focusable(this.#container, { includeContainer: false, getShadowRoot: true });
  }
  static use(opts) {
    let scope = null;
    watch$1([() => opts.ref.current, () => opts.enabled.current], ([ref, enabled]) => {
      if (ref && enabled) {
        if (!scope) {
          scope = new FocusScope(opts);
        }
        scope.mount(ref);
      } else if (scope) {
        scope.unmount();
        scope = null;
      }
    });
    return {
      get props() {
        return { tabindex: -1 };
      }
    };
  }
}
Focus_scope[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/focus-scope/focus-scope.svelte";
function Focus_scope($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        enabled = false,
        trapFocus = false,
        loop: loop2 = false,
        onCloseAutoFocus = noop,
        onOpenAutoFocus = noop,
        focusScope,
        ref
      } = $$props;
      const focusScopeState = FocusScope.use({
        enabled: boxWith(() => enabled),
        trap: boxWith(() => trapFocus),
        loop: loop2,
        onCloseAutoFocus: boxWith(() => onCloseAutoFocus),
        onOpenAutoFocus: boxWith(() => onOpenAutoFocus),
        ref
      });
      focusScope?.($$renderer2, { props: focusScopeState.props });
      $$renderer2.push(`<!---->`);
    },
    Focus_scope
  );
}
Focus_scope.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const noopPointer = () => {
};
globalThis.bitsTextSelectionLayers ??= /* @__PURE__ */ new Map();
class TextSelectionLayerState {
  static create(opts) {
    return new TextSelectionLayerState(opts);
  }
  opts;
  domContext;
  #unsubSelectionLock = noop;
  #enabledSnapshot = false;
  #onPointerDownSnapshot = noopPointer;
  #onPointerUpSnapshot = noopPointer;
  constructor(opts) {
    this.opts = opts;
    this.domContext = new DOMContext(opts.ref);
    let unsubEvents = noop;
    watch$1(
      () => [
        this.opts.enabled.current,
        this.opts.onPointerDown.current,
        this.opts.onPointerUp.current
      ],
      ([enabled, onPointerDown, onPointerUp]) => {
        this.#enabledSnapshot = enabled;
        this.#onPointerDownSnapshot = onPointerDown;
        this.#onPointerUpSnapshot = onPointerUp;
        if (enabled) {
          globalThis.bitsTextSelectionLayers.set(this, this.opts.enabled);
          unsubEvents();
          unsubEvents = this.#addEventListeners();
        }
        return () => {
          this.#enabledSnapshot = false;
          unsubEvents();
          this.#resetSelectionLock();
          globalThis.bitsTextSelectionLayers.delete(this);
        };
      }
    );
  }
  #addEventListeners() {
    return executeCallbacks(on(this.domContext.getDocument(), "pointerdown", this.#pointerdown), on(this.domContext.getDocument(), "pointerup", composeHandlers(this.#resetSelectionLock, this.#pointerupUserHandler)));
  }
  #pointerupUserHandler = (e) => {
    this.#onPointerUpSnapshot(e);
  };
  #pointerdown = (e) => {
    const node = this.opts.ref.current;
    const target = e.target;
    if (!isHTMLElement$1(node) || !isHTMLElement$1(target) || !this.#enabledSnapshot) return;
    if (!isHighestLayer(this) || !contains(node, target)) return;
    this.#onPointerDownSnapshot(e);
    if (e.defaultPrevented) return;
    this.#unsubSelectionLock = preventTextSelectionOverflow(node, this.domContext.getDocument().body);
  };
  #resetSelectionLock = () => {
    this.#unsubSelectionLock();
    this.#unsubSelectionLock = noop;
  };
}
const getUserSelect = (node) => node.style.userSelect || node.style.webkitUserSelect;
function preventTextSelectionOverflow(node, body) {
  const originalBodyUserSelect = getUserSelect(body);
  const originalNodeUserSelect = getUserSelect(node);
  setUserSelect(body, "none");
  setUserSelect(node, "text");
  return () => {
    setUserSelect(body, originalBodyUserSelect);
    setUserSelect(node, originalNodeUserSelect);
  };
}
function setUserSelect(node, value) {
  node.style.userSelect = value;
  node.style.webkitUserSelect = value;
}
function isHighestLayer(instance) {
  const layersArr = [...globalThis.bitsTextSelectionLayers];
  if (!layersArr.length) return false;
  const highestLayer = layersArr.at(-1);
  if (!highestLayer) return false;
  return highestLayer[0] === instance;
}
Text_selection_layer[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/text-selection-layer/text-selection-layer.svelte";
function Text_selection_layer($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        preventOverflowTextSelection = true,
        onPointerDown = noop,
        onPointerUp = noop,
        id: id2,
        children,
        enabled,
        ref
      } = $$props;
      TextSelectionLayerState.create({
        id: boxWith(() => id2),
        onPointerDown: boxWith(() => onPointerDown),
        onPointerUp: boxWith(() => onPointerUp),
        enabled: boxWith(() => enabled && preventOverflowTextSelection),
        ref
      });
      children?.($$renderer2);
      $$renderer2.push(`<!---->`);
    },
    Text_selection_layer
  );
}
Text_selection_layer.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
globalThis.bitsIdCounter ??= { current: 0 };
function useId(prefix = "bits") {
  globalThis.bitsIdCounter.current++;
  return `${prefix}-${globalThis.bitsIdCounter.current}`;
}
class SharedState {
  #factory;
  #subscribers = 0;
  #state;
  #scope;
  constructor(factory) {
    this.#factory = factory;
  }
  #dispose() {
    this.#subscribers -= 1;
    if (this.#scope && this.#subscribers <= 0) {
      this.#scope();
      this.#state = void 0;
      this.#scope = void 0;
    }
  }
  get(...args) {
    this.#subscribers += 1;
    if (this.#state === void 0) {
      this.#scope = () => {
      };
    }
    return this.#state;
  }
}
const lockMap = new SvelteMap();
let initialBodyStyle = null;
let cleanupTimeoutId = null;
let isInCleanupTransition = false;
const anyLocked = boxWith(() => {
  for (const value of lockMap.values()) {
    if (value) return true;
  }
  return false;
});
let cleanupScheduledAt = null;
const bodyLockStackCount = new SharedState(() => {
  function resetBodyStyle() {
    return;
  }
  function cancelPendingCleanup() {
    if (cleanupTimeoutId === null) return;
    window.clearTimeout(cleanupTimeoutId);
    cleanupTimeoutId = null;
  }
  function scheduleCleanupIfNoNewLocks(delay2, callback) {
    cancelPendingCleanup();
    isInCleanupTransition = true;
    cleanupScheduledAt = Date.now();
    const currentCleanupId = cleanupScheduledAt;
    const cleanupFn = () => {
      cleanupTimeoutId = null;
      if (cleanupScheduledAt !== currentCleanupId) return;
      if (!isAnyLocked(lockMap)) {
        isInCleanupTransition = false;
        callback();
      } else {
        isInCleanupTransition = false;
      }
    };
    const actualDelay = delay2 === null ? 24 : delay2;
    cleanupTimeoutId = window.setTimeout(cleanupFn, actualDelay);
  }
  function ensureInitialStyleCaptured() {
    if (initialBodyStyle === null && lockMap.size === 0 && !isInCleanupTransition) {
      initialBodyStyle = document.body.getAttribute("style");
    }
  }
  watch$1(() => anyLocked.current, () => {
    if (!anyLocked.current) return;
    ensureInitialStyleCaptured();
    isInCleanupTransition = false;
    const htmlStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const hasStableGutter = htmlStyle.scrollbarGutter?.includes("stable") || bodyStyle.scrollbarGutter?.includes("stable");
    const verticalScrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const paddingRight = Number.parseInt(bodyStyle.paddingRight ?? "0", 10);
    const config = {
      padding: paddingRight + verticalScrollbarWidth,
      margin: Number.parseInt(bodyStyle.marginRight ?? "0", 10)
    };
    if (verticalScrollbarWidth > 0 && !hasStableGutter) {
      document.body.style.paddingRight = `${config.padding}px`;
      document.body.style.marginRight = `${config.margin}px`;
      document.body.style.setProperty("--scrollbar-width", `${verticalScrollbarWidth}px`);
    }
    document.body.style.overflow = "hidden";
    if (isIOS) {
      on(
        document,
        "touchmove",
        (e) => {
          if (e.target !== document.documentElement) return;
          if (e.touches.length > 1) return;
          e.preventDefault();
        },
        { passive: false }
      );
    }
    afterTick(() => {
      document.body.style.pointerEvents = "none";
      document.body.style.overflow = "hidden";
    });
  });
  return {
    get lockMap() {
      return lockMap;
    },
    resetBodyStyle,
    scheduleCleanupIfNoNewLocks,
    cancelPendingCleanup,
    ensureInitialStyleCaptured
  };
});
class BodyScrollLock {
  #id = useId();
  #initialState;
  #restoreScrollDelay = () => null;
  #countState;
  locked;
  constructor(initialState, restoreScrollDelay = () => null) {
    this.#initialState = initialState;
    this.#restoreScrollDelay = restoreScrollDelay;
    this.#countState = bodyLockStackCount.get();
    if (!this.#countState) return;
    this.#countState.cancelPendingCleanup();
    this.#countState.ensureInitialStyleCaptured();
    this.#countState.lockMap.set(this.#id, this.#initialState ?? false);
    this.locked = boxWith(() => this.#countState.lockMap.get(this.#id) ?? false, (v) => this.#countState.lockMap.set(this.#id, v));
  }
}
function isAnyLocked(map) {
  for (const [_, value] of map) {
    if (value) return true;
  }
  return false;
}
Scroll_lock[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/scroll-lock/scroll-lock.svelte";
function Scroll_lock($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { preventScroll = true, restoreScrollDelay = null } = $$props;
      if (preventScroll) {
        new BodyScrollLock(preventScroll, () => restoreScrollDelay);
      }
    },
    Scroll_lock
  );
}
Scroll_lock.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Alert_dialog_content[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/alert-dialog/components/alert-dialog-content.svelte";
function Alert_dialog_content($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const uid = props_id($$renderer2);
      let {
        id: id2 = createId(uid),
        children,
        child,
        ref = null,
        forceMount = false,
        interactOutsideBehavior = "ignore",
        onCloseAutoFocus = noop,
        onEscapeKeydown = noop,
        onOpenAutoFocus = noop,
        onInteractOutside = noop,
        preventScroll = true,
        trapFocus = true,
        restoreScrollDelay = null,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const contentState = DialogContentState.create({
        id: boxWith(() => id2),
        ref: boxWith(() => ref, (v) => ref = v)
      });
      const mergedProps = derived(() => mergeProps(restProps, contentState.props));
      if (contentState.shouldRender || forceMount) {
        $$renderer2.push("<!--[0-->");
        {
          let focusScope = function($$renderer3, { props: focusScopeProps }) {
            validate_snippet_args($$renderer3);
            Escape_layer($$renderer3, spread_props([
              mergedProps(),
              {
                enabled: contentState.root.opts.open.current,
                ref: contentState.opts.ref,
                onEscapeKeydown: (e) => {
                  onEscapeKeydown(e);
                  if (e.defaultPrevented) return;
                  contentState.root.handleClose();
                },
                children: prevent_snippet_stringification(($$renderer4) => {
                  Dismissible_layer($$renderer4, spread_props([
                    mergedProps(),
                    {
                      ref: contentState.opts.ref,
                      enabled: contentState.root.opts.open.current,
                      interactOutsideBehavior,
                      onInteractOutside: (e) => {
                        onInteractOutside(e);
                        if (e.defaultPrevented) return;
                        contentState.root.handleClose();
                      },
                      children: prevent_snippet_stringification(($$renderer5) => {
                        Text_selection_layer($$renderer5, spread_props([
                          mergedProps(),
                          {
                            ref: contentState.opts.ref,
                            enabled: contentState.root.opts.open.current,
                            children: prevent_snippet_stringification(($$renderer6) => {
                              if (child) {
                                $$renderer6.push("<!--[0-->");
                                if (contentState.root.opts.open.current) {
                                  $$renderer6.push("<!--[0-->");
                                  Scroll_lock($$renderer6, { preventScroll, restoreScrollDelay });
                                } else {
                                  $$renderer6.push("<!--[-1-->");
                                }
                                $$renderer6.push(`<!--]--> `);
                                child($$renderer6, {
                                  props: mergeProps(mergedProps(), focusScopeProps),
                                  ...contentState.snippetProps
                                });
                                $$renderer6.push(`<!---->`);
                              } else {
                                $$renderer6.push("<!--[-1-->");
                                Scroll_lock($$renderer6, { preventScroll });
                                $$renderer6.push(`<!----> <div${attributes({ ...mergeProps(mergedProps(), focusScopeProps) })}>`);
                                push_element($$renderer6, "div", 94, 7);
                                children?.($$renderer6);
                                $$renderer6.push(`<!----></div>`);
                                pop_element();
                              }
                              $$renderer6.push(`<!--]-->`);
                            }),
                            $$slots: { default: true }
                          }
                        ]));
                      }),
                      $$slots: { default: true }
                    }
                  ]));
                }),
                $$slots: { default: true }
              }
            ]));
          };
          prevent_snippet_stringification(focusScope);
          Focus_scope($$renderer2, {
            ref: contentState.opts.ref,
            loop: true,
            trapFocus,
            enabled: contentState.root.opts.open.current,
            onCloseAutoFocus,
            onOpenAutoFocus: (e) => {
              onOpenAutoFocus(e);
              if (e.defaultPrevented) return;
              e.preventDefault();
              afterSleep(0, () => contentState.opts.ref.current?.focus());
            },
            focusScope
          });
        }
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Alert_dialog_content
  );
}
Alert_dialog_content.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Dialog_overlay[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/dialog/components/dialog-overlay.svelte";
function Dialog_overlay($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const uid = props_id($$renderer2);
      let {
        id: id2 = createId(uid),
        forceMount = false,
        child,
        children,
        ref = null,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const overlayState = DialogOverlayState.create({
        id: boxWith(() => id2),
        ref: boxWith(() => ref, (v) => ref = v)
      });
      const mergedProps = derived(() => mergeProps(restProps, overlayState.props));
      if (overlayState.shouldRender || forceMount) {
        $$renderer2.push("<!--[0-->");
        if (child) {
          $$renderer2.push("<!--[0-->");
          child($$renderer2, {
            props: mergeProps(mergedProps()),
            ...overlayState.snippetProps
          });
          $$renderer2.push(`<!---->`);
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<div${attributes({ ...mergeProps(mergedProps()) })}>`);
          push_element($$renderer2, "div", 33, 2);
          children?.($$renderer2, overlayState.snippetProps);
          $$renderer2.push(`<!----></div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Dialog_overlay
  );
}
Dialog_overlay.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Dialog_description[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/dialog/components/dialog-description.svelte";
function Dialog_description($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const uid = props_id($$renderer2);
      let {
        id: id2 = createId(uid),
        children,
        child,
        ref = null,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const descriptionState = DialogDescriptionState.create({
        id: boxWith(() => id2),
        ref: boxWith(() => ref, (v) => ref = v)
      });
      const mergedProps = derived(() => mergeProps(restProps, descriptionState.props));
      if (child) {
        $$renderer2.push("<!--[0-->");
        child($$renderer2, { props: mergedProps() });
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
        push_element($$renderer2, "div", 31, 1);
        children?.($$renderer2);
        $$renderer2.push(`<!----></div>`);
        pop_element();
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Dialog_description
  );
}
Dialog_description.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
function get(valueOrGetValue) {
  return typeof valueOrGetValue === "function" ? valueOrGetValue() : valueOrGetValue;
}
function getDPR(element2) {
  if (typeof window === "undefined") return 1;
  const win = element2.ownerDocument.defaultView || window;
  return win.devicePixelRatio || 1;
}
function roundByDPR(element2, value) {
  const dpr = getDPR(element2);
  return Math.round(value * dpr) / dpr;
}
function getFloatingContentCSSVars(name) {
  return {
    [`--bits-${name}-content-transform-origin`]: `var(--bits-floating-transform-origin)`,
    [`--bits-${name}-content-available-width`]: `var(--bits-floating-available-width)`,
    [`--bits-${name}-content-available-height`]: `var(--bits-floating-available-height)`,
    [`--bits-${name}-anchor-width`]: `var(--bits-floating-anchor-width)`,
    [`--bits-${name}-anchor-height`]: `var(--bits-floating-anchor-height)`
  };
}
function useFloating(options) {
  const openOption = derived(() => get(options.open) ?? true);
  const middlewareOption = derived(() => get(options.middleware));
  const transformOption = derived(() => get(options.transform) ?? true);
  const placementOption = derived(() => get(options.placement) ?? "bottom");
  const strategyOption = derived(() => get(options.strategy) ?? "absolute");
  const sideOffsetOption = derived(() => get(options.sideOffset) ?? 0);
  const alignOffsetOption = derived(() => get(options.alignOffset) ?? 0);
  const reference = options.reference;
  let x = 0;
  let y = 0;
  const floating = simpleBox(null);
  let strategy = strategyOption();
  let placement = placementOption();
  let middlewareData = {};
  let isPositioned = false;
  let updateRequestId = 0;
  const floatingStyles = derived(() => {
    const xVal = floating.current ? roundByDPR(floating.current, x) : x;
    const yVal = floating.current ? roundByDPR(floating.current, y) : y;
    if (transformOption()) {
      return {
        position: strategy,
        left: "0",
        top: "0",
        transform: `translate(${xVal}px, ${yVal}px)`,
        ...floating.current && getDPR(floating.current) >= 1.5 && { willChange: "transform" }
      };
    }
    return { position: strategy, left: `${xVal}px`, top: `${yVal}px` };
  });
  function update() {
    if (reference.current === null || floating.current === null) return;
    const referenceNode = reference.current;
    const floatingNode = floating.current;
    const requestId = ++updateRequestId;
    computePosition(referenceNode, floatingNode, {
      middleware: middlewareOption(),
      placement: placementOption(),
      strategy: strategyOption()
    }).then((position) => {
      if (requestId !== updateRequestId) return;
      if (reference.current !== referenceNode || floating.current !== floatingNode) return;
      const referenceHidden = isReferenceHidden(referenceNode);
      if (referenceHidden) {
        middlewareData = {
          ...middlewareData,
          hide: {
            // oxlint-disable-next-line no-explicit-any
            ...middlewareData.hide,
            referenceHidden: true
          }
        };
        return;
      }
      if (!openOption() && x !== 0 && y !== 0) {
        const maxExpectedOffset = Math.max(Math.abs(sideOffsetOption()), Math.abs(alignOffsetOption()), 15);
        if (position.x <= maxExpectedOffset && position.y <= maxExpectedOffset) return;
      }
      x = position.x;
      y = position.y;
      strategy = position.strategy;
      placement = position.placement;
      middlewareData = position.middlewareData;
      isPositioned = true;
    });
  }
  return {
    floating,
    reference,
    get strategy() {
      return strategy;
    },
    get placement() {
      return placement;
    },
    get middlewareData() {
      return middlewareData;
    },
    get isPositioned() {
      return isPositioned;
    },
    get floatingStyles() {
      return floatingStyles();
    },
    get update() {
      return update;
    }
  };
}
function isReferenceHidden(node) {
  if (!(node instanceof Element)) return false;
  if (!node.isConnected) return true;
  if (node instanceof HTMLElement && node.hidden) return true;
  return node.getClientRects().length === 0;
}
const OPPOSITE_SIDE = { top: "bottom", right: "left", bottom: "top", left: "right" };
const FloatingRootContext = new Context$1("Floating.Root");
const FloatingContentContext = new Context$1("Floating.Content");
const FloatingTooltipRootContext = new Context$1("Floating.Root");
class FloatingRootState {
  static create(tooltip = false) {
    return tooltip ? FloatingTooltipRootContext.set(new FloatingRootState()) : FloatingRootContext.set(new FloatingRootState());
  }
  anchorNode = simpleBox(null);
  customAnchorNode = simpleBox(null);
  triggerNode = simpleBox(null);
  constructor() {
  }
}
class FloatingContentState {
  static create(opts, tooltip = false) {
    return tooltip ? FloatingContentContext.set(new FloatingContentState(opts, FloatingTooltipRootContext.get())) : FloatingContentContext.set(new FloatingContentState(opts, FloatingRootContext.get()));
  }
  opts;
  root;
  // nodes
  contentRef = simpleBox(null);
  wrapperRef = simpleBox(null);
  arrowRef = simpleBox(null);
  contentAttachment = attachRef(this.contentRef);
  wrapperAttachment = attachRef(this.wrapperRef);
  arrowAttachment = attachRef(this.arrowRef);
  // ids
  arrowId = simpleBox(useId());
  #transformedStyle = derived(() => {
    if (typeof this.opts.style === "string") return cssToStyleObj(this.opts.style);
    if (!this.opts.style) return {};
  });
  #updatePositionStrategy = void 0;
  #arrowSize = new ElementSize(() => this.arrowRef.current ?? void 0);
  #arrowWidth = derived(() => this.#arrowSize?.width ?? 0);
  #arrowHeight = derived(() => this.#arrowSize?.height ?? 0);
  #desiredPlacement = derived(() => this.opts.side?.current + (this.opts.align.current !== "center" ? `-${this.opts.align.current}` : ""));
  #boundary = derived(() => Array.isArray(this.opts.collisionBoundary.current) ? this.opts.collisionBoundary.current : [this.opts.collisionBoundary.current]);
  #hasExplicitBoundaries = derived(() => this.#boundary().length > 0);
  get hasExplicitBoundaries() {
    return this.#hasExplicitBoundaries();
  }
  set hasExplicitBoundaries($$value) {
    return this.#hasExplicitBoundaries($$value);
  }
  #detectOverflowOptions = derived(() => ({
    padding: this.opts.collisionPadding.current,
    boundary: this.#boundary().filter(isNotNull$1),
    altBoundary: this.hasExplicitBoundaries
  }));
  get detectOverflowOptions() {
    return this.#detectOverflowOptions();
  }
  set detectOverflowOptions($$value) {
    return this.#detectOverflowOptions($$value);
  }
  #availableWidth = void 0;
  #availableHeight = void 0;
  #anchorWidth = void 0;
  #anchorHeight = void 0;
  #middleware = derived(() => [
    offset({
      mainAxis: this.opts.sideOffset.current + this.#arrowHeight(),
      alignmentAxis: this.opts.alignOffset.current
    }),
    this.opts.avoidCollisions.current && shift({
      mainAxis: true,
      crossAxis: false,
      limiter: this.opts.sticky.current === "partial" ? limitShift() : void 0,
      ...this.detectOverflowOptions
    }),
    this.opts.avoidCollisions.current && flip({ ...this.detectOverflowOptions }),
    size({
      ...this.detectOverflowOptions,
      apply: ({ rects, availableWidth, availableHeight }) => {
        const { width: anchorWidth, height: anchorHeight } = rects.reference;
        this.#availableWidth = availableWidth;
        this.#availableHeight = availableHeight;
        this.#anchorWidth = anchorWidth;
        this.#anchorHeight = anchorHeight;
      }
    }),
    this.arrowRef.current && arrow({
      element: this.arrowRef.current,
      padding: this.opts.arrowPadding.current
    }),
    transformOrigin({
      arrowWidth: this.#arrowWidth(),
      arrowHeight: this.#arrowHeight()
    }),
    this.opts.hideWhenDetached.current && hide({ strategy: "referenceHidden", ...this.detectOverflowOptions })
  ].filter(Boolean));
  get middleware() {
    return this.#middleware();
  }
  set middleware($$value) {
    return this.#middleware($$value);
  }
  floating;
  #placedSide = derived(() => getSideFromPlacement(this.floating.placement));
  get placedSide() {
    return this.#placedSide();
  }
  set placedSide($$value) {
    return this.#placedSide($$value);
  }
  #placedAlign = derived(() => getAlignFromPlacement(this.floating.placement));
  get placedAlign() {
    return this.#placedAlign();
  }
  set placedAlign($$value) {
    return this.#placedAlign($$value);
  }
  #arrowX = derived(() => this.floating.middlewareData.arrow?.x ?? 0);
  get arrowX() {
    return this.#arrowX();
  }
  set arrowX($$value) {
    return this.#arrowX($$value);
  }
  #arrowY = derived(() => this.floating.middlewareData.arrow?.y ?? 0);
  get arrowY() {
    return this.#arrowY();
  }
  set arrowY($$value) {
    return this.#arrowY($$value);
  }
  #cannotCenterArrow = derived(() => this.floating.middlewareData.arrow?.centerOffset !== 0);
  get cannotCenterArrow() {
    return this.#cannotCenterArrow();
  }
  set cannotCenterArrow($$value) {
    return this.#cannotCenterArrow($$value);
  }
  contentZIndex;
  #arrowBaseSide = derived(() => OPPOSITE_SIDE[this.placedSide]);
  get arrowBaseSide() {
    return this.#arrowBaseSide();
  }
  set arrowBaseSide($$value) {
    return this.#arrowBaseSide($$value);
  }
  #wrapperProps = derived(() => ({
    id: this.opts.wrapperId.current,
    "data-bits-floating-content-wrapper": "",
    style: {
      ...this.floating.floatingStyles,
      transform: this.floating.isPositioned ? this.floating.floatingStyles.transform : "translate(0, -200%)",
      minWidth: "max-content",
      zIndex: this.contentZIndex,
      "--bits-floating-transform-origin": `${this.floating.middlewareData.transformOrigin?.x} ${this.floating.middlewareData.transformOrigin?.y}`,
      "--bits-floating-available-width": `${this.#availableWidth}px`,
      "--bits-floating-available-height": `${this.#availableHeight}px`,
      "--bits-floating-anchor-width": `${this.#anchorWidth}px`,
      "--bits-floating-anchor-height": `${this.#anchorHeight}px`,
      ...this.floating.middlewareData.hide?.referenceHidden && { visibility: "hidden", "pointer-events": "none" },
      ...this.#transformedStyle()
    },
    dir: this.opts.dir.current,
    ...this.wrapperAttachment
  }));
  get wrapperProps() {
    return this.#wrapperProps();
  }
  set wrapperProps($$value) {
    return this.#wrapperProps($$value);
  }
  #props = derived(() => ({
    "data-side": this.placedSide,
    "data-align": this.placedAlign,
    style: styleToString({ ...this.#transformedStyle() }),
    ...this.contentAttachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  #arrowStyle = derived(() => ({
    position: "absolute",
    left: this.arrowX ? `${this.arrowX}px` : void 0,
    top: this.arrowY ? `${this.arrowY}px` : void 0,
    [this.arrowBaseSide]: 0,
    "transform-origin": { top: "", right: "0 0", bottom: "center 0", left: "100% 0" }[this.placedSide],
    transform: {
      top: "translateY(100%)",
      right: "translateY(50%) rotate(90deg) translateX(-50%)",
      bottom: "rotate(180deg)",
      left: "translateY(50%) rotate(-90deg) translateX(50%)"
    }[this.placedSide],
    visibility: this.cannotCenterArrow ? "hidden" : void 0
  }));
  get arrowStyle() {
    return this.#arrowStyle();
  }
  set arrowStyle($$value) {
    return this.#arrowStyle($$value);
  }
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.#updatePositionStrategy = opts.updatePositionStrategy;
    if (opts.customAnchor) {
      this.root.customAnchorNode.current = opts.customAnchor.current;
    }
    watch$1(() => opts.customAnchor.current, (customAnchor) => {
      this.root.customAnchorNode.current = customAnchor;
    });
    this.floating = useFloating({
      strategy: () => this.opts.strategy.current,
      placement: () => this.#desiredPlacement(),
      middleware: () => this.middleware,
      reference: this.root.anchorNode,
      open: () => this.opts.enabled.current,
      sideOffset: () => this.opts.sideOffset.current,
      alignOffset: () => this.opts.alignOffset.current
    });
    watch$1(() => this.contentRef.current, (contentNode) => {
      if (!contentNode || !this.opts.enabled.current) return;
      const win = getWindow(contentNode);
      const rafId = win.requestAnimationFrame(() => {
        if (this.contentRef.current !== contentNode || !this.opts.enabled.current) return;
        const zIndex = win.getComputedStyle(contentNode).zIndex;
        if (zIndex !== this.contentZIndex) {
          this.contentZIndex = zIndex;
        }
      });
      return () => {
        win.cancelAnimationFrame(rafId);
      };
    });
  }
}
class FloatingAnchorState {
  static create(opts, tooltip = false) {
    return tooltip ? new FloatingAnchorState(opts, FloatingTooltipRootContext.get()) : new FloatingAnchorState(opts, FloatingRootContext.get());
  }
  opts;
  root;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    if (opts.virtualEl && opts.virtualEl.current) {
      root.triggerNode = boxFrom(opts.virtualEl.current);
    } else {
      root.triggerNode = opts.ref;
    }
  }
}
function transformOrigin(options) {
  return {
    name: "transformOrigin",
    options,
    fn(data) {
      const { placement, rects, middlewareData } = data;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const isArrowHidden = cannotCenterArrow;
      const arrowWidth = isArrowHidden ? 0 : options.arrowWidth;
      const arrowHeight = isArrowHidden ? 0 : options.arrowHeight;
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const noArrowAlign = { start: "0%", center: "50%", end: "100%" }[placedAlign];
      const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
      const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;
      let x = "";
      let y = "";
      if (placedSide === "bottom") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${-arrowHeight}px`;
      } else if (placedSide === "top") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${rects.floating.height + arrowHeight}px`;
      } else if (placedSide === "right") {
        x = `${-arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      } else if (placedSide === "left") {
        x = `${rects.floating.width + arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      }
      return { data: { x, y } };
    }
  };
}
function getSideAndAlignFromPlacement(placement) {
  const [side, align = "center"] = placement.split("-");
  return [side, align];
}
function getSideFromPlacement(placement) {
  return getSideAndAlignFromPlacement(placement)[0];
}
function getAlignFromPlacement(placement) {
  return getSideAndAlignFromPlacement(placement)[1];
}
Floating_layer[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer.svelte";
function Floating_layer($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { children, tooltip = false } = $$props;
      FloatingRootState.create(tooltip);
      children?.($$renderer2);
      $$renderer2.push(`<!---->`);
    },
    Floating_layer
  );
}
Floating_layer.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Floating_layer_anchor[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer-anchor.svelte";
function Floating_layer_anchor($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { id: id2, children, virtualEl, ref, tooltip = false } = $$props;
      FloatingAnchorState.create(
        {
          id: boxWith(() => id2),
          virtualEl: boxWith(() => virtualEl),
          ref
        },
        tooltip
      );
      children?.($$renderer2);
      $$renderer2.push(`<!---->`);
    },
    Floating_layer_anchor
  );
}
Floating_layer_anchor.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Floating_layer_content[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer-content.svelte";
function Floating_layer_content($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        content,
        side = "bottom",
        sideOffset = 0,
        align = "center",
        alignOffset = 0,
        id: id2,
        arrowPadding = 0,
        avoidCollisions = true,
        collisionBoundary = [],
        collisionPadding = 0,
        hideWhenDetached = false,
        onPlaced = () => {
        },
        sticky = "partial",
        updatePositionStrategy = "optimized",
        strategy = "fixed",
        dir = "ltr",
        style: style2 = {},
        wrapperId = useId(),
        customAnchor = null,
        enabled,
        tooltip = false
      } = $$props;
      const contentState = FloatingContentState.create(
        {
          side: boxWith(() => side),
          sideOffset: boxWith(() => sideOffset),
          align: boxWith(() => align),
          alignOffset: boxWith(() => alignOffset),
          id: boxWith(() => id2),
          arrowPadding: boxWith(() => arrowPadding),
          avoidCollisions: boxWith(() => avoidCollisions),
          collisionBoundary: boxWith(() => collisionBoundary),
          collisionPadding: boxWith(() => collisionPadding),
          hideWhenDetached: boxWith(() => hideWhenDetached),
          onPlaced: boxWith(() => onPlaced),
          sticky: boxWith(() => sticky),
          updatePositionStrategy: boxWith(() => updatePositionStrategy),
          strategy: boxWith(() => strategy),
          dir: boxWith(() => dir),
          style: boxWith(() => style2),
          enabled: boxWith(() => enabled),
          wrapperId: boxWith(() => wrapperId),
          customAnchor: boxWith(() => customAnchor)
        },
        tooltip
      );
      const mergedProps = derived(() => mergeProps(contentState.wrapperProps, { style: { pointerEvents: "auto" } }));
      content?.($$renderer2, { props: contentState.props, wrapperProps: mergedProps() });
      $$renderer2.push(`<!---->`);
    },
    Floating_layer_content
  );
}
Floating_layer_content.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Floating_layer_content_static[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer-content-static.svelte";
function Floating_layer_content_static($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { content, onPlaced } = $$props;
      content?.($$renderer2, { props: {}, wrapperProps: {} });
      $$renderer2.push(`<!---->`);
    },
    Floating_layer_content_static
  );
}
Floating_layer_content_static.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Popper_content[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-content.svelte";
function Popper_content($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        content,
        isStatic = false,
        onPlaced,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      if (isStatic) {
        $$renderer2.push("<!--[0-->");
        Floating_layer_content_static($$renderer2, { content, onPlaced });
      } else {
        $$renderer2.push("<!--[-1-->");
        Floating_layer_content($$renderer2, spread_props([{ content, onPlaced }, restProps]));
      }
      $$renderer2.push(`<!--]-->`);
    },
    Popper_content
  );
}
Popper_content.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Popper_layer_inner[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer-inner.svelte";
function Popper_layer_inner($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        popper,
        onEscapeKeydown,
        escapeKeydownBehavior,
        preventOverflowTextSelection,
        id: id2,
        onPointerDown,
        onPointerUp,
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        avoidCollisions,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        updatePositionStrategy,
        strategy,
        dir,
        preventScroll,
        wrapperId,
        style: style2,
        onPlaced,
        onInteractOutside,
        onCloseAutoFocus,
        onOpenAutoFocus,
        onFocusOutside,
        interactOutsideBehavior = "close",
        loop: loop2,
        trapFocus = true,
        isValidEvent: isValidEvent2 = () => false,
        customAnchor = null,
        isStatic = false,
        enabled,
        ref,
        tooltip = false,
        contentPointerEvents = "auto",
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const resolvedPreventScroll = derived(() => preventScroll ?? true);
      const effectiveStrategy = derived(() => strategy ?? (resolvedPreventScroll() ? "fixed" : "absolute"));
      {
        let content = function($$renderer3, { props: floatingProps, wrapperProps }) {
          validate_snippet_args($$renderer3);
          if (restProps.forceMount && enabled) {
            $$renderer3.push("<!--[0-->");
            Scroll_lock($$renderer3, { preventScroll: resolvedPreventScroll() });
          } else if (!restProps.forceMount) {
            $$renderer3.push("<!--[1-->");
            Scroll_lock($$renderer3, { preventScroll: resolvedPreventScroll() });
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> `);
          {
            let focusScope = function($$renderer4, { props: focusScopeProps }) {
              validate_snippet_args($$renderer4);
              Escape_layer($$renderer4, {
                onEscapeKeydown,
                escapeKeydownBehavior,
                enabled,
                ref,
                children: prevent_snippet_stringification(($$renderer5) => {
                  {
                    let children = function($$renderer6, { props: dismissibleProps }) {
                      validate_snippet_args($$renderer6);
                      Text_selection_layer($$renderer6, {
                        id: id2,
                        preventOverflowTextSelection,
                        onPointerDown,
                        onPointerUp,
                        enabled,
                        ref,
                        children: prevent_snippet_stringification(($$renderer7) => {
                          popper?.($$renderer7, {
                            props: mergeProps(restProps, floatingProps, dismissibleProps, focusScopeProps, { style: { pointerEvents: contentPointerEvents } }),
                            wrapperProps
                          });
                          $$renderer7.push(`<!---->`);
                        })
                      });
                    };
                    prevent_snippet_stringification(children);
                    Dismissible_layer($$renderer5, {
                      id: id2,
                      onInteractOutside,
                      onFocusOutside,
                      interactOutsideBehavior,
                      isValidEvent: isValidEvent2,
                      enabled,
                      ref,
                      children
                    });
                  }
                })
              });
            };
            prevent_snippet_stringification(focusScope);
            Focus_scope($$renderer3, {
              onOpenAutoFocus,
              onCloseAutoFocus,
              loop: loop2,
              enabled,
              trapFocus,
              forceMount: restProps.forceMount,
              ref,
              focusScope
            });
          }
          $$renderer3.push(`<!---->`);
        };
        prevent_snippet_stringification(content);
        Popper_content($$renderer2, {
          isStatic,
          id: id2,
          side,
          sideOffset,
          align,
          alignOffset,
          arrowPadding,
          avoidCollisions,
          collisionBoundary,
          collisionPadding,
          sticky,
          hideWhenDetached,
          updatePositionStrategy,
          strategy: effectiveStrategy(),
          dir,
          wrapperId,
          style: style2,
          onPlaced,
          customAnchor,
          enabled,
          tooltip,
          content,
          $$slots: { content: true }
        });
      }
    },
    Popper_layer_inner
  );
}
Popper_layer_inner.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Popper_layer[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer.svelte";
function Popper_layer($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        popper,
        open,
        onEscapeKeydown,
        escapeKeydownBehavior,
        preventOverflowTextSelection,
        id: id2,
        onPointerDown,
        onPointerUp,
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        avoidCollisions,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        updatePositionStrategy,
        strategy,
        dir,
        preventScroll,
        wrapperId,
        style: style2,
        onPlaced,
        onInteractOutside,
        onCloseAutoFocus,
        onOpenAutoFocus,
        onFocusOutside,
        interactOutsideBehavior = "close",
        loop: loop2,
        trapFocus = true,
        isValidEvent: isValidEvent2 = () => false,
        customAnchor = null,
        isStatic = false,
        ref,
        shouldRender,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      if (shouldRender) {
        $$renderer2.push("<!--[0-->");
        Popper_layer_inner($$renderer2, spread_props([
          {
            popper,
            onEscapeKeydown,
            escapeKeydownBehavior,
            preventOverflowTextSelection,
            id: id2,
            onPointerDown,
            onPointerUp,
            side,
            sideOffset,
            align,
            alignOffset,
            arrowPadding,
            avoidCollisions,
            collisionBoundary,
            collisionPadding,
            sticky,
            hideWhenDetached,
            updatePositionStrategy,
            strategy,
            dir,
            preventScroll,
            wrapperId,
            style: style2,
            onPlaced,
            customAnchor,
            isStatic,
            enabled: open,
            onInteractOutside,
            onCloseAutoFocus,
            onOpenAutoFocus,
            interactOutsideBehavior,
            loop: loop2,
            trapFocus,
            isValidEvent: isValidEvent2,
            onFocusOutside,
            forceMount: false,
            ref
          },
          restProps
        ]));
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    },
    Popper_layer
  );
}
Popper_layer.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Popper_layer_force_mount[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer-force-mount.svelte";
function Popper_layer_force_mount($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        popper,
        onEscapeKeydown,
        escapeKeydownBehavior,
        preventOverflowTextSelection,
        id: id2,
        onPointerDown,
        onPointerUp,
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        avoidCollisions,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        updatePositionStrategy,
        strategy,
        dir,
        preventScroll,
        wrapperId,
        style: style2,
        onPlaced,
        onInteractOutside,
        onCloseAutoFocus,
        onOpenAutoFocus,
        onFocusOutside,
        interactOutsideBehavior = "close",
        loop: loop2,
        trapFocus = true,
        isValidEvent: isValidEvent2 = () => false,
        customAnchor = null,
        isStatic = false,
        enabled,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      Popper_layer_inner($$renderer2, spread_props([
        {
          popper,
          onEscapeKeydown,
          escapeKeydownBehavior,
          preventOverflowTextSelection,
          id: id2,
          onPointerDown,
          onPointerUp,
          side,
          sideOffset,
          align,
          alignOffset,
          arrowPadding,
          avoidCollisions,
          collisionBoundary,
          collisionPadding,
          sticky,
          hideWhenDetached,
          updatePositionStrategy,
          strategy,
          dir,
          preventScroll,
          wrapperId,
          style: style2,
          onPlaced,
          customAnchor,
          isStatic,
          enabled,
          onInteractOutside,
          onCloseAutoFocus,
          onOpenAutoFocus,
          interactOutsideBehavior,
          loop: loop2,
          trapFocus,
          isValidEvent: isValidEvent2,
          onFocusOutside
        },
        restProps,
        { forceMount: true }
      ]));
    },
    Popper_layer_force_mount
  );
}
Popper_layer_force_mount.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let isInside = false;
  const length = polygon.length;
  for (let i = 0, j = length - 1; i < length; j = i++) {
    const [xi, yi] = polygon[i] ?? [0, 0];
    const [xj, yj] = polygon[j] ?? [0, 0];
    const intersect = yi >= y !== yj >= y && x <= (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersect) {
      isInside = !isInside;
    }
  }
  return isInside;
}
function isInsideRect(point, rect) {
  return point[0] >= rect.left && point[0] <= rect.right && point[1] >= rect.top && point[1] <= rect.bottom;
}
function getSide(triggerRect, contentRect) {
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  const triggerCenterY = triggerRect.top + triggerRect.height / 2;
  const contentCenterX = contentRect.left + contentRect.width / 2;
  const contentCenterY = contentRect.top + contentRect.height / 2;
  const deltaX = contentCenterX - triggerCenterX;
  const deltaY = contentCenterY - triggerCenterY;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? "right" : "left";
  }
  return deltaY > 0 ? "bottom" : "top";
}
class SafePolygon {
  #opts;
  #buffer;
  #transitIntentTimeout;
  // tracks the cursor position when leaving trigger or content
  #exitPoint = null;
  // tracks what we're moving toward: "content" when leaving trigger, "trigger" when leaving content
  #exitTarget = null;
  #transitTargets = [];
  #trackedTriggerNode = null;
  #leaveFallbackRafId = null;
  #transitIntentTimeoutId = null;
  #cancelLeaveFallback() {
    if (this.#leaveFallbackRafId !== null) {
      cancelAnimationFrame(this.#leaveFallbackRafId);
      this.#leaveFallbackRafId = null;
    }
  }
  #scheduleLeaveFallback() {
    this.#cancelLeaveFallback();
    this.#leaveFallbackRafId = requestAnimationFrame(() => {
      this.#leaveFallbackRafId = null;
      if (!this.#exitPoint || !this.#exitTarget) return;
      this.#clearTracking();
      this.#opts.onPointerExit();
    });
  }
  #cancelTransitIntentTimeout() {
    if (this.#transitIntentTimeoutId !== null) {
      clearTimeout(this.#transitIntentTimeoutId);
      this.#transitIntentTimeoutId = null;
    }
  }
  #scheduleTransitIntentTimeout() {
    if (this.#transitIntentTimeout === null) return;
    this.#cancelTransitIntentTimeout();
    this.#transitIntentTimeoutId = window.setTimeout(
      () => {
        this.#transitIntentTimeoutId = null;
        if (!this.#exitPoint || !this.#exitTarget) return;
        this.#clearTracking();
        this.#opts.onPointerExit();
      },
      this.#transitIntentTimeout
    );
  }
  constructor(opts) {
    this.#opts = opts;
    this.#buffer = opts.buffer ?? 1;
    const transitIntentTimeout = opts.transitIntentTimeout;
    this.#transitIntentTimeout = typeof transitIntentTimeout === "number" && transitIntentTimeout > 0 ? transitIntentTimeout : null;
    watch$1([opts.triggerNode, opts.contentNode, opts.enabled], ([triggerNode, contentNode, enabled]) => {
      if (!triggerNode || !contentNode || !enabled) {
        this.#trackedTriggerNode = null;
        this.#clearTracking();
        return;
      }
      if (this.#trackedTriggerNode && this.#trackedTriggerNode !== triggerNode) {
        this.#clearTracking();
      }
      this.#trackedTriggerNode = triggerNode;
      const doc = getDocument(triggerNode);
      const handlePointerMove = (e) => {
        this.#onPointerMove([e.clientX, e.clientY], triggerNode, contentNode);
      };
      const handleTriggerLeave = (e) => {
        const target = e.relatedTarget;
        if (isElement(target) && contentNode.contains(target)) {
          return;
        }
        const ignoredTargets = this.#opts.ignoredTargets?.() ?? [];
        if (isElement(target) && ignoredTargets.some((n) => n === target || n.contains(target))) {
          return;
        }
        this.#transitTargets = isElement(target) && ignoredTargets.length > 0 ? ignoredTargets.filter((n) => target.contains(n)) : [];
        this.#exitPoint = [e.clientX, e.clientY];
        this.#exitTarget = "content";
        this.#scheduleLeaveFallback();
      };
      const handleTriggerEnter = () => {
        this.#clearTracking();
      };
      const handleContentEnter = () => {
        this.#clearTracking();
      };
      const handleContentLeave = (e) => {
        const target = e.relatedTarget;
        if (isElement(target) && triggerNode.contains(target)) {
          return;
        }
        this.#exitPoint = [e.clientX, e.clientY];
        this.#exitTarget = "trigger";
        this.#scheduleLeaveFallback();
      };
      return [
        on(doc, "pointermove", handlePointerMove),
        on(triggerNode, "pointerleave", handleTriggerLeave),
        on(triggerNode, "pointerenter", handleTriggerEnter),
        on(contentNode, "pointerenter", handleContentEnter),
        on(contentNode, "pointerleave", handleContentLeave)
      ].reduce(
        (acc, cleanup) => () => {
          acc();
          cleanup();
        },
        () => {
        }
      );
    });
  }
  #onPointerMove(clientPoint, triggerNode, contentNode) {
    if (!this.#exitPoint || !this.#exitTarget) return;
    this.#cancelLeaveFallback();
    this.#scheduleTransitIntentTimeout();
    const triggerRect = triggerNode.getBoundingClientRect();
    const contentRect = contentNode.getBoundingClientRect();
    if (this.#exitTarget === "content" && isInsideRect(clientPoint, contentRect)) {
      this.#clearTracking();
      return;
    }
    if (this.#exitTarget === "trigger" && isInsideRect(clientPoint, triggerRect)) {
      this.#clearTracking();
      return;
    }
    if (this.#exitTarget === "content" && this.#transitTargets.length > 0) {
      for (const transitTarget of this.#transitTargets) {
        const transitRect = transitTarget.getBoundingClientRect();
        if (isInsideRect(clientPoint, transitRect)) return;
        const transitSide = getSide(triggerRect, transitRect);
        const transitCorridor = this.#getCorridorPolygon(triggerRect, transitRect, transitSide);
        if (transitCorridor && isPointInPolygon(clientPoint, transitCorridor)) return;
      }
    }
    const side = getSide(triggerRect, contentRect);
    const corridorPoly = this.#getCorridorPolygon(triggerRect, contentRect, side);
    if (corridorPoly && isPointInPolygon(clientPoint, corridorPoly)) {
      return;
    }
    const targetRect = this.#exitTarget === "content" ? contentRect : triggerRect;
    const safePoly = this.#getSafePolygon(this.#exitPoint, targetRect, side, this.#exitTarget);
    if (isPointInPolygon(clientPoint, safePoly)) {
      return;
    }
    this.#clearTracking();
    this.#opts.onPointerExit();
  }
  #clearTracking() {
    this.#exitPoint = null;
    this.#exitTarget = null;
    this.#transitTargets = [];
    this.#cancelLeaveFallback();
    this.#cancelTransitIntentTimeout();
  }
  /**
   * Creates a rectangular corridor between trigger and content
   * This prevents closing when cursor is in the gap between them
   */
  #getCorridorPolygon(triggerRect, contentRect, side) {
    const buffer = this.#buffer;
    switch (side) {
      case "top":
        return [
          [
            Math.min(triggerRect.left, contentRect.left) - buffer,
            triggerRect.top
          ],
          [
            Math.min(triggerRect.left, contentRect.left) - buffer,
            contentRect.bottom
          ],
          [
            Math.max(triggerRect.right, contentRect.right) + buffer,
            contentRect.bottom
          ],
          [
            Math.max(triggerRect.right, contentRect.right) + buffer,
            triggerRect.top
          ]
        ];
      case "bottom":
        return [
          [
            Math.min(triggerRect.left, contentRect.left) - buffer,
            triggerRect.bottom
          ],
          [
            Math.min(triggerRect.left, contentRect.left) - buffer,
            contentRect.top
          ],
          [
            Math.max(triggerRect.right, contentRect.right) + buffer,
            contentRect.top
          ],
          [
            Math.max(triggerRect.right, contentRect.right) + buffer,
            triggerRect.bottom
          ]
        ];
      case "left":
        return [
          [
            triggerRect.left,
            Math.min(triggerRect.top, contentRect.top) - buffer
          ],
          [
            contentRect.right,
            Math.min(triggerRect.top, contentRect.top) - buffer
          ],
          [
            contentRect.right,
            Math.max(triggerRect.bottom, contentRect.bottom) + buffer
          ],
          [
            triggerRect.left,
            Math.max(triggerRect.bottom, contentRect.bottom) + buffer
          ]
        ];
      case "right":
        return [
          [
            triggerRect.right,
            Math.min(triggerRect.top, contentRect.top) - buffer
          ],
          [
            contentRect.left,
            Math.min(triggerRect.top, contentRect.top) - buffer
          ],
          [
            contentRect.left,
            Math.max(triggerRect.bottom, contentRect.bottom) + buffer
          ],
          [
            triggerRect.right,
            Math.max(triggerRect.bottom, contentRect.bottom) + buffer
          ]
        ];
    }
  }
  /**
   * Creates a triangular/trapezoidal safe zone from the exit point to the target
   */
  #getSafePolygon(exitPoint, targetRect, side, exitTarget) {
    const buffer = this.#buffer * 4;
    const [x, y] = exitPoint;
    const effectiveSide = exitTarget === "trigger" ? this.#flipSide(side) : side;
    switch (effectiveSide) {
      case "top":
        return [
          [x - buffer, y + buffer],
          [x + buffer, y + buffer],
          [targetRect.right + buffer, targetRect.bottom],
          [targetRect.right + buffer, targetRect.top],
          [targetRect.left - buffer, targetRect.top],
          [targetRect.left - buffer, targetRect.bottom]
        ];
      case "bottom":
        return [
          [x - buffer, y - buffer],
          [x + buffer, y - buffer],
          [targetRect.right + buffer, targetRect.top],
          [targetRect.right + buffer, targetRect.bottom],
          [targetRect.left - buffer, targetRect.bottom],
          [targetRect.left - buffer, targetRect.top]
        ];
      case "left":
        return [
          [x + buffer, y - buffer],
          [x + buffer, y + buffer],
          [targetRect.right, targetRect.bottom + buffer],
          [targetRect.left, targetRect.bottom + buffer],
          [targetRect.left, targetRect.top - buffer],
          [targetRect.right, targetRect.top - buffer]
        ];
      case "right":
        return [
          [x - buffer, y - buffer],
          [x - buffer, y + buffer],
          [targetRect.left, targetRect.bottom + buffer],
          [targetRect.right, targetRect.bottom + buffer],
          [targetRect.right, targetRect.top - buffer],
          [targetRect.left, targetRect.top - buffer]
        ];
    }
  }
  #flipSide(side) {
    switch (side) {
      case "top":
        return "bottom";
      case "bottom":
        return "top";
      case "left":
        return "right";
      case "right":
        return "left";
    }
  }
}
const popoverAttrs = createBitsAttrs({
  component: "popover",
  parts: ["root", "trigger", "content", "close", "overlay"]
});
const PopoverRootContext = new Context$1("Popover.Root");
class PopoverRootState {
  static create(opts) {
    return PopoverRootContext.set(new PopoverRootState(opts));
  }
  opts;
  contentNode = null;
  contentPresence;
  triggerNode = null;
  overlayNode = null;
  overlayPresence;
  // hover tracking state
  openedViaHover = false;
  hasInteractedWithContent = false;
  hoverCooldown = false;
  closeDelay = 0;
  #closeTimeout = null;
  #domContext = null;
  constructor(opts) {
    this.opts = opts;
    this.contentPresence = new PresenceManager({
      ref: boxWith(() => this.contentNode),
      open: this.opts.open,
      onComplete: () => {
        this.opts.onOpenChangeComplete.current(this.opts.open.current);
      }
    });
    this.overlayPresence = new PresenceManager({ ref: boxWith(() => this.overlayNode), open: this.opts.open });
    watch$1(() => this.opts.open.current, (isOpen) => {
      if (!isOpen) {
        this.openedViaHover = false;
        this.hasInteractedWithContent = false;
        this.#clearCloseTimeout();
      }
    });
  }
  setDomContext(ctx) {
    this.#domContext = ctx;
  }
  #clearCloseTimeout() {
    if (this.#closeTimeout !== null && this.#domContext) {
      this.#domContext.clearTimeout(this.#closeTimeout);
      this.#closeTimeout = null;
    }
  }
  toggleOpen() {
    this.#clearCloseTimeout();
    this.opts.open.current = !this.opts.open.current;
  }
  handleClose() {
    this.#clearCloseTimeout();
    if (!this.opts.open.current) return;
    this.opts.open.current = false;
  }
  handleHoverOpen() {
    this.#clearCloseTimeout();
    if (this.opts.open.current) return;
    this.openedViaHover = true;
    this.opts.open.current = true;
  }
  handleHoverClose() {
    if (!this.opts.open.current) return;
    if (this.openedViaHover && !this.hasInteractedWithContent) {
      this.opts.open.current = false;
    }
  }
  handleDelayedHoverClose() {
    if (!this.opts.open.current) return;
    if (!this.openedViaHover || this.hasInteractedWithContent) return;
    this.#clearCloseTimeout();
    if (this.closeDelay <= 0) {
      this.opts.open.current = false;
    } else if (this.#domContext) {
      this.#closeTimeout = this.#domContext.setTimeout(
        () => {
          if (this.openedViaHover && !this.hasInteractedWithContent) {
            this.opts.open.current = false;
          }
          this.#closeTimeout = null;
        },
        this.closeDelay
      );
    }
  }
  cancelDelayedClose() {
    this.#clearCloseTimeout();
  }
  markInteraction() {
    this.hasInteractedWithContent = true;
    this.#clearCloseTimeout();
  }
}
class PopoverTriggerState {
  static create(opts) {
    return new PopoverTriggerState(opts, PopoverRootContext.get());
  }
  opts;
  root;
  attachment;
  domContext;
  #openTimeout = null;
  #closeTimeout = null;
  #isHovering = false;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => this.root.triggerNode = v);
    this.domContext = new DOMContext(opts.ref);
    this.root.setDomContext(this.domContext);
    this.onclick = this.onclick.bind(this);
    this.onkeydown = this.onkeydown.bind(this);
    this.onpointerenter = this.onpointerenter.bind(this);
    this.onpointerleave = this.onpointerleave.bind(this);
    watch$1(() => this.opts.closeDelay.current, (delay2) => {
      this.root.closeDelay = delay2;
    });
  }
  #clearOpenTimeout() {
    if (this.#openTimeout !== null) {
      this.domContext.clearTimeout(this.#openTimeout);
      this.#openTimeout = null;
    }
  }
  #clearCloseTimeout() {
    if (this.#closeTimeout !== null) {
      this.domContext.clearTimeout(this.#closeTimeout);
      this.#closeTimeout = null;
    }
  }
  #clearAllTimeouts() {
    this.#clearOpenTimeout();
    this.#clearCloseTimeout();
  }
  onpointerenter(e) {
    if (this.opts.disabled.current) return;
    if (!this.opts.openOnHover.current) return;
    if (isTouch(e)) return;
    this.#isHovering = true;
    this.#clearCloseTimeout();
    this.root.cancelDelayedClose();
    if (this.root.opts.open.current || this.root.hoverCooldown) return;
    const delay2 = this.opts.openDelay.current;
    if (delay2 <= 0) {
      this.root.handleHoverOpen();
    } else {
      this.#openTimeout = this.domContext.setTimeout(
        () => {
          this.root.handleHoverOpen();
          this.#openTimeout = null;
        },
        delay2
      );
    }
  }
  onpointerleave(e) {
    if (this.opts.disabled.current) return;
    if (!this.opts.openOnHover.current) return;
    if (isTouch(e)) return;
    this.#isHovering = false;
    this.#clearOpenTimeout();
    this.root.hoverCooldown = false;
  }
  onclick(e) {
    if (this.opts.disabled.current) return;
    if (e.button !== 0) return;
    this.#clearAllTimeouts();
    if (this.#isHovering && this.root.opts.open.current && this.root.openedViaHover) {
      this.root.openedViaHover = false;
      this.root.hasInteractedWithContent = true;
      return;
    }
    if (this.#isHovering && this.opts.openOnHover.current && this.root.opts.open.current) {
      this.root.hoverCooldown = true;
    }
    if (this.root.hoverCooldown && !this.root.opts.open.current) {
      this.root.hoverCooldown = false;
    }
    this.root.toggleOpen();
  }
  onkeydown(e) {
    if (this.opts.disabled.current) return;
    if (!(e.key === ENTER || e.key === SPACE)) return;
    e.preventDefault();
    this.#clearAllTimeouts();
    this.root.toggleOpen();
  }
  #getAriaControls() {
    if (this.root.opts.open.current && this.root.contentNode?.id) {
      return this.root.contentNode?.id;
    }
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    "aria-haspopup": "dialog",
    "aria-expanded": boolToStr(this.root.opts.open.current),
    "data-state": getDataOpenClosed(this.root.opts.open.current),
    "aria-controls": this.#getAriaControls(),
    [popoverAttrs.trigger]: "",
    disabled: this.opts.disabled.current,
    //
    onkeydown: this.onkeydown,
    onclick: this.onclick,
    onpointerenter: this.onpointerenter,
    onpointerleave: this.onpointerleave,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class PopoverContentState {
  static create(opts) {
    return new PopoverContentState(opts, PopoverRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => this.root.contentNode = v);
    this.onpointerdown = this.onpointerdown.bind(this);
    this.onfocusin = this.onfocusin.bind(this);
    this.onpointerenter = this.onpointerenter.bind(this);
    this.onpointerleave = this.onpointerleave.bind(this);
    new SafePolygon({
      triggerNode: () => this.root.triggerNode,
      contentNode: () => this.root.contentNode,
      enabled: () => this.root.opts.open.current && this.root.openedViaHover && !this.root.hasInteractedWithContent,
      onPointerExit: () => {
        this.root.handleDelayedHoverClose();
      }
    });
  }
  onpointerdown(_) {
    this.root.markInteraction();
  }
  onfocusin(e) {
    const target = e.target;
    if (isElement(target) && isTabbable(target)) {
      this.root.markInteraction();
    }
  }
  onpointerenter(e) {
    if (isTouch(e)) return;
    this.root.cancelDelayedClose();
  }
  onpointerleave(e) {
    if (isTouch(e)) return;
  }
  onInteractOutside = (e) => {
    this.opts.onInteractOutside.current(e);
    if (e.defaultPrevented) return;
    if (!isElement(e.target)) return;
    const closestTrigger = e.target.closest(popoverAttrs.selector("trigger"));
    if (closestTrigger && closestTrigger === this.root.triggerNode) return;
    if (this.opts.customAnchor.current) {
      if (isElement(this.opts.customAnchor.current)) {
        if (this.opts.customAnchor.current.contains(e.target)) return;
      } else if (typeof this.opts.customAnchor.current === "string") {
        const el = document.querySelector(this.opts.customAnchor.current);
        if (el && el.contains(e.target)) return;
      }
    }
    this.root.handleClose();
  };
  onEscapeKeydown = (e) => {
    this.opts.onEscapeKeydown.current(e);
    if (e.defaultPrevented) return;
    this.root.handleClose();
  };
  get shouldRender() {
    return this.root.contentPresence.shouldRender;
  }
  get shouldTrapFocus() {
    if (this.root.openedViaHover && !this.root.hasInteractedWithContent) return false;
    return true;
  }
  #snippetProps = derived(() => ({ open: this.root.opts.open.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    tabindex: -1,
    "data-state": getDataOpenClosed(this.root.opts.open.current),
    ...getDataTransitionAttrs(this.root.contentPresence.transitionStatus),
    [popoverAttrs.content]: "",
    style: { pointerEvents: "auto", contain: "layout style" },
    onpointerdown: this.onpointerdown,
    onfocusin: this.onfocusin,
    onpointerenter: this.onpointerenter,
    onpointerleave: this.onpointerleave,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  popperProps = {
    onInteractOutside: this.onInteractOutside,
    onEscapeKeydown: this.onEscapeKeydown
  };
}
Popover_content[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/popover/components/popover-content.svelte";
function Popover_content($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const uid = props_id($$renderer2);
      let {
        child,
        children,
        ref = null,
        id: id2 = createId(uid),
        forceMount = false,
        onOpenAutoFocus = noop,
        onCloseAutoFocus = noop,
        onEscapeKeydown = noop,
        onInteractOutside = noop,
        trapFocus = true,
        preventScroll = false,
        customAnchor = null,
        style: style2,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const contentState = PopoverContentState.create({
        id: boxWith(() => id2),
        ref: boxWith(() => ref, (v) => ref = v),
        onInteractOutside: boxWith(() => onInteractOutside),
        onEscapeKeydown: boxWith(() => onEscapeKeydown),
        customAnchor: boxWith(() => customAnchor)
      });
      const mergedProps = derived(() => mergeProps(restProps, contentState.props));
      const effectiveTrapFocus = derived(() => trapFocus && contentState.shouldTrapFocus);
      function handleOpenAutoFocus(e) {
        if (!contentState.shouldTrapFocus) {
          e.preventDefault();
        }
        onOpenAutoFocus(e);
      }
      if (forceMount) {
        $$renderer2.push("<!--[0-->");
        {
          let popper = function($$renderer3, { props, wrapperProps }) {
            validate_snippet_args($$renderer3);
            const finalProps = mergeProps(props, { style: getFloatingContentCSSVars("popover") }, { style: style2 });
            if (child) {
              $$renderer3.push("<!--[0-->");
              child($$renderer3, {
                props: finalProps,
                wrapperProps,
                ...contentState.snippetProps
              });
              $$renderer3.push(`<!---->`);
            } else {
              $$renderer3.push("<!--[-1-->");
              $$renderer3.push(`<div${attributes({ ...wrapperProps })}>`);
              push_element($$renderer3, "div", 80, 4);
              $$renderer3.push(`<div${attributes({ ...finalProps })}>`);
              push_element($$renderer3, "div", 81, 5);
              children?.($$renderer3);
              $$renderer3.push(`<!----></div>`);
              pop_element();
              $$renderer3.push(`</div>`);
              pop_element();
            }
            $$renderer3.push(`<!--]-->`);
          };
          prevent_snippet_stringification(popper);
          Popper_layer_force_mount($$renderer2, spread_props([
            mergedProps(),
            contentState.popperProps,
            {
              ref: contentState.opts.ref,
              enabled: contentState.root.opts.open.current,
              id: id2,
              trapFocus: effectiveTrapFocus(),
              preventScroll,
              loop: true,
              forceMount: true,
              customAnchor,
              onOpenAutoFocus: handleOpenAutoFocus,
              onCloseAutoFocus,
              shouldRender: contentState.shouldRender,
              popper,
              $$slots: { popper: true }
            }
          ]));
        }
      } else if (!forceMount) {
        $$renderer2.push("<!--[1-->");
        {
          let popper = function($$renderer3, { props, wrapperProps }) {
            validate_snippet_args($$renderer3);
            const finalProps = mergeProps(props, { style: getFloatingContentCSSVars("popover") }, { style: style2 });
            if (child) {
              $$renderer3.push("<!--[0-->");
              child($$renderer3, {
                props: finalProps,
                wrapperProps,
                ...contentState.snippetProps
              });
              $$renderer3.push(`<!---->`);
            } else {
              $$renderer3.push("<!--[-1-->");
              $$renderer3.push(`<div${attributes({ ...wrapperProps })}>`);
              push_element($$renderer3, "div", 113, 4);
              $$renderer3.push(`<div${attributes({ ...finalProps })}>`);
              push_element($$renderer3, "div", 114, 5);
              children?.($$renderer3);
              $$renderer3.push(`<!----></div>`);
              pop_element();
              $$renderer3.push(`</div>`);
              pop_element();
            }
            $$renderer3.push(`<!--]-->`);
          };
          prevent_snippet_stringification(popper);
          Popper_layer($$renderer2, spread_props([
            mergedProps(),
            contentState.popperProps,
            {
              ref: contentState.opts.ref,
              open: contentState.root.opts.open.current,
              id: id2,
              trapFocus: effectiveTrapFocus(),
              preventScroll,
              loop: true,
              forceMount: false,
              customAnchor,
              onOpenAutoFocus: handleOpenAutoFocus,
              onCloseAutoFocus,
              shouldRender: contentState.shouldRender,
              popper,
              $$slots: { popper: true }
            }
          ]));
        }
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Popover_content
  );
}
Popover_content.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Popover_trigger[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/popover/components/popover-trigger.svelte";
function Popover_trigger($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const uid = props_id($$renderer2);
      let {
        children,
        child,
        id: id2 = createId(uid),
        ref = null,
        type = "button",
        disabled = false,
        openOnHover = false,
        openDelay = 700,
        closeDelay = 300,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const triggerState = PopoverTriggerState.create({
        id: boxWith(() => id2),
        ref: boxWith(() => ref, (v) => ref = v),
        disabled: boxWith(() => Boolean(disabled)),
        openOnHover: boxWith(() => openOnHover),
        openDelay: boxWith(() => openDelay),
        closeDelay: boxWith(() => closeDelay)
      });
      const mergedProps = derived(() => mergeProps(restProps, triggerState.props, { type }));
      Floating_layer_anchor($$renderer2, {
        id: id2,
        ref: triggerState.opts.ref,
        children: prevent_snippet_stringification(($$renderer3) => {
          if (child) {
            $$renderer3.push("<!--[0-->");
            child($$renderer3, { props: mergedProps() });
            $$renderer3.push(`<!---->`);
          } else {
            $$renderer3.push("<!--[-1-->");
            $$renderer3.push(`<button${attributes({ ...mergedProps() })}>`);
            push_element($$renderer3, "button", 42, 2);
            children?.($$renderer3);
            $$renderer3.push(`<!----></button>`);
            pop_element();
          }
          $$renderer3.push(`<!--]-->`);
        })
      });
      bind_props($$props, { ref });
    },
    Popover_trigger
  );
}
Popover_trigger.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Popover[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/bits-ui/dist/bits/popover/components/popover.svelte";
function Popover($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        open = false,
        onOpenChange = noop,
        onOpenChangeComplete = noop,
        children
      } = $$props;
      PopoverRootState.create({
        open: boxWith(() => open, (v) => {
          open = v;
          onOpenChange(v);
        }),
        onOpenChangeComplete: boxWith(() => onOpenChangeComplete)
      });
      Floating_layer($$renderer2, {
        children: prevent_snippet_stringification(($$renderer3) => {
          children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        })
      });
      bind_props($$props, { open });
    },
    Popover
  );
}
Popover.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
ConfirmDialog[FILENAME] = "src/desktop-renderer/components/ui/dialog/ConfirmDialog.svelte";
function ConfirmDialog($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        open = false,
        title,
        description = "",
        confirmLabel = "Confirm",
        cancelLabel = "Cancel",
        destructive = false,
        error = "",
        busy = false,
        dontShowAgainLabel = "",
        onConfirm
        /** Set to show an error inside the dialog (keeps it open). */
        /** When set, renders a "don't warn me again" checkbox with this label. */
        /** When `dontShowAgainLabel` is set: called with the checkbox's value on
         *  confirm (true = suppress future warnings). Never called on cancel. */
      } = $$props;
      let dontShowAgain = false;
      let $$settled = true;
      let $$inner_renderer;
      function $$render_inner($$renderer3) {
        if (Alert_dialog) {
          $$renderer3.push("<!--[-->");
          Alert_dialog($$renderer3, {
            get open() {
              return open;
            },
            set open($$value) {
              open = $$value;
              $$settled = false;
            },
            children: prevent_snippet_stringification(($$renderer4) => {
              if (Portal) {
                $$renderer4.push("<!--[-->");
                Portal($$renderer4, {
                  children: prevent_snippet_stringification(($$renderer5) => {
                    if (Dialog_overlay) {
                      $$renderer5.push("<!--[-->");
                      Dialog_overlay($$renderer5, { class: "fixed inset-0 z-50 bg-black/40" });
                      $$renderer5.push("<!--]-->");
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push("<!--]-->");
                    }
                    $$renderer5.push(` `);
                    if (Alert_dialog_content) {
                      $$renderer5.push("<!--[-->");
                      Alert_dialog_content($$renderer5, {
                        class: "fixed top-1/2 z-50 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-strong bg-surface p-5 shadow-2xl",
                        style: "left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)",
                        "data-testid": "confirm-dialog",
                        children: prevent_snippet_stringification(($$renderer6) => {
                          if (Dialog_title) {
                            $$renderer6.push("<!--[-->");
                            Dialog_title($$renderer6, {
                              class: "text-sm font-semibold text-fg",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(title)}`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(` `);
                          if (description) {
                            $$renderer6.push("<!--[0-->");
                            if (Dialog_description) {
                              $$renderer6.push("<!--[-->");
                              Dialog_description($$renderer6, {
                                class: "mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-fg-soft",
                                children: prevent_snippet_stringification(($$renderer7) => {
                                  $$renderer7.push(`<!---->${escape_html(description)}`);
                                }),
                                $$slots: { default: true }
                              });
                              $$renderer6.push("<!--]-->");
                            } else {
                              $$renderer6.push("<!--[!-->");
                              $$renderer6.push("<!--]-->");
                            }
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--> `);
                          if (error) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<p class="mt-3 rounded-lg border border-danger-border/50 bg-danger-surface/20 px-3 py-2 text-[12px] text-danger">`);
                            push_element($$renderer6, "p", 56, 8);
                            $$renderer6.push(`${escape_html(error)}</p>`);
                            pop_element();
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--> `);
                          if (dontShowAgainLabel) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<label class="mt-3 flex items-center gap-2 text-[12px] text-fg-soft">`);
                            push_element($$renderer6, "label", 61, 8);
                            $$renderer6.push(`<input type="checkbox"${attr("checked", dontShowAgain, true)} data-testid="confirm-dialog-dont-show-again"/>`);
                            push_element($$renderer6, "input", 62, 10);
                            pop_element();
                            $$renderer6.push(` ${escape_html(dontShowAgainLabel)}</label>`);
                            pop_element();
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--> <div class="mt-4 flex justify-end gap-2">`);
                          push_element($$renderer6, "div", 66, 6);
                          if (Alert_dialog_cancel) {
                            $$renderer6.push("<!--[-->");
                            Alert_dialog_cancel($$renderer6, {
                              class: "rounded-lg border border-border px-3 py-1.5 text-[13px] text-fg-soft hover:bg-surface-2",
                              disabled: busy,
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(cancelLabel)}`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(` `);
                          if (Alert_dialog_action) {
                            $$renderer6.push("<!--[-->");
                            Alert_dialog_action($$renderer6, {
                              onclick: () => onConfirm(dontShowAgainLabel ? dontShowAgain : void 0),
                              disabled: busy,
                              "data-testid": "confirm-dialog-action",
                              class: `rounded-lg border px-3 py-1.5 text-[13px] font-medium disabled:opacity-50
            ${destructive ? "border-danger-border/60 bg-danger-surface/50 text-danger hover:bg-danger-surface/80" : "border-border-strong bg-surface-2 text-fg hover:bg-surface-3"}`,
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(busy ? "…" : confirmLabel)}`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(`</div>`);
                          pop_element();
                        }),
                        $$slots: { default: true }
                      });
                      $$renderer5.push("<!--]-->");
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push("<!--]-->");
                    }
                  })
                });
                $$renderer4.push("<!--]-->");
              } else {
                $$renderer4.push("<!--[!-->");
                $$renderer4.push("<!--]-->");
              }
            }),
            $$slots: { default: true }
          });
          $$renderer3.push("<!--]-->");
        } else {
          $$renderer3.push("<!--[!-->");
          $$renderer3.push("<!--]-->");
        }
      }
      do {
        $$settled = true;
        $$inner_renderer = $$renderer2.copy();
        $$render_inner($$inner_renderer);
      } while (!$$settled);
      $$renderer2.subsume($$inner_renderer);
      bind_props($$props, { open });
    },
    ConfirmDialog
  );
}
ConfirmDialog.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
class UsageStore {
  summaries = [];
  loading = false;
  refreshing = false;
  error = "";
  poll = null;
  started = false;
  async load() {
    if (this.loading) return;
    this.loading = true;
    this.error = "";
    try {
      this.summaries = await api.invoke("usage:list");
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }
  async refresh() {
    this.refreshing = true;
    this.error = "";
    try {
      this.summaries = await api.invoke("usage:refresh");
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.refreshing = false;
    }
  }
  /** Start the ~60s auto-refresh; stops on `stop()` (view unmount). */
  startPolling() {
    this.stopPolling();
    this.poll = setInterval(() => void this.load(), 6e4);
  }
  stopPolling() {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
  /** App-wide init: load once, listen for live updates, start polling.
   *  Call from App onMount so the sidebar metric line has data without
   *  opening the Usage view. Idempotent. */
  init() {
    if (this.started) return;
    this.started = true;
    void this.load();
    api.on("event:usageChanged", () => void this.load());
    this.startPolling();
  }
}
const usage = new UsageStore();
const HIGHLIGHTS_KEY = "peachpi:usageHighlights";
const HIDDEN_KEY = "peachpi:usageHidden";
const highlightsPref = mapPref(HIGHLIGHTS_KEY);
const hiddenPref = arrayPref(HIDDEN_KEY);
function reload(store2) {
  store2.highlights = highlightsPref.read();
  store2.hidden = hiddenPref.read();
}
class UsagePrefsStore {
  /** provider → list of chosen metric keys (pinned to sidebar line). */
  highlights = {};
  /** Providers hidden from the sidebar line + popover. */
  hidden = [];
  initialized = false;
  /** Load persisted prefs and start cross-window sync. Idempotent. */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    reload(this);
    window.addEventListener("storage", (e) => {
      if (e.key === HIGHLIGHTS_KEY || e.key === HIDDEN_KEY || e.key === null) reload(this);
    });
  }
  /** Pinned keys for a provider. `undefined` = never touched (use default
   *  first metric); `[]` = explicitly unpinned (show nothing in sidebar). */
  keysFor(provider) {
    return this.highlights[provider];
  }
  /** Toggle a metric key on/off for `provider`, preserving order. */
  pin(provider, metricKey) {
    const cur = this.highlights[provider] ?? [];
    const next = cur.includes(metricKey) ? cur.filter((k) => k !== metricKey) : [...cur, metricKey];
    this.highlights = { ...this.highlights, [provider]: next };
    highlightsPref.write(this.highlights);
  }
  /** Reset a provider to its default featured metric (clear any pins). */
  reset(provider) {
    const next = { ...this.highlights };
    delete next[provider];
    this.highlights = next;
    highlightsPref.write(this.highlights);
  }
  /** Explicitly show nothing for `provider` in the sidebar line, while keeping
   *  it visible in the popover (unpin all, vs `toggleHidden`). */
  unpinAll(provider) {
    this.highlights = { ...this.highlights, [provider]: [] };
    highlightsPref.write(this.highlights);
  }
  isHidden(provider) {
    return this.hidden.includes(provider);
  }
  /** Hide a provider from the sidebar line + popover. */
  toggleHidden(provider) {
    this.hidden = this.hidden.includes(provider) ? this.hidden.filter((p) => p !== provider) : [...this.hidden, provider];
    hiddenPref.write(this.hidden);
  }
  /** Reveal every hidden provider. */
  showAll() {
    this.hidden = [];
    hiddenPref.write([]);
  }
}
const usagePrefs = new UsagePrefsStore();
const SHORT_TAG = {
  anthropic: "An",
  zai: "Za",
  xiaomi: "Mi",
  openrouter: "OR",
  neuralwatt: "NW"
};
function shortTag(provider) {
  return SHORT_TAG[provider] ?? provider.slice(0, 2);
}
function fmtMoney(v) {
  return `$${v.toFixed(2)}`;
}
function quotaUrgency(remainingPct) {
  return Math.max(0, Math.min(1, (100 - remainingPct) / 100));
}
function metricOptions(s) {
  if (!s.configured || !s.summary) return [];
  const sum = s.summary;
  if (sum.kind === "quota") {
    const opts2 = [];
    if (sum.fiveHours) {
      const p = sum.fiveHours.remainingPct;
      opts2.push({ key: "5h", label: "5-hour window", short: "5h", value: `${Math.round(p)}%`, urgency: quotaUrgency(p), resetAt: sum.fiveHours.resetAt, remainingPct: p });
    }
    if (sum.weekly) {
      const p = sum.weekly.remainingPct;
      opts2.push({ key: "weekly", label: "Weekly window", short: "wk", value: `${Math.round(p)}%`, urgency: quotaUrgency(p), resetAt: sum.weekly.resetAt, remainingPct: p });
    }
    return opts2;
  }
  const opts = [];
  if (sum.balanceUSD !== null) {
    opts.push({
      key: "remaining",
      label: "Remaining",
      short: "rem",
      value: fmtMoney(sum.balanceUSD),
      urgency: balanceUrgency(sum.balanceUSD),
      resetAt: null,
      remainingPct: null
    });
  }
  if (sum.spentMonth !== null) {
    opts.push({ key: "month", label: "This month", short: "mo", value: fmtMoney(sum.spentMonth), urgency: 0.3, resetAt: null, remainingPct: null });
  }
  if (sum.spentWeek !== null) {
    opts.push({ key: "week", label: "This week", short: "wk", value: fmtMoney(sum.spentWeek), urgency: 0.3, resetAt: null, remainingPct: null });
  }
  if (sum.spentDay !== null) {
    opts.push({ key: "day", label: "Today", short: "day", value: fmtMoney(sum.spentDay), urgency: 0.3, resetAt: null, remainingPct: null });
  }
  return opts;
}
function fmtResetsIn(resetAt, now2) {
  if (!resetAt) return "";
  const ms = Date.parse(resetAt) - now2;
  if (ms <= 0) return "soon";
  const hours = ms / 36e5;
  if (hours < 1) return `${Math.floor(ms / 6e4)}m`;
  return `${Math.round(hours)}h`;
}
function balanceUrgency(remaining) {
  if (remaining < 5) return 1;
  if (remaining < 20) return 0.75;
  if (remaining < 50) return 0.45;
  return 0.2;
}
function featuredMetrics(s, keys) {
  const opts = metricOptions(s);
  if (opts.length === 0) return [];
  if (keys === void 0) return [opts[0]];
  if (keys.length === 0) return [];
  return opts.filter((o) => keys.includes(o.key));
}
function urgencyClass(u) {
  if (u >= 0.9) return "text-danger";
  if (u >= 0.7) return "text-warning";
  return "text-fg-soft";
}
Sidebar[FILENAME] = "src/desktop-renderer/app/Sidebar.svelte";
function Sidebar($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        width = 280,
        projects,
        worktrees,
        threads,
        automationCount = 0,
        selectedThreadId,
        activeView,
        collapsedProjects = [],
        onSelect,
        onNewThread,
        onNewWorktree,
        onNewChat,
        onOpenView,
        onOpenTesting,
        onOpenWorkQueue,
        onOpenSearch,
        onReloadAll,
        onGoBack,
        onGoForward,
        canGoBack = false,
        canGoForward = false,
        remoteFirst = false
        /** Remote-first mode on: the Remote item glows red + pulses. */
      } = $$props;
      let expanded = {};
      let snoozePickerFor = null;
      let snoozedPopoverFor = null;
      let snoozeAnchor = null;
      let snoozedListAnchor = null;
      let doneAnimFor = null;
      let testAnimFor = null;
      let archivingIds = new SvelteSet();
      let reloading = false;
      let draggedId = null;
      let dragOverId = null;
      function isCollapsed(projectId) {
        return collapsedProjects.includes(projectId);
      }
      const featuredLine = derived(() => usage.summaries.filter((s) => !usagePrefs.isHidden(s.provider)).flatMap((s) => featuredMetrics(s, usagePrefs.keysFor(s.provider)).map((m) => ({ provider: s.provider, key: m.key, m }))));
      let now2 = Date.now();
      function relativeTime(iso, ref) {
        const m = Math.floor((ref - new Date(iso).getTime()) / 6e4);
        if (m < 1) return "now";
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h`;
        return `${Math.floor(h / 24)}d`;
      }
      const chats = derived(() => threads.filter((t) => t.projectId === null && !t.remoteHostId));
      const remoteGroups = derived(() => {
        const byHost = /* @__PURE__ */ new Map();
        for (const t of threads) {
          if (!t.remoteHostId) continue;
          const h = byHost.get(t.remoteHostId) ?? { name: t.remoteHostName ?? "Remote", projects: /* @__PURE__ */ new Map() };
          const pname = t.remoteProjectName ?? "Chats";
          const arr = h.projects.get(pname) ?? [];
          arr.push(t);
          h.projects.set(pname, arr);
          byHost.set(t.remoteHostId, h);
        }
        return [...byHost.entries()].map(([id2, h]) => ({
          id: id2,
          name: h.name,
          projects: [...h.projects.entries()].map(([name, projectThreads]) => ({ name, threads: projectThreads }))
        }));
      });
      function partition(list) {
        return {
          // A thread that just woke from snooze (wokeFromSnoozeAt set) pins to
          // the very top of the active area, above the usual activity order.
          // Cleared once the thread is opened (markSeen in repositories.ts).
          active: list.filter((t) => !t.archivedAt && !t.snoozedUntil && !t.toTestAt && !archivingIds.has(t.id)).sort((a, b) => {
            const aw = !!a.wokeFromSnoozeAt;
            const bw = !!b.wokeFromSnoozeAt;
            if (aw !== bw) return aw ? -1 : 1;
            return 0;
          }),
          snoozed: list.filter((t) => !t.archivedAt && t.snoozedUntil),
          toTest: list.filter((t) => !t.archivedAt && !t.snoozedUntil && t.toTestAt),
          archived: list.filter((t) => t.archivedAt).sort((a, b) => b.archivedAt < a.archivedAt ? -1 : 1)
        };
      }
      const byProject = derived(() => projects.map((p) => {
        const projThreads = threads.filter((t) => t.projectId === p.id);
        const parts = partition(projThreads);
        const projWorktrees = worktrees.filter((w) => w.projectId === p.id && !w.archivedAt);
        const masterActive = parts.active.filter((t) => !t.worktreeId);
        const worktreeFlat = projWorktrees.map((w) => ({
          worktree: w,
          active: parts.active.filter((t) => t.worktreeId === w.id)
        })).filter((wg) => wg.active.length <= 1);
        const worktreeNested = projWorktrees.map((w) => ({
          worktree: w,
          active: parts.active.filter((t) => t.worktreeId === w.id)
        })).filter((wg) => wg.active.length >= 2);
        const worktreeFlatActive = worktreeFlat.flatMap((wg) => wg.active);
        return {
          project: p,
          ...parts,
          masterActive,
          worktreeFlat,
          worktreeFlatActive,
          worktreeNested
        };
      }));
      const chatGroups = derived(() => partition(chats()));
      const fleetActiveIds = derived(() => {
        const ids = /* @__PURE__ */ new Set();
        for (const [threadId, map] of extensionUi.widgetEntries()) {
          const lines = map.get(FLEET_WIDGET_KEY);
          if (lines && parseFleet(lines)?.count) ids.add(threadId);
        }
        return ids;
      });
      const activeProjectId = derived(() => activeView === "thread" && selectedThreadId ? threads.find((t) => t.id === selectedThreadId)?.projectId ?? null : null);
      const chatActive = derived(() => activeView === "thread" && selectedThreadId && activeProjectId() === null);
      const previewOrder = derived(() => [
        ...byProject().filter((g) => !isCollapsed(g.project.id)).flatMap((g) => [
          ...g.masterActive,
          ...g.worktreeFlatActive,
          ...g.worktreeNested.flatMap((wg) => wg.active)
        ]),
        ...chatGroups().active
      ].map((t) => t.id));
      const previewSelector = derived(() => "");
      function selectThread(id2) {
        playRotary();
        onSelect(id2);
      }
      const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      function isDoneKey(key) {
        return key.startsWith("ar:") || key === "chats:past";
      }
      let archiveDialogOpen = false;
      function confirmArchiveWorktree() {
        return;
      }
      let archiveSoleWorktreeDialogOpen = false;
      function confirmArchiveSoleWorktreeThread(dontShowAgain) {
        return;
      }
      function finishArchive(thread) {
        const idx = previewOrder().indexOf(thread.id);
        const nextId = idx !== -1 ? previewOrder()[idx + 1] ?? previewOrder()[idx - 1] ?? null : null;
        archivingIds.add(thread.id);
        if (doneAnimFor === thread.id) doneAnimFor = null;
        void api.invoke("threads:archive", thread.id);
        if (nextId && thread.id === selectedThreadId) onSelect(nextId);
        extensionUi.notify(`Archived “${thread.title || "Untitled"}”`, {
          label: "Undo",
          run: () => void api.invoke("threads:unarchive", thread.id)
        });
      }
      function finishMarkToTest(thread) {
        const idx = previewOrder().indexOf(thread.id);
        const nextId = idx !== -1 ? previewOrder()[idx + 1] ?? previewOrder()[idx - 1] ?? null : null;
        testAnimFor = thread.id === testAnimFor ? null : testAnimFor;
        void api.invoke("threads:markToTest", thread.id);
        if (nextId && thread.id === selectedThreadId) onSelect(nextId);
        extensionUi.notify(`Moved “${thread.title || "Untitled"}” to testing`, {
          label: "Undo",
          run: () => void api.invoke("threads:unmarkToTest", thread.id)
        });
      }
      function snoozeThread(thread, until) {
        void api.invoke("threads:snooze", thread.id, until);
        extensionUi.notify(`Snoozed “${thread.title || "Untitled"}”`, {
          label: "Undo",
          run: () => void api.invoke("threads:unsnooze", thread.id)
        });
      }
      const pendingArchiveWorktreeName = derived(() => "");
      const archiveWorktreeDescription = derived(() => `“${pendingArchiveWorktreeName()}” and all its threads will be archived, and the checkout removed.`);
      function threadRow($$renderer3, thread, variant, worktreeName) {
        validate_snippet_args($$renderer3);
        const isActive = activeView === "thread" && selectedThreadId === thread.id;
        const Tag = TAG_META[thread.tag ?? "other"];
        const woke = variant === "active" && !!thread.wokeFromSnoozeAt;
        $$renderer3.push(`<div class="group relative flex items-center svelte-1t46z1g"${attr_style("", { "z-index": snoozePickerFor === thread.id ? 30 : void 0 })}>`);
        push_element($$renderer3, "div", 585, 2);
        if (doneAnimFor === thread.id) {
          $$renderer3.push("<!--[0-->");
          DoneBurst($$renderer3, { ondone: () => finishArchive(thread) });
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        if (testAnimFor === thread.id) {
          $$renderer3.push("<!--[0-->");
          TestBurst($$renderer3, { ondone: () => finishMarkToTest(thread) });
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> <button${attr_class(
          `session-row flex w-full items-center gap-2.5 truncate rounded-md px-2.5 py-1.5 text-left text-[13px] ${isActive ? "session-row--active text-fg" : "text-muted hover:text-fg"}`,
          "svelte-1t46z1g",
          {
            "done-pop": doneAnimFor === thread.id,
            "done-pop--archiveSlide": doneAnimFor === thread.id && doneAnim.current === "archiveSlide",
            "done-pop--archiveSwipe": doneAnimFor === thread.id && doneAnim.current === "archiveSwipe",
            "done-pop--archiveShing": doneAnimFor === thread.id && doneAnim.current === "archiveShing",
            "done-pop--archiveVacuum": doneAnimFor === thread.id && doneAnim.current === "archiveVacuum",
            "done-pop--popSpark": doneAnimFor === thread.id && doneAnim.current === "popSpark",
            "done-pop--stamp": doneAnimFor === thread.id && doneAnim.current === "stamp",
            "done-pop--confetti": doneAnimFor === thread.id && doneAnim.current === "confetti",
            "done-pop--twos": doneAnimFor === thread.id && doneAnim.current === "twos",
            "done-pop--spring": doneAnimFor === thread.id && doneAnim.current === "spring",
            "test-pop": testAnimFor === thread.id,
            "test-pop--testBench": testAnimFor === thread.id
          }
        )}${attr("data-thread-id", thread.id)} data-press="self">`);
        push_element($$renderer3, "button", 595, 4);
        if (thread.remoteHostId) {
          $$renderer3.push("<!--[0-->");
          Radio($$renderer3, {
            size: 13,
            class: `shrink-0 ${thread.status === "completed" ? "text-accent" : thread.status === "failed" ? "text-danger" : "text-faint"}`,
            title: `Remote session on ${stringify(thread.remoteHostName ?? "another machine")}`
          });
        } else if (woke) {
          $$renderer3.push("<!--[1-->");
          Bell_ring($$renderer3, {
            size: 13,
            class: "shrink-0 text-warning",
            title: "Woke from snooze",
            "data-testid": "woke-from-snooze-icon"
          });
        } else {
          $$renderer3.push("<!--[-1-->");
          if (Tag.icon) {
            $$renderer3.push("<!--[-->");
            Tag.icon($$renderer3, {
              size: 13,
              class: `shrink-0 ${thread.status === "completed" ? "text-accent" : thread.status === "failed" ? "text-danger" : "text-faint"}`,
              title: thread.status === "failed" ? "Failed" : Tag.label
            });
            $$renderer3.push("<!--]-->");
          } else {
            $$renderer3.push("<!--[!-->");
            $$renderer3.push("<!--]-->");
          }
        }
        $$renderer3.push(`<!--]--> <span${attr_class(
          `truncate ${variant === "archived" ? "text-fainter" : woke ? "text-warning" : thread.status === "failed" ? "text-danger" : thread.status === "completed" && !isActive ? "text-accent" : ""}`,
          "svelte-1t46z1g"
        )}>`);
        push_element($$renderer3, "span", 642, 6);
        $$renderer3.push(`${escape_html(thread.title)}</span>`);
        pop_element();
        $$renderer3.push(` `);
        if (worktreeName) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<span class="shrink-0 truncate text-[10px] text-accent/60 svelte-1t46z1g">`);
          push_element($$renderer3, "span", 653, 8);
          $$renderer3.push(`· ${escape_html(worktreeName)}</span>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        if (thread.status === "running" || fleetActiveIds().has(thread.id)) {
          $$renderer3.push("<!--[0-->");
          BrailleSpinner($$renderer3, {
            class: "session-spinner ml-auto mr-0 shrink-0",
            title: "Thinking…",
            shape: "hex"
          });
        } else if (variant === "active") {
          $$renderer3.push("<!--[1-->");
          $$renderer3.push(`<span class="ml-auto shrink-0 text-[10px] text-fainter svelte-1t46z1g">`);
          push_element($$renderer3, "span", 658, 8);
          $$renderer3.push(`${escape_html(relativeTime(thread.lastActivityAt, now2))}</span>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--></button>`);
        pop_element();
        $$renderer3.push(` <div class="absolute right-1 hidden items-center gap-0.5 rounded bg-surface group-hover:flex svelte-1t46z1g">`);
        push_element($$renderer3, "div", 661, 4);
        if (variant === "active") {
          $$renderer3.push("<!--[0-->");
          Tooltip($$renderer3, {
            text: "Snooze",
            children: prevent_snippet_stringification(($$renderer4) => {
              $$renderer4.push(`<button class="rounded p-1 text-faint hover:text-fg svelte-1t46z1g" data-snooze-toggle="">`);
              push_element($$renderer4, "button", 664, 10);
              Clock($$renderer4, { size: 14 });
              $$renderer4.push(`<!----></button>`);
              pop_element();
            })
          });
          $$renderer3.push(`<!----> `);
          Tooltip($$renderer3, {
            text: "Mark to test",
            children: prevent_snippet_stringification(($$renderer4) => {
              $$renderer4.push(`<button class="rounded p-1 text-faint hover:text-fg svelte-1t46z1g">`);
              push_element($$renderer4, "button", 674, 10);
              Eye($$renderer4, { size: 14 });
              $$renderer4.push(`<!----></button>`);
              pop_element();
            })
          });
          $$renderer3.push(`<!----> `);
          Tooltip($$renderer3, {
            text: "Done",
            children: prevent_snippet_stringification(($$renderer4) => {
              $$renderer4.push(`<button class="rounded p-1 text-faint hover:text-fg svelte-1t46z1g">`);
              push_element($$renderer4, "button", 680, 10);
              Check($$renderer4, { size: 14 });
              $$renderer4.push(`<!----></button>`);
              pop_element();
            })
          });
          $$renderer3.push(`<!---->`);
        } else if (variant === "toTest") {
          $$renderer3.push("<!--[1-->");
          $$renderer3.push(`<button class="rounded p-1 text-faint hover:text-fg svelte-1t46z1g" title="Unmark">`);
          push_element($$renderer3, "button", 686, 8);
          Eye_off($$renderer3, { size: 14 });
          $$renderer3.push(`<!----></button>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
          $$renderer3.push(`<button class="rounded p-1 text-faint hover:text-fg svelte-1t46z1g" title="Restore">`);
          push_element($$renderer3, "button", 692, 8);
          Archive_restore($$renderer3, { size: 14 });
          $$renderer3.push(`<!----></button>`);
          pop_element();
          $$renderer3.push(` <button class="rounded p-1 text-faint hover:text-danger svelte-1t46z1g" title="Delete forever">`);
          push_element($$renderer3, "button", 697, 8);
          Trash_2($$renderer3, { size: 14 });
          $$renderer3.push(`<!----></button>`);
          pop_element();
        }
        $$renderer3.push(`<!--]--></div>`);
        pop_element();
        $$renderer3.push(` `);
        if (snoozePickerFor === thread.id) {
          $$renderer3.push("<!--[0-->");
          SnoozePicker($$renderer3, {
            anchor: snoozeAnchor,
            onPick: (until) => {
              snoozePickerFor = null;
              snoozeAnchor = null;
              snoozeThread(thread, until);
            },
            onClose: () => {
              snoozePickerFor = null;
              snoozeAnchor = null;
            }
          });
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--></div>`);
        pop_element();
      }
      function collapsible($$renderer3, key, label, list, variant) {
        validate_snippet_args($$renderer3);
        if (list.length > 0) {
          $$renderer3.push("<!--[0-->");
          isDoneKey(key);
          $$renderer3.push(`<button class="flex w-full items-center gap-1 px-2 py-0.5 text-[11px] text-fainter hover:text-muted svelte-1t46z1g">`);
          push_element($$renderer3, "button", 724, 4);
          if (expanded[key]) {
            $$renderer3.push("<!--[0-->");
            Chevron_down($$renderer3, { size: 12 });
          } else {
            $$renderer3.push("<!--[-1-->");
            Chevron_right($$renderer3, { size: 12 });
          }
          $$renderer3.push(`<!--]--> ${escape_html(label)} · ${escape_html(list.length)}</button>`);
          pop_element();
          $$renderer3.push(` <div${attr_class("done-panel svelte-1t46z1g", void 0, {
            "done-panel--open": expanded[key],
            "done-panel--animated": !reduceMotion
          })}>`);
          push_element($$renderer3, "div", 731, 4);
          $$renderer3.push(`<div class="done-panel__inner svelte-1t46z1g">`);
          push_element($$renderer3, "div", 738, 6);
          if (expanded[key]) {
            $$renderer3.push("<!--[0-->");
            MovingHighlight($$renderer3, {
              itemSelector: ".session-row",
              activeSelector: ".session-row--active",
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<!--[-->`);
                const each_array = ensure_array_like(list);
                for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
                  let thread = each_array[$$index];
                  threadRow($$renderer4, thread, variant);
                }
                $$renderer4.push(`<!--]-->`);
              })
            });
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
          $$renderer3.push(`</div>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]-->`);
      }
      let $$settled = true;
      let $$inner_renderer;
      function $$render_inner($$renderer3) {
        prevent_snippet_stringification(threadRow);
        prevent_snippet_stringification(collapsible);
        $$renderer3.push(`<aside class="flex h-full shrink-0 flex-col svelte-1t46z1g"${attr_style(`width: ${stringify(width)}px`)}>`);
        push_element($$renderer3, "aside", 757, 0);
        $$renderer3.push(`<div class="titlebar-drag relative shrink-0 svelte-1t46z1g" style="height: calc(var(--titlebar-content-top, 40px) / var(--zoom-factor, 1))">`);
        push_element($$renderer3, "div", 768, 2);
        $$renderer3.push(`<div class="absolute right-3 top-2 flex items-center gap-1 svelte-1t46z1g">`);
        push_element($$renderer3, "div", 772, 4);
        if (extensionUi.extUpdates.length > 0) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<button${attr_class(`flex items-center gap-1 rounded-md px-1.5 py-1.5 text-amber-400 hover:bg-surface-2 ${""}`, "svelte-1t46z1g")} data-testid="nav-ext-updates"${attr("title", `${stringify(extensionUi.extUpdates.length)} extension update${extensionUi.extUpdates.length === 1 ? "" : "s"} available: ${stringify(extensionUi.extUpdates.join(", "))}`)}>`);
          push_element($$renderer3, "button", 774, 8);
          Bell_ring($$renderer3, { size: 14 });
          $$renderer3.push(`<!----> <span class="num-badge num-badge--accent svelte-1t46z1g">`);
          push_element($$renderer3, "span", 782, 10);
          $$renderer3.push(`${escape_html(extensionUi.extUpdates.length)}</span>`);
          pop_element();
          $$renderer3.push(`</button>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> <button class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50 svelte-1t46z1g"${attr("disabled", !canGoBack, true)} data-testid="nav-back" data-press="self" title="Back (⌘[)">`);
        push_element($$renderer3, "button", 785, 6);
        Arrow_left($$renderer3, { size: 15 });
        $$renderer3.push(`<!----></button>`);
        pop_element();
        $$renderer3.push(` <button class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50 svelte-1t46z1g"${attr("disabled", !canGoForward, true)} data-testid="nav-forward" data-press="self" title="Forward (⌘])">`);
        push_element($$renderer3, "button", 795, 6);
        Arrow_right($$renderer3, { size: 15 });
        $$renderer3.push(`<!----></button>`);
        pop_element();
        $$renderer3.push(` <button class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50 svelte-1t46z1g"${attr("disabled", reloading, true)} data-testid="nav-reload-all" title="Reload extensions/skills/prompts in all sessions">`);
        push_element($$renderer3, "button", 805, 6);
        Rotate_cw($$renderer3, { size: 15, class: "" });
        $$renderer3.push(`<!----></button>`);
        pop_element();
        $$renderer3.push(` <button class="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg svelte-1t46z1g" data-testid="nav-search" title="Search (⌘K)">`);
        push_element($$renderer3, "button", 814, 6);
        Search($$renderer3, { size: 15 });
        $$renderer3.push(`<!----><kbd class="text-[10px] text-fainter svelte-1t46z1g">`);
        push_element($$renderer3, "kbd", 820, 28);
        $$renderer3.push(`⌘K</kbd>`);
        pop_element();
        $$renderer3.push(`</button>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(` `);
        {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> <nav class="px-3 pb-2 svelte-1t46z1g">`);
        push_element($$renderer3, "nav", 834, 2);
        MovingHighlight($$renderer3, {
          class: "flex flex-col gap-0.5 moving-highlight--nav",
          itemSelector: ".main-nav-item",
          activeSelector: ".main-nav-item--active",
          children: prevent_snippet_stringification(($$renderer4) => {
            $$renderer4.push(`<button${attr_class(
              `main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${activeView === "automations" ? "main-nav-item--active text-fg" : "text-muted hover:text-fg"}`,
              "svelte-1t46z1g"
            )} data-testid="nav-automations">`);
            push_element($$renderer4, "button", 840, 6);
            $$renderer4.push(`<span class="flex items-center gap-2.5 svelte-1t46z1g">`);
            push_element($$renderer4, "span", 846, 8);
            Alarm_clock($$renderer4, { size: 15 });
            $$renderer4.push(`<!----> Automations</span>`);
            pop_element();
            $$renderer4.push(` `);
            if (automationCount > 0) {
              $$renderer4.push("<!--[0-->");
              $$renderer4.push(`<span class="num-badge svelte-1t46z1g" data-testid="automations-badge">`);
              push_element($$renderer4, "span", 848, 10);
              $$renderer4.push(`${escape_html(automationCount)}</span>`);
              pop_element();
            } else {
              $$renderer4.push("<!--[-1-->");
            }
            $$renderer4.push(`<!--]--></button>`);
            pop_element();
            $$renderer4.push(` <button${attr_class(
              `main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${activeView === "skills" ? "main-nav-item--active text-fg" : "text-muted hover:text-fg"}`,
              "svelte-1t46z1g"
            )} data-testid="nav-skills">`);
            push_element($$renderer4, "button", 851, 6);
            $$renderer4.push(`<span class="flex items-center gap-2.5 svelte-1t46z1g">`);
            push_element($$renderer4, "span", 857, 8);
            Book_open($$renderer4, { size: 15 });
            $$renderer4.push(`<!----> Skills</span>`);
            pop_element();
            $$renderer4.push(`</button>`);
            pop_element();
            $$renderer4.push(` <button${attr_class(
              `main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${activeView === "extensions" ? "main-nav-item--active text-fg" : "text-muted hover:text-fg"}`,
              "svelte-1t46z1g"
            )} data-testid="nav-extensions">`);
            push_element($$renderer4, "button", 859, 6);
            $$renderer4.push(`<span class="flex items-center gap-2.5 svelte-1t46z1g">`);
            push_element($$renderer4, "span", 865, 8);
            Puzzle($$renderer4, { size: 15 });
            $$renderer4.push(`<!----> Extensions</span>`);
            pop_element();
            $$renderer4.push(`</button>`);
            pop_element();
            $$renderer4.push(` <button${attr_class(
              `main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${activeView === "settings" ? "main-nav-item--active text-fg" : "text-muted hover:text-fg"}`,
              "svelte-1t46z1g"
            )} data-testid="nav-settings">`);
            push_element($$renderer4, "button", 867, 6);
            $$renderer4.push(`<span class="flex items-center gap-2.5 svelte-1t46z1g">`);
            push_element($$renderer4, "span", 873, 8);
            Settings($$renderer4, { size: 15 });
            $$renderer4.push(`<!----> Settings</span>`);
            pop_element();
            $$renderer4.push(`</button>`);
            pop_element();
            $$renderer4.push(` <button${attr_class(
              `main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${activeView === "connections" ? "main-nav-item--active text-fg" : "text-muted hover:text-fg"}`,
              "svelte-1t46z1g"
            )} data-testid="nav-connections">`);
            push_element($$renderer4, "button", 875, 6);
            $$renderer4.push(`<span class="flex items-center gap-2.5 svelte-1t46z1g">`);
            push_element($$renderer4, "span", 881, 8);
            Plug($$renderer4, { size: 15 });
            $$renderer4.push(`<!----> Connections</span>`);
            pop_element();
            $$renderer4.push(`</button>`);
            pop_element();
            $$renderer4.push(` <button${attr_class(
              `main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${activeView === "bws" ? "main-nav-item--active text-fg" : "text-muted hover:text-fg"}`,
              "svelte-1t46z1g"
            )} data-testid="nav-bws">`);
            push_element($$renderer4, "button", 883, 6);
            $$renderer4.push(`<span class="flex items-center gap-2.5 svelte-1t46z1g">`);
            push_element($$renderer4, "span", 889, 8);
            Key_round($$renderer4, { size: 15 });
            $$renderer4.push(`<!----> Secrets</span>`);
            pop_element();
            $$renderer4.push(`</button>`);
            pop_element();
            $$renderer4.push(` <button${attr_class(
              `main-nav-item flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${activeView === "remote" ? "main-nav-item--active text-fg" : "text-muted hover:text-fg"}`,
              "svelte-1t46z1g"
            )} data-testid="nav-remote"${attr("data-remote-first", remoteFirst ? "on" : void 0)}>`);
            push_element($$renderer4, "button", 891, 6);
            $$renderer4.push(`<span${attr_class(`flex items-center gap-2.5 ${remoteFirst ? "remote-first-pulse" : ""}`, "svelte-1t46z1g")}>`);
            push_element($$renderer4, "span", 898, 8);
            Radio($$renderer4, { size: 15 });
            $$renderer4.push(`<!----> Remote</span>`);
            pop_element();
            $$renderer4.push(`</button>`);
            pop_element();
            $$renderer4.push(` <div class="main-nav-item--usage relative svelte-1t46z1g" data-nav-usage-host="">`);
            push_element($$renderer4, "div", 902, 6);
            $$renderer4.push(`<button class="main-nav-item flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:text-fg svelte-1t46z1g" data-testid="nav-usage">`);
            push_element($$renderer4, "button", 906, 8);
            $$renderer4.push(`<span class="flex items-center gap-2.5 svelte-1t46z1g">`);
            push_element($$renderer4, "span", 912, 10);
            Gauge($$renderer4, { size: 15 });
            $$renderer4.push(`<!----> Usage</span>`);
            pop_element();
            $$renderer4.push(` `);
            if (featuredLine().length > 0) {
              $$renderer4.push("<!--[0-->");
              $$renderer4.push(`<span class="flex items-center gap-1.5 text-[10px] text-fainter svelte-1t46z1g" data-testid="nav-usage-line">`);
              push_element($$renderer4, "span", 914, 12);
              $$renderer4.push(`<!--[-->`);
              const each_array_1 = ensure_array_like(featuredLine());
              for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
                let { provider, key, m } = each_array_1[$$index_1];
                $$renderer4.push(`<span class="svelte-1t46z1g">`);
                push_element($$renderer4, "span", 916, 16);
                $$renderer4.push(`<span class="text-fainter svelte-1t46z1g">`);
                push_element($$renderer4, "span", 917, 18);
                $$renderer4.push(`${escape_html(shortTag(provider))}</span>`);
                pop_element();
                $$renderer4.push(` <span${attr_class(`ml-0.5 ${stringify(urgencyClass(m.urgency))}`, "svelte-1t46z1g")}>`);
                push_element($$renderer4, "span", 918, 18);
                $$renderer4.push(`${escape_html(m.remainingPct !== null && m.remainingPct <= 0 ? `${fmtResetsIn(m.resetAt, now2)} left` : m.value)}</span>`);
                pop_element();
                $$renderer4.push(`</span>`);
                pop_element();
              }
              $$renderer4.push(`<!--]--></span>`);
              pop_element();
            } else {
              $$renderer4.push("<!--[-1-->");
            }
            $$renderer4.push(`<!--]--></button>`);
            pop_element();
            $$renderer4.push(` `);
            {
              $$renderer4.push("<!--[-1-->");
            }
            $$renderer4.push(`<!--]--></div>`);
            pop_element();
          })
        });
        $$renderer3.push(`<!----></nav>`);
        pop_element();
        $$renderer3.push(` <div class="flex items-center justify-between px-4 pt-2 pb-1.5 svelte-1t46z1g">`);
        push_element($$renderer3, "div", 932, 2);
        $$renderer3.push(`<span${attr_class(`engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase ${activeProjectId() ? "engraved--active" : ""}`, "svelte-1t46z1g")}>`);
        push_element($$renderer3, "span", 933, 4);
        Folder($$renderer3, { size: 12 });
        $$renderer3.push(`<!----> Projects</span>`);
        pop_element();
        $$renderer3.push(` `);
        Tooltip($$renderer3, {
          text: "Add project",
          children: prevent_snippet_stringification(($$renderer4) => {
            $$renderer4.push(`<button class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg svelte-1t46z1g" data-testid="add-project">`);
            push_element($$renderer4, "button", 935, 6);
            Plus($$renderer4, { size: 15 });
            $$renderer4.push(`<!----></button>`);
            pop_element();
          })
        });
        $$renderer3.push(`<!----></div>`);
        pop_element();
        $$renderer3.push(` <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-2 svelte-1t46z1g" style="scrollbar-gutter: stable">`);
        push_element($$renderer3, "nav", 942, 2);
        const each_array_2 = ensure_array_like(byProject());
        if (each_array_2.length !== 0) {
          $$renderer3.push("<!--[-->");
          for (let $$index_6 = 0, $$length = each_array_2.length; $$index_6 < $$length; $$index_6++) {
            let group = each_array_2[$$index_6];
            $$renderer3.push(`<div class="mb-3 svelte-1t46z1g">`);
            push_element($$renderer3, "div", 944, 6);
            $$renderer3.push(`<div${attr_class(`group flex items-center justify-between rounded-md px-1 py-0.5 ${draggedId === group.project.id ? "opacity-40" : ""} ${dragOverId === group.project.id && draggedId ? "bg-surface-2 ring-1 ring-inset ring-accent/50" : ""}`, "svelte-1t46z1g")} draggable="true" data-testid="project-row">`);
            push_element($$renderer3, "div", 945, 8);
            $$renderer3.push(`<button class="flex min-w-0 flex-1 items-center gap-1 rounded p-0.5 text-left cursor-grab active:cursor-grabbing svelte-1t46z1g"${attr("title", isCollapsed(group.project.id) ? "Expand" : "Collapse")}${attr("aria-label", isCollapsed(group.project.id) ? "Expand project" : "Collapse project")}${attr("aria-expanded", !isCollapsed(group.project.id))} data-testid="toggle-project">`);
            push_element($$renderer3, "button", 959, 10);
            if (isCollapsed(group.project.id)) {
              $$renderer3.push("<!--[0-->");
              Chevron_right($$renderer3, { size: 14, class: "shrink-0 text-faint" });
            } else {
              $$renderer3.push("<!--[-1-->");
              Chevron_down($$renderer3, { size: 14, class: "shrink-0 text-faint" });
            }
            $$renderer3.push(`<!--]--> <span class="truncate text-sm font-medium text-fg-soft svelte-1t46z1g">`);
            push_element($$renderer3, "span", 972, 12);
            $$renderer3.push(`${escape_html(group.project.name)}</span>`);
            pop_element();
            $$renderer3.push(`</button>`);
            pop_element();
            $$renderer3.push(` <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 svelte-1t46z1g">`);
            push_element($$renderer3, "div", 974, 10);
            Tooltip($$renderer3, {
              text: "Add thread to master",
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<button class="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg svelte-1t46z1g" data-testid="new-thread" aria-label="Add thread">`);
                push_element($$renderer4, "button", 976, 14);
                Plus($$renderer4, { size: 14 });
                $$renderer4.push(`<!----></button>`);
                pop_element();
              })
            });
            $$renderer3.push(`<!----> `);
            Tooltip($$renderer3, {
              text: "New worktree (isolated checkout)",
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<button class="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg svelte-1t46z1g" data-testid="new-worktree-thread">`);
                push_element($$renderer4, "button", 984, 14);
                Git_branch_plus($$renderer4, { size: 14 });
                $$renderer4.push(`<!----></button>`);
                pop_element();
              })
            });
            $$renderer3.push(`<!----> `);
            Tooltip($$renderer3, {
              text: "Remove project",
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<button class="rounded p-1 text-faint hover:bg-surface-2 hover:text-danger svelte-1t46z1g" data-testid="remove-project" aria-label="Remove project">`);
                push_element($$renderer4, "button", 991, 14);
                Trash_2($$renderer4, { size: 14 });
                $$renderer4.push(`<!----></button>`);
                pop_element();
              })
            });
            $$renderer3.push(`<!----></div>`);
            pop_element();
            $$renderer3.push(` `);
            if (group.project.kind === "repo") {
              $$renderer3.push("<!--[0-->");
              const openCount = workQueue.countFor(group.project.id);
              if (openCount > 0) {
                $$renderer3.push("<!--[0-->");
                Tooltip($$renderer3, {
                  text: "Open work queue",
                  children: prevent_snippet_stringification(($$renderer4) => {
                    $$renderer4.push(`<button${attr_class(`flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] ${isCollapsed(group.project.id) ? "opacity-0 group-hover:opacity-100" : ""} ${activeView === "work-queue" ? "text-accent" : "text-faint hover:text-fg"}`, "svelte-1t46z1g")} data-testid="project-work-queue" aria-label="Open work queue">`);
                    push_element($$renderer4, "button", 1003, 16);
                    List_checks($$renderer4, { size: 14 });
                    $$renderer4.push(`<!----><span class="svelte-1t46z1g">`);
                    push_element($$renderer4, "span", 1009, 71);
                    $$renderer4.push(`${escape_html(openCount)}</span>`);
                    pop_element();
                    $$renderer4.push(`</button>`);
                    pop_element();
                  })
                });
              } else {
                $$renderer3.push("<!--[-1-->");
                Tooltip($$renderer3, {
                  text: "Open work queue",
                  children: prevent_snippet_stringification(($$renderer4) => {
                    $$renderer4.push(`<button${attr_class(
                      `flex shrink-0 items-center rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 ${activeView === "work-queue" ? "text-accent opacity-100" : "text-faint hover:text-fg"}`,
                      "svelte-1t46z1g"
                    )} data-testid="project-work-queue" aria-label="Open work queue">`);
                    push_element($$renderer4, "button", 1014, 16);
                    List_checks($$renderer4, { size: 14 });
                    $$renderer4.push(`<!----></button>`);
                    pop_element();
                  })
                });
              }
              $$renderer3.push(`<!--]-->`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> `);
            if (group.snoozed.length > 0) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<div class="relative flex shrink-0 items-center svelte-1t46z1g">`);
              push_element($$renderer3, "div", 1026, 12);
              Tooltip($$renderer3, {
                text: "Snoozed threads",
                children: prevent_snippet_stringification(($$renderer4) => {
                  $$renderer4.push(`<button${attr_class(`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${isCollapsed(group.project.id) ? "opacity-0 group-hover:opacity-100" : ""} ${snoozedPopoverFor === group.project.id ? "text-accent" : "text-faint hover:text-fg"}`, "svelte-1t46z1g")} data-snooze-list-toggle="" data-testid="project-snoozed" aria-label="Snoozed threads">`);
                  push_element($$renderer4, "button", 1028, 16);
                  Clock($$renderer4, { size: 14 });
                  $$renderer4.push(`<!----><span class="svelte-1t46z1g">`);
                  push_element($$renderer4, "span", 1039, 66);
                  $$renderer4.push(`${escape_html(group.snoozed.length)}</span>`);
                  pop_element();
                  $$renderer4.push(`</button>`);
                  pop_element();
                })
              });
              $$renderer3.push(`<!----> `);
              if (snoozedPopoverFor === group.project.id) {
                $$renderer3.push("<!--[0-->");
                SnoozedPopover($$renderer3, {
                  anchor: snoozedListAnchor,
                  threads: group.snoozed,
                  onSelect: (id2) => selectThread(id2),
                  onUnsnooze: (id2) => void api.invoke("threads:unsnooze", id2),
                  onClose: () => {
                    snoozedPopoverFor = null;
                    snoozedListAnchor = null;
                  }
                });
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]--></div>`);
              pop_element();
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> `);
            if (group.toTest.length > 0) {
              $$renderer3.push("<!--[0-->");
              Tooltip($$renderer3, {
                text: "Open testing area",
                children: prevent_snippet_stringification(($$renderer4) => {
                  $$renderer4.push(`<button${attr_class(`flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] ${isCollapsed(group.project.id) ? "opacity-0 group-hover:opacity-100" : ""} ${activeView === "testing" ? "text-accent" : "text-faint hover:text-fg"}`, "svelte-1t46z1g")} data-testid="project-to-test" aria-label="Open testing area">`);
                  push_element($$renderer4, "button", 1058, 14);
                  Eye($$renderer4, { size: 14 });
                  $$renderer4.push(`<!----><span class="svelte-1t46z1g">`);
                  push_element($$renderer4, "span", 1064, 64);
                  $$renderer4.push(`${escape_html(group.toTest.length)}</span>`);
                  pop_element();
                  $$renderer4.push(`</button>`);
                  pop_element();
                })
              });
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--></div>`);
            pop_element();
            $$renderer3.push(` <div${attr_class("done-panel svelte-1t46z1g", void 0, {
              "done-panel--open": !isCollapsed(group.project.id),
              "done-panel--animated": !reduceMotion
            })}>`);
            push_element($$renderer3, "div", 1069, 8);
            $$renderer3.push(`<div class="done-panel__inner--grow svelte-1t46z1g">`);
            push_element($$renderer3, "div", 1074, 10);
            MovingHighlight($$renderer3, {
              itemSelector: ".session-row",
              activeSelector: ".session-row--active",
              previewSelector: previewSelector(),
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<!--[-->`);
                const each_array_3 = ensure_array_like(group.masterActive);
                for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
                  let thread = each_array_3[$$index_2];
                  threadRow($$renderer4, thread, "active");
                }
                $$renderer4.push(`<!--]-->`);
              })
            });
            $$renderer3.push(`<!----> `);
            if (group.worktreeFlatActive.length > 0 || group.worktreeNested.length > 0) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<div class="worktrees-section svelte-1t46z1g" role="group" aria-label="Worktrees">`);
              push_element($$renderer3, "div", 1087, 12);
              $$renderer3.push(`<div class="worktrees-section__label svelte-1t46z1g">`);
              push_element($$renderer3, "div", 1088, 14);
              Git_branch($$renderer3, { size: 11, class: "shrink-0 text-accent/70" });
              $$renderer3.push(`<!----> <span class="svelte-1t46z1g">`);
              push_element($$renderer3, "span", 1090, 16);
              $$renderer3.push(`Worktrees</span>`);
              pop_element();
              $$renderer3.push(` `);
              if (group.worktreeFlatActive.length + group.worktreeNested.reduce((n, wg) => n + wg.active.length, 0) > 0) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<span class="text-fainter svelte-1t46z1g">`);
                push_element($$renderer3, "span", 1092, 18);
                $$renderer3.push(`· ${escape_html(group.worktreeFlatActive.length + group.worktreeNested.reduce((n, wg) => n + wg.active.length, 0))}</span>`);
                pop_element();
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]--></div>`);
              pop_element();
              $$renderer3.push(` `);
              MovingHighlight($$renderer3, {
                itemSelector: ".session-row",
                activeSelector: ".session-row--active",
                previewSelector: previewSelector(),
                children: prevent_snippet_stringification(($$renderer4) => {
                  $$renderer4.push(`<!--[-->`);
                  const each_array_4 = ensure_array_like(group.worktreeFlatActive);
                  for (let $$index_3 = 0, $$length2 = each_array_4.length; $$index_3 < $$length2; $$index_3++) {
                    let thread = each_array_4[$$index_3];
                    const wg = group.worktreeFlat.find((w) => w.active[0]?.id === thread.id);
                    threadRow($$renderer4, thread, "active", wg?.worktree.name);
                  }
                  $$renderer4.push(`<!--]-->`);
                })
              });
              $$renderer3.push(`<!----> <!--[-->`);
              const each_array_5 = ensure_array_like(group.worktreeNested);
              for (let $$index_5 = 0, $$length2 = each_array_5.length; $$index_5 < $$length2; $$index_5++) {
                let wg = each_array_5[$$index_5];
                $$renderer3.push(`<div class="worktree-header flex items-center justify-between rounded-md px-2 py-0.5 svelte-1t46z1g" role="group"${attr("aria-label", wg.worktree.name)}>`);
                push_element($$renderer3, "div", 1104, 16);
                $$renderer3.push(`<span class="flex min-w-0 items-center gap-1 text-[11px] font-medium text-muted svelte-1t46z1g">`);
                push_element($$renderer3, "span", 1105, 18);
                Git_branch($$renderer3, { size: 12, class: "shrink-0 text-accent/70" });
                $$renderer3.push(`<!----> <span class="truncate svelte-1t46z1g">`);
                push_element($$renderer3, "span", 1107, 20);
                $$renderer3.push(`${escape_html(wg.worktree.name)}</span>`);
                pop_element();
                $$renderer3.push(` `);
                if (wg.active.length > 0) {
                  $$renderer3.push("<!--[0-->");
                  $$renderer3.push(`<span class="text-fainter svelte-1t46z1g">`);
                  push_element($$renderer3, "span", 1109, 22);
                  $$renderer3.push(`· ${escape_html(wg.active.length)}</span>`);
                  pop_element();
                } else {
                  $$renderer3.push("<!--[-1-->");
                }
                $$renderer3.push(`<!--]--></span>`);
                pop_element();
                $$renderer3.push(` <div class="flex items-center gap-0.5 opacity-0 hover:opacity-100 svelte-1t46z1g">`);
                push_element($$renderer3, "div", 1112, 18);
                Tooltip($$renderer3, {
                  text: "Add thread to worktree",
                  children: prevent_snippet_stringification(($$renderer4) => {
                    $$renderer4.push(`<button class="rounded p-0.5 text-fainter hover:bg-surface-2 hover:text-fg svelte-1t46z1g" aria-label="Add thread to worktree">`);
                    push_element($$renderer4, "button", 1114, 22);
                    Plus($$renderer4, { size: 12 });
                    $$renderer4.push(`<!----></button>`);
                    pop_element();
                  })
                });
                $$renderer3.push(`<!----> `);
                Tooltip($$renderer3, {
                  text: "Archive worktree and its threads",
                  children: prevent_snippet_stringification(($$renderer4) => {
                    $$renderer4.push(`<button class="rounded p-0.5 text-fainter hover:bg-surface-2 hover:text-danger svelte-1t46z1g" aria-label="Archive worktree">`);
                    push_element($$renderer4, "button", 1121, 22);
                    Archive($$renderer4, { size: 12 });
                    $$renderer4.push(`<!----></button>`);
                    pop_element();
                  })
                });
                $$renderer3.push(`<!----></div>`);
                pop_element();
                $$renderer3.push(`</div>`);
                pop_element();
                $$renderer3.push(` `);
                MovingHighlight($$renderer3, {
                  itemSelector: ".session-row",
                  activeSelector: ".session-row--active",
                  previewSelector: previewSelector(),
                  children: prevent_snippet_stringification(($$renderer4) => {
                    $$renderer4.push(`<!--[-->`);
                    const each_array_6 = ensure_array_like(wg.active);
                    for (let $$index_4 = 0, $$length3 = each_array_6.length; $$index_4 < $$length3; $$index_4++) {
                      let thread = each_array_6[$$index_4];
                      threadRow($$renderer4, thread, "active");
                    }
                    $$renderer4.push(`<!--]-->`);
                  })
                });
                $$renderer3.push(`<!---->`);
              }
              $$renderer3.push(`<!--]--></div>`);
              pop_element();
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> `);
            collapsible($$renderer3, `ar:${group.project.id}`, "Done", group.archived, "archived");
            $$renderer3.push(`<!----></div>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
          }
        } else {
          $$renderer3.push("<!--[!-->");
          $$renderer3.push(`<p class="px-2 text-xs text-fainter svelte-1t46z1g">`);
          push_element($$renderer3, "p", 1143, 6);
          $$renderer3.push(`No projects yet. Add one with +.</p>`);
          pop_element();
        }
        $$renderer3.push(`<!--]--></nav>`);
        pop_element();
        $$renderer3.push(` <div class="border-t border-border/60 px-3 pt-3 pb-3 svelte-1t46z1g">`);
        push_element($$renderer3, "div", 1148, 2);
        $$renderer3.push(`<div class="flex items-center justify-between px-1 pb-1.5 svelte-1t46z1g">`);
        push_element($$renderer3, "div", 1149, 4);
        $$renderer3.push(`<span${attr_class(`engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase ${chatActive() ? "engraved--active" : ""}`, "svelte-1t46z1g")}>`);
        push_element($$renderer3, "span", 1150, 6);
        Message_square($$renderer3, { size: 12 });
        $$renderer3.push(`<!----> Chats</span>`);
        pop_element();
        $$renderer3.push(` <button class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg svelte-1t46z1g" data-testid="new-chat" title="New chat">`);
        push_element($$renderer3, "button", 1151, 6);
        Plus($$renderer3, { size: 14 });
        $$renderer3.push(`<!----></button>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(` <div class="chats-scroll max-h-48 overflow-y-auto svelte-1t46z1g">`);
        push_element($$renderer3, "div", 1158, 4);
        MovingHighlight($$renderer3, {
          itemSelector: ".session-row",
          activeSelector: ".session-row--active",
          previewSelector: previewSelector(),
          children: prevent_snippet_stringification(($$renderer4) => {
            $$renderer4.push(`<!--[-->`);
            const each_array_7 = ensure_array_like(chatGroups().active);
            for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
              let thread = each_array_7[$$index_7];
              threadRow($$renderer4, thread, "active");
            }
            $$renderer4.push(`<!--]-->`);
          })
        });
        $$renderer3.push(`<!----> `);
        collapsible($$renderer3, "chats:past", "Done", chatGroups().archived, "archived");
        $$renderer3.push(`<!----></div>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(` <!--[-->`);
        const each_array_8 = ensure_array_like(remoteGroups());
        for (let $$index_10 = 0, $$length = each_array_8.length; $$index_10 < $$length; $$index_10++) {
          let group = each_array_8[$$index_10];
          $$renderer3.push(`<div class="border-t border-border/60 px-3 pt-3 pb-3 svelte-1t46z1g">`);
          push_element($$renderer3, "div", 1170, 4);
          $$renderer3.push(`<div class="flex items-center justify-between px-1 pb-1.5 svelte-1t46z1g">`);
          push_element($$renderer3, "div", 1171, 6);
          $$renderer3.push(`<span class="engraved flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase svelte-1t46z1g">`);
          push_element($$renderer3, "span", 1172, 8);
          Radio($$renderer3, { size: 12 });
          $$renderer3.push(`<!----> ${escape_html(group.name)}</span>`);
          pop_element();
          $$renderer3.push(`</div>`);
          pop_element();
          $$renderer3.push(` <div class="max-h-64 overflow-y-auto svelte-1t46z1g">`);
          push_element($$renderer3, "div", 1176, 6);
          $$renderer3.push(`<!--[-->`);
          const each_array_9 = ensure_array_like(group.projects);
          for (let $$index_9 = 0, $$length2 = each_array_9.length; $$index_9 < $$length2; $$index_9++) {
            let proj = each_array_9[$$index_9];
            $$renderer3.push(`<div class="px-1.5 pt-1 pb-0.5 text-[10px] font-medium tracking-wide text-fainter uppercase svelte-1t46z1g">`);
            push_element($$renderer3, "div", 1178, 10);
            $$renderer3.push(`${escape_html(proj.name)}</div>`);
            pop_element();
            $$renderer3.push(` `);
            MovingHighlight($$renderer3, {
              itemSelector: ".session-row",
              activeSelector: ".session-row--active",
              previewSelector: previewSelector(),
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<!--[-->`);
                const each_array_10 = ensure_array_like(proj.threads);
                for (let $$index_8 = 0, $$length3 = each_array_10.length; $$index_8 < $$length3; $$index_8++) {
                  let thread = each_array_10[$$index_8];
                  threadRow($$renderer4, thread, "active");
                }
                $$renderer4.push(`<!--]-->`);
              })
            });
            $$renderer3.push(`<!---->`);
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
          $$renderer3.push(`</div>`);
          pop_element();
        }
        $$renderer3.push(`<!--]--></aside>`);
        pop_element();
        $$renderer3.push(` `);
        ConfirmDialog($$renderer3, {
          title: "Archive worktree",
          description: archiveWorktreeDescription(),
          confirmLabel: "Archive",
          destructive: true,
          onConfirm: confirmArchiveWorktree,
          get open() {
            return archiveDialogOpen;
          },
          set open($$value) {
            archiveDialogOpen = $$value;
            $$settled = false;
          }
        });
        $$renderer3.push(`<!----> `);
        ConfirmDialog($$renderer3, {
          title: "Archive thread and worktree?",
          description: "This is the only thread in its worktree, so archiving it removes the worktree's git checkout too. This can't be undone.",
          confirmLabel: "Archive thread + worktree",
          destructive: true,
          dontShowAgainLabel: "Don't warn me about this",
          onConfirm: (dontShowAgain) => confirmArchiveSoleWorktreeThread(),
          get open() {
            return archiveSoleWorktreeDialogOpen;
          },
          set open($$value) {
            archiveSoleWorktreeDialogOpen = $$value;
            $$settled = false;
          }
        });
        $$renderer3.push(`<!---->`);
      }
      do {
        $$settled = true;
        $$inner_renderer = $$renderer2.copy();
        $$render_inner($$inner_renderer);
      } while (!$$settled);
      $$renderer2.subsume($$inner_renderer);
    },
    Sidebar
  );
}
Sidebar.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
class RemoteClientStore {
  id = null;
  name = null;
  loaded = false;
  init() {
    if (this.loaded) return;
    this.loaded = true;
    void api.invoke("app:getRemoteClientId").then((c) => {
      this.id = c.id;
      this.name = c.name;
    });
  }
}
const remoteClient = new RemoteClientStore();
function mapTurns(items, turns) {
  const endById = /* @__PURE__ */ new Map();
  const keepByEntry = /* @__PURE__ */ new Map();
  if (turns.length === 0 || items.length === 0) return { endById, keepByEntry };
  let userIdx = -1;
  let lastId = null;
  let cur = null;
  items.forEach((it, i) => {
    if (it.kind === "user") {
      if (lastId && cur) endById.set(lastId, cur);
      userIdx++;
      const entryId = turns[userIdx]?.entryId;
      cur = entryId ? { entryId, keepCount: i } : null;
      if (entryId) keepByEntry.set(entryId, i);
    }
    lastId = it.id;
  });
  if (lastId && cur) endById.set(lastId, cur);
  return { endById, keepByEntry };
}
Undo_2[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/undo-2.svelte";
function Undo_2($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M9 14 4 9l5-5" }],
        [
          "path",
          {
            "d": "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "undo-2" }, props, { iconNode }]));
    },
    Undo_2
  );
}
Undo_2.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
function delay(callback, timeout) {
  const start = time.now();
  const checkElapsed = ({ timestamp }) => {
    const elapsed = timestamp - start;
    if (elapsed >= timeout) {
      cancelFrame(checkElapsed);
      callback(elapsed - timeout);
    }
  };
  frame.setup(checkElapsed, true);
  return () => cancelFrame(checkElapsed);
}
const scaleCorrectors$1 = {};
function addScaleCorrector$1(correctors) {
  for (const key in correctors) {
    scaleCorrectors$1[key] = correctors[key];
    if (isCSSVariableName(key)) {
      scaleCorrectors$1[key].isCSSVariable = true;
    }
  }
}
function runWatcher(sources, flush, effect, options = {}) {
  const { lazy = false } = options;
}
function watch(sources, effect, options) {
  runWatcher(sources, "post", effect, options);
}
function watchPre(sources, effect, options) {
  runWatcher(sources, "pre", effect, options);
}
watch.pre = watchPre;
class Context2 {
  #name;
  #key;
  #fallback;
  /**
   * @param name The name of the context.
   * This is used for generating the context key and error messages.
   * @param fallback Optional fallback value to return when context doesn't exist.
   */
  constructor(name, fallback) {
    this.#name = name;
    this.#key = Symbol(name);
    this.#fallback = fallback;
  }
  /**
   * The key used to get and set the context.
   *
   * It is not recommended to use this value directly.
   * Instead, use the methods provided by this class.
   */
  get key() {
    return this.#key;
  }
  /**
   * Checks whether this has been set in the context of a parent component.
   *
   * Must be called during component initialisation.
   */
  exists() {
    return hasContext(this.#key);
  }
  /**
   * Retrieves the context that belongs to the closest parent component.
   *
   * Must be called during component initialisation.
   *
   * @throws An error if the context does not exist.
   */
  get() {
    const context2 = getContext$1(this.#key);
    if (context2 === void 0) {
      throw new Error(`Context "${this.#name}" not found`);
    }
    return context2;
  }
  /**
   * Retrieves the context that belongs to the closest parent component,
   * or the given fallback value if the context does not exist.
   *
   * Must be called during component initialisation.
   */
  getOr(fallback) {
    const context2 = getContext$1(this.#key);
    if (context2 === void 0) {
      return fallback ?? this.#fallback;
    }
    return context2;
  }
  /**
   * Associates the given value with the current component and returns it.
   *
   * Must be called during component initialisation.
   */
  set(context2) {
    return setContext(this.#key, context2);
  }
}
const isDef = (val) => typeof val !== "undefined";
function css(styleObj) {
  return Object.entries(styleObj).filter(([, value]) => value !== void 0).map(([key, value]) => {
    const unitlessProps = ["opacity", "zIndex", "fontWeight", "lineHeight", "order", "flexGrow", "flexShrink"];
    const formattedValue = typeof value === "number" && !unitlessProps.includes(key) ? `${value}px` : value;
    return `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${formattedValue}`;
  }).join(";");
}
function withProp(props, key, value) {
  return Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(props),
    [key]: { value, writable: true, enumerable: true, configurable: true }
  });
}
function isAnimationControls$1(v) {
  return v !== null && typeof v === "object" && typeof v.start === "function";
}
class Feature {
  state;
  constructor(state) {
    this.state = state;
  }
  beforeMount() {
  }
  mount() {
  }
  unmount() {
  }
  update() {
  }
  beforeUpdate() {
  }
  beforeUnmount() {
  }
}
class FeatureManager {
  features = [];
  constructor(state) {
    const { features = [], lazyMotionContext } = state.options;
    const allFeatures = features.concat(lazyMotionContext.features());
    this.features = allFeatures.map((Feature2) => new Feature2(state));
    const featureInstances = this.features;
    watch.pre(() => lazyMotionContext.features(), (features2) => {
      features2.forEach((feature) => {
        if (!allFeatures.includes(feature)) {
          allFeatures.push(feature);
          const featureInstance = new feature(state);
          featureInstances.push(featureInstance);
          if (state.isMounted()) {
            featureInstance.beforeMount();
            featureInstance.mount();
          }
        }
      });
    }, {
      lazy: true
    });
  }
  mount() {
    this.features.forEach((feature) => feature.mount());
  }
  beforeMount() {
    this.features.forEach((feature) => feature.beforeMount?.());
  }
  unmount() {
    this.features.forEach((feature) => feature.unmount());
  }
  update() {
    this.features.forEach((feature) => feature.update?.());
  }
  beforeUpdate() {
    this.features.forEach((feature) => feature.beforeUpdate());
  }
  beforeUnmount() {
    this.features.forEach((feature) => feature.beforeUnmount());
  }
}
function resolveVariant$1(definition, variants, custom) {
  if (Array.isArray(definition)) {
    return definition.reduce((acc, item) => {
      const resolvedVariant = resolveVariant$1(item, variants, custom);
      return resolvedVariant ? { ...acc, ...resolvedVariant } : acc;
    }, {});
  } else if (typeof definition === "object") {
    return definition;
  } else if (definition && variants) {
    const variant = variants[definition];
    return typeof variant === "function" ? variant(custom) : variant;
  }
}
function hasChanged(a, b) {
  if (typeof a !== typeof b)
    return true;
  if (Array.isArray(a) && Array.isArray(b))
    return !shallowCompare(a, b);
  return a !== b;
}
function shallowCompare(next, prev) {
  const prevLength = prev.length;
  if (prevLength !== next.length)
    return false;
  for (let i = 0; i < prevLength; i++) {
    if (prev[i] !== next[i])
      return false;
  }
  return true;
}
function isCssVar(name) {
  return name?.startsWith("--");
}
const noopReturn = (v) => v;
function isNumber(value) {
  return typeof value === "number";
}
const svgElements = [
  "animate",
  "circle",
  "defs",
  "desc",
  "ellipse",
  "g",
  "image",
  "line",
  "filter",
  "marker",
  "mask",
  "metadata",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "rect",
  "stop",
  "svg",
  "switch",
  "symbol",
  "text",
  "tspan",
  "use",
  "view",
  "clipPath",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "foreignObject",
  "linearGradient",
  "radialGradient",
  "textPath"
];
const svgElementSet = new Set(svgElements);
function isSVGElement(as) {
  return svgElementSet.has(as);
}
const rotation = {
  syntax: "<angle>",
  initialValue: "0deg",
  toDefaultUnit: (v) => `${v}deg`
};
const baseTransformProperties = {
  translate: {
    syntax: "<length-percentage>",
    initialValue: "0px",
    toDefaultUnit: (v) => `${v}px`
  },
  rotate: rotation,
  scale: {
    syntax: "<number>",
    initialValue: 1,
    toDefaultUnit: noopReturn
  },
  skew: rotation
};
const order = ["translate", "scale", "rotate", "skew"];
const axes = ["", "X", "Y", "Z"];
const transformDefinitions = /* @__PURE__ */ new Map();
const transforms = [
  "transformPerspective",
  "x",
  "y",
  "z",
  "translateX",
  "translateY",
  "translateZ",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
  "skew",
  "skewX",
  "skewY"
];
order.forEach((name) => {
  axes.forEach((axis) => {
    transforms.push(name + axis);
    transformDefinitions.set(name + axis, baseTransformProperties[name]);
  });
});
const transformLookup = new Set(transforms);
const isTransform = (name) => transformLookup.has(name);
const transformAlias = {
  x: "translateX",
  y: "translateY",
  z: "translateZ"
};
function compareTransformOrder([a], [b]) {
  return transforms.indexOf(a) - transforms.indexOf(b);
}
function transformListToString(template, [name, value]) {
  return `${template} ${name}(${value})`;
}
function buildTransformTemplate(transforms2) {
  return transforms2.sort(compareTransformOrder).reduce(transformListToString, "").trim();
}
const transformResetValue = {
  translate: [0, 0],
  rotate: 0,
  scale: 1,
  skew: 0,
  x: 0,
  y: 0,
  z: 0
};
const style = {
  get: (element2, name) => {
    let value = isCssVar(name) ? element2.style.getPropertyValue(name) : getComputedStyle(element2)[name];
    if (!value && value !== "0") {
      const definition = transformDefinitions.get(name);
      if (definition)
        value = definition.initialValue;
    }
    return value;
  },
  set: (element2, name, value) => {
    if (isCssVar(name)) {
      element2.style.setProperty(name, value);
    } else {
      element2.style[name] = value;
    }
  }
};
function createStyles(keyframes) {
  const initialKeyframes = {};
  const transforms2 = [];
  for (let key in keyframes) {
    let value = keyframes[key];
    value = isMotionValue(value) ? value.get() : value;
    if (isTransform(key)) {
      if (key in transformAlias) {
        key = transformAlias[key];
      }
    }
    let initialKeyframe = Array.isArray(value) ? value[0] : value;
    const definition = transformDefinitions.get(key);
    if (definition) {
      initialKeyframe = isNumber(value) ? definition.toDefaultUnit?.(value) : value;
      transforms2.push([key, initialKeyframe]);
    } else {
      initialKeyframes[key] = initialKeyframe;
    }
  }
  if (transforms2.length) {
    initialKeyframes.transform = buildTransformTemplate(transforms2);
  }
  if (Object.keys(initialKeyframes).length === 0) {
    return null;
  }
  return initialKeyframes;
}
const SVG_STYLE_TO_ATTRIBUTES = {
  fill: true,
  stroke: true,
  opacity: true,
  "stroke-width": true,
  "fill-opacity": true,
  "stroke-opacity": true,
  "stroke-linecap": true,
  "stroke-linejoin": true,
  "stroke-dasharray": true,
  "stroke-dashoffset": true,
  cx: true,
  cy: true,
  r: true,
  d: true,
  x1: true,
  y1: true,
  x2: true,
  y2: true,
  points: true,
  "path-length": true,
  viewBox: true,
  width: true,
  height: true,
  "preserve-aspect-ratio": true,
  "clip-path": true,
  filter: true,
  mask: true,
  "stop-color": true,
  "stop-opacity": true,
  "gradient-transform": true,
  "gradient-units": true,
  "spread-method": true,
  "marker-end": true,
  "marker-mid": true,
  "marker-start": true,
  "text-anchor": true,
  "dominant-baseline": true,
  "font-family": true,
  "font-size": true,
  "font-weight": true,
  "letter-spacing": true,
  "vector-effect": true
};
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
function buildSVGPath$1(attrs, length, spacing = 1, offset2 = 0) {
  attrs.pathLength = 1;
  delete attrs["path-length"];
  attrs["stroke-dashoffset"] = px.transform(-offset2);
  const pathLength = px.transform(length);
  const pathSpacing = px.transform(spacing);
  attrs["stroke-dasharray"] = `${pathLength} ${pathSpacing}`;
}
function convertSvgStyleToAttributes(keyframes) {
  const attrs = {};
  const styleProps = {};
  for (const key in keyframes) {
    const kebabKey = camelToKebab(key);
    if (kebabKey in SVG_STYLE_TO_ATTRIBUTES) {
      const value = keyframes[key];
      attrs[kebabKey] = isMotionValue(value) ? value.get() : value;
    } else {
      styleProps[key] = keyframes[key];
    }
  }
  if (attrs["path-length"] !== void 0) {
    buildSVGPath$1(attrs, attrs["path-length"], attrs["path-spacing"], attrs["path-offset"]);
  }
  return {
    attrs,
    style: styleProps
  };
}
const underDampedSpring = {
  type: "spring",
  stiffness: 500,
  damping: 25,
  restSpeed: 10
};
const criticallyDampedSpring = (target) => ({
  type: "spring",
  stiffness: 550,
  damping: target === 0 ? 2 * Math.sqrt(550) : 30,
  restSpeed: 10
});
const keyframesTransition = {
  type: "keyframes",
  duration: 0.8
};
const ease = {
  type: "keyframes",
  ease: [0.25, 0.1, 0.35, 1],
  duration: 0.3
};
const getDefaultTransition = (valueKey, { keyframes }) => {
  if (keyframes.length > 2) {
    return keyframesTransition;
  } else if (transformProps.has(valueKey)) {
    return valueKey.startsWith("scale") ? criticallyDampedSpring(keyframes[1]) : underDampedSpring;
  }
  return ease;
};
const doneCallbacks = /* @__PURE__ */ new WeakMap();
const AnimatePresenceContext = new Context2("AnimatePresenceContext");
function isVariantLabels(value) {
  return typeof value === "string" || value === false || Array.isArray(value);
}
const mountedStates = /* @__PURE__ */ new WeakMap();
let id$1 = 0;
const mountedLayoutIds = /* @__PURE__ */ new Set();
class MotionState {
  id;
  type;
  element = null;
  // Parent reference for handling component tree relationships
  parent;
  options;
  isSafeToRemove = false;
  // Track child components for proper lifecycle ordering
  children = /* @__PURE__ */ new Set();
  // Track which animation states are currently active
  activeStates = {
    initial: true,
    animate: true
  };
  /**
   * Current animation process reference
   * Tracks the ongoing animation process for mount/update animations
   * Enables delayed animation loading and parent-child animation orchestration
   * Allows parent variant elements to control child element animations
   */
  currentProcess = null;
  // Base animation target values
  baseTarget;
  // Current animation target values
  target;
  /**
   * The final transition to be applied to the state
   */
  finalTransition;
  featureManager;
  // Visual element instance from Framer Motion
  visualElement;
  constructor(options, parent) {
    this.id = `motion-state-${id$1++}`;
    this.options = options;
    this.parent = parent;
    parent?.children?.add(this);
    const initial = options.initial === void 0 && options.variants ? this.context.initial : options.initial;
    const initialVariantSource = initial === false ? ["initial", "animate"] : ["initial"];
    this.initTarget(initialVariantSource);
    this.featureManager = new FeatureManager(this);
    this.type = isSVGElement(this.options.as) ? "svg" : "html";
  }
  _context = null;
  // Get animation context, falling back to parent context for inheritance
  get context() {
    if (!this._context) {
      const handler = {
        get: (target, prop) => {
          return isVariantLabels(this.options[prop]) ? this.options[prop] : this.parent?.context[prop];
        }
      };
      this._context = new Proxy({}, handler);
    }
    return this._context;
  }
  // Initialize animation target values
  initTarget(initialVariantSource) {
    const custom = this.options.custom ?? this.options.animatePresenceContext?.custom;
    this.baseTarget = initialVariantSource.reduce((acc, variant) => {
      return {
        ...acc,
        ...resolveVariant$1(this.options[variant] || this.context[variant], this.options.variants, custom)
      };
    }, {});
    this.target = {};
  }
  // Update visual element with new options
  updateOptions(options) {
    this.options = options;
    this.visualElement?.update({
      ...this.options,
      whileTap: this.options.whilePress
    }, {
      isPresent: !doneCallbacks.has(this.element)
    });
  }
  // Called before mounting, executes in parent-to-child order
  beforeMount() {
    this.featureManager.beforeMount();
  }
  // Mount motion state to DOM element, handles parent-child relationships
  mount(element2, options, notAnimate = false) {
    invariant(Boolean(element2), "Animation state must be mounted with valid Element");
    this.element = element2;
    this.updateOptions(options);
    this.featureManager.mount();
    if (!notAnimate && this.options.animate) {
      this.startAnimation?.();
    }
    if (this.options.layoutId) {
      mountedLayoutIds.add(this.options.layoutId);
      frame$1.render(() => {
        mountedLayoutIds.clear();
      });
    }
  }
  clearAnimation() {
    this.currentProcess && cancelFrame$1(this.currentProcess);
    this.currentProcess = null;
    this.visualElement?.variantChildren?.forEach((child) => {
      child.state.clearAnimation();
    });
  }
  // update trigger animation
  startAnimation() {
    this.clearAnimation();
    this.currentProcess = frame$1.render(() => {
      this.currentProcess = null;
      this.animateUpdates();
    });
  }
  // Called before unmounting, executes in child-to-parent order
  beforeUnmount() {
    this.featureManager.beforeUnmount();
  }
  unmount(unMountChildren = false) {
    const shouldDelay = this.options.layoutId && !mountedLayoutIds.has(this.options.layoutId);
    const unmount2 = () => {
      const unmountState = () => {
        if (unMountChildren) {
          Array.from(this.children).reverse().forEach(this.unmountChild);
        }
        this.parent?.children?.delete(this);
        mountedStates.delete(this.element);
        this.featureManager.unmount();
        this.visualElement?.unmount();
        this.clearAnimation();
      };
      shouldDelay ? Promise.resolve().then(unmountState) : unmountState();
    };
    unmount2();
  }
  unmountChild(child) {
    child.unmount(true);
  }
  // Called before updating, executes in parent-to-child order
  beforeUpdate() {
    this.featureManager.beforeUpdate();
  }
  // Update motion state with new options
  update(options) {
    this.updateOptions(options);
    this.featureManager.update();
    this.startAnimation();
  }
  // Set animation state active status and propagate to children
  setActive(name, isActive, isAnimate = true) {
    if (!this.element || this.activeStates[name] === isActive)
      return;
    this.activeStates[name] = isActive;
    this.visualElement.variantChildren?.forEach((child) => {
      child.state.setActive(name, isActive, false);
    });
    if (isAnimate) {
      this.animateUpdates({
        isExit: name === "exit" && this.activeStates.exit
      });
    }
  }
  // Core animation update logic
  animateUpdates = noop$2;
  isMounted() {
    return Boolean(this.element);
  }
  // Called before layout updates to prepare for changes
  willUpdate(label) {
    if (this.options.layout || this.options.layoutId) {
      this.visualElement.projection?.willUpdate();
    }
  }
}
const visualElementStore = /* @__PURE__ */ new WeakMap();
function motionEvent(name, target, isExit) {
  return new CustomEvent(name, { detail: { target, isExit } });
}
function getValueState(visualElement) {
  const state = [{}, {}];
  visualElement?.values.forEach((value, key) => {
    state[0][key] = value.get();
    state[1][key] = value.getVelocity();
  });
  return state;
}
function resolveVariantFromProps(props, definition, custom, visualElement) {
  if (typeof definition === "function") {
    const [current, velocity] = getValueState(visualElement);
    definition = definition(custom !== void 0 ? custom : props.custom, current, velocity);
  }
  if (typeof definition === "string") {
    definition = props.variants && props.variants[definition];
  }
  if (typeof definition === "function") {
    const [current, velocity] = getValueState(visualElement);
    definition = definition(custom !== void 0 ? custom : props.custom, current, velocity);
  }
  return definition;
}
function resolveVariant(visualElement, definition, custom) {
  const props = visualElement.getProps();
  return resolveVariantFromProps(props, definition, custom !== void 0 ? custom : props.custom, visualElement);
}
const isKeyframesTarget = (v) => {
  return Array.isArray(v);
};
function setMotionValue(visualElement, key, value) {
  if (visualElement.hasValue(key)) {
    visualElement.getValue(key).set(value);
  } else {
    visualElement.addValue(key, motionValue(value));
  }
}
function resolveFinalValueInKeyframes(v) {
  return isKeyframesTarget(v) ? v[v.length - 1] || 0 : v;
}
function setTarget(visualElement, definition) {
  const resolved = resolveVariant(visualElement, definition);
  let { transitionEnd = {}, transition = {}, ...target } = resolved || {};
  target = { ...target, ...transitionEnd };
  for (const key in target) {
    const value = resolveFinalValueInKeyframes(target[key]);
    setMotionValue(visualElement, key, value);
  }
}
function isWillChangeMotionValue$1(value) {
  return Boolean(isMotionValue$1(value) && value.add);
}
function addValueToWillChange$1(visualElement, key) {
  const willChange = visualElement.getValue("willChange");
  if (isWillChangeMotionValue$1(willChange)) {
    return willChange.add(key);
  } else if (!willChange && MotionGlobalConfig.WillChange) {
    const newWillChange = new MotionGlobalConfig.WillChange("auto");
    visualElement.addValue("willChange", newWillChange);
    newWillChange.add(key);
  }
}
const camelToDash = (str) => str.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase();
const optimizedAppearDataId = "framerAppearId";
const optimizedAppearDataAttribute = "data-" + camelToDash(optimizedAppearDataId);
function getOptimisedAppearId(visualElement) {
  return visualElement.props[optimizedAppearDataAttribute];
}
const isNotNull = (value) => value !== null;
function getFinalKeyframe(keyframes, { repeat, repeatType = "loop" }, finalKeyframe) {
  const resolvedKeyframes = keyframes.filter(isNotNull);
  const index = repeat && repeatType !== "loop" && repeat % 2 === 1 ? 0 : resolvedKeyframes.length - 1;
  return resolvedKeyframes[index];
}
function isTransitionDefined({ when, delay: _delay, delayChildren, staggerChildren, staggerDirection, repeat, repeatType, repeatDelay, from, elapsed, ...transition }) {
  return !!Object.keys(transition).length;
}
const animateMotionValue = (name, value, target, transition = {}, element2, isHandoff) => (onComplete) => {
  const valueTransition = getValueTransition(transition, name) || {};
  const delay2 = valueTransition.delay || transition.delay || 0;
  let { elapsed = 0 } = transition;
  elapsed = elapsed - secondsToMilliseconds(delay2);
  const options = {
    keyframes: Array.isArray(target) ? target : [null, target],
    ease: "easeOut",
    velocity: value.getVelocity(),
    ...valueTransition,
    delay: -elapsed,
    onUpdate: (v) => {
      value.set(v);
      valueTransition.onUpdate && valueTransition.onUpdate(v);
    },
    onComplete: () => {
      onComplete();
      valueTransition.onComplete && valueTransition.onComplete();
    },
    name,
    motionValue: value,
    element: isHandoff ? void 0 : element2
  };
  if (!isTransitionDefined(valueTransition)) {
    Object.assign(options, getDefaultTransition(name, options));
  }
  options.duration && (options.duration = secondsToMilliseconds(options.duration));
  options.repeatDelay && (options.repeatDelay = secondsToMilliseconds(options.repeatDelay));
  if (options.from !== void 0) {
    options.keyframes[0] = options.from;
  }
  let shouldSkip = false;
  if (options.type === false || options.duration === 0 && !options.repeatDelay) {
    makeAnimationInstant(options);
    if (options.delay === 0) {
      shouldSkip = true;
    }
  }
  if (MotionGlobalConfig.instantAnimations || MotionGlobalConfig.skipAnimations) {
    shouldSkip = true;
    makeAnimationInstant(options);
    options.delay = 0;
  }
  options.allowFlatten = !valueTransition.type && !valueTransition.ease;
  if (shouldSkip && !isHandoff && value.get() !== void 0) {
    const finalKeyframe = getFinalKeyframe(options.keyframes, valueTransition);
    if (finalKeyframe !== void 0) {
      frame.update(() => {
        options.onUpdate(finalKeyframe);
        options.onComplete();
      });
      return;
    }
  }
  return valueTransition.isSync ? new JSAnimation(options) : new AsyncMotionValueAnimation(options);
};
function shouldBlockAnimation({ protectedKeys, needsAnimating }, key) {
  const shouldBlock = protectedKeys.hasOwnProperty(key) && needsAnimating[key] !== true;
  needsAnimating[key] = false;
  return shouldBlock;
}
function animateTarget(visualElement, targetAndTransition, { delay: delay2 = 0, transitionOverride, type } = {}) {
  let { transition = visualElement.getDefaultTransition(), transitionEnd, ...target } = targetAndTransition;
  if (transitionOverride)
    transition = transitionOverride;
  const animations = [];
  const animationTypeState = type && visualElement.animationState && visualElement.animationState.getState()[type];
  for (const key in target) {
    const value = visualElement.getValue(key, visualElement.latestValues[key] ?? null);
    const valueTarget = target[key];
    if (valueTarget === void 0 || animationTypeState && shouldBlockAnimation(animationTypeState, key)) {
      continue;
    }
    const valueTransition = {
      delay: delay2,
      ...getValueTransition(transition || {}, key)
    };
    const currentValue = value.get();
    if (currentValue !== void 0 && !value.isAnimating && !Array.isArray(valueTarget) && valueTarget === currentValue && !valueTransition.velocity) {
      continue;
    }
    let isHandoff = false;
    if (window.MotionHandoffAnimation) {
      const appearId = getOptimisedAppearId(visualElement);
      if (appearId) {
        const startTime = window.MotionHandoffAnimation(appearId, key, frame);
        if (startTime !== null) {
          valueTransition.startTime = startTime;
          isHandoff = true;
        }
      }
    }
    addValueToWillChange$1(visualElement, key);
    value.start(animateMotionValue(key, value, valueTarget, visualElement.shouldReduceMotion && positionalKeys.has(key) ? { type: false } : valueTransition, visualElement, isHandoff));
    const animation = value.animation;
    if (animation) {
      animations.push(animation);
    }
  }
  if (transitionEnd) {
    Promise.all(animations).then(() => {
      frame.update(() => {
        transitionEnd && setTarget(visualElement, transitionEnd);
      });
    });
  }
  return animations;
}
function calcChildStagger$1(children, child, delayChildren, staggerChildren = 0, staggerDirection = 1) {
  const index = Array.from(children).sort((a, b) => a.sortNodePosition(b)).indexOf(child);
  const numChildren = children.size;
  const maxStaggerDuration = (numChildren - 1) * staggerChildren;
  const delayIsFunction = typeof delayChildren === "function";
  return delayIsFunction ? delayChildren(index, numChildren) : staggerDirection === 1 ? index * staggerChildren : maxStaggerDuration - index * staggerChildren;
}
function animateVariant(visualElement, variant, options = {}) {
  const resolved = resolveVariant(visualElement, variant, options.type === "exit" ? visualElement.presenceContext?.custom : void 0);
  let { transition = visualElement.getDefaultTransition() || {} } = resolved || {};
  if (options.transitionOverride) {
    transition = options.transitionOverride;
  }
  const getAnimation = resolved ? () => Promise.all(animateTarget(visualElement, resolved, options)) : () => Promise.resolve();
  const getChildAnimations = visualElement.variantChildren && visualElement.variantChildren.size ? (forwardDelay = 0) => {
    const { delayChildren = 0, staggerChildren, staggerDirection } = transition;
    return animateChildren(visualElement, variant, forwardDelay, delayChildren, staggerChildren, staggerDirection, options);
  } : () => Promise.resolve();
  const { when } = transition;
  if (when) {
    const [first, last] = when === "beforeChildren" ? [getAnimation, getChildAnimations] : [getChildAnimations, getAnimation];
    return first().then(() => last());
  } else {
    return Promise.all([getAnimation(), getChildAnimations(options.delay)]);
  }
}
function animateChildren(visualElement, variant, delay2 = 0, delayChildren = 0, staggerChildren = 0, staggerDirection = 1, options) {
  const animations = [];
  for (const child of visualElement.variantChildren) {
    child.notify("AnimationStart", variant);
    animations.push(animateVariant(child, variant, {
      ...options,
      delay: delay2 + (typeof delayChildren === "function" ? 0 : delayChildren) + calcChildStagger$1(visualElement.variantChildren, child, delayChildren, staggerChildren, staggerDirection)
    }).then(() => child.notify("AnimationComplete", variant)));
  }
  return Promise.all(animations);
}
function animateVisualElement(visualElement, definition, options = {}) {
  visualElement.notify("AnimationStart", definition);
  let animation;
  if (Array.isArray(definition)) {
    const animations = definition.map((variant) => animateVariant(visualElement, variant, options));
    animation = Promise.all(animations);
  } else if (typeof definition === "string") {
    animation = animateVariant(visualElement, definition, options);
  } else {
    const resolvedDefinition = typeof definition === "function" ? resolveVariant(visualElement, definition, options.custom) : definition;
    animation = Promise.all(animateTarget(visualElement, resolvedDefinition, options));
  }
  return animation.then(() => {
    visualElement.notify("AnimationComplete", definition);
  });
}
function convertBoundingBoxToBox$1({ top, left, right, bottom }) {
  return {
    x: { min: left, max: right },
    y: { min: top, max: bottom }
  };
}
function transformBoxPoints$1(point, transformPoint2) {
  if (!transformPoint2)
    return point;
  const topLeft = transformPoint2({ x: point.left, y: point.top });
  const bottomRight = transformPoint2({ x: point.right, y: point.bottom });
  return {
    top: topLeft.y,
    left: topLeft.x,
    bottom: bottomRight.y,
    right: bottomRight.x
  };
}
function isIdentityScale(scale) {
  return scale === void 0 || scale === 1;
}
function hasScale({ scale, scaleX, scaleY }) {
  return !isIdentityScale(scale) || !isIdentityScale(scaleX) || !isIdentityScale(scaleY);
}
function hasTransform(values) {
  return hasScale(values) || has2DTranslate(values) || values.z || values.rotate || values.rotateX || values.rotateY || values.skewX || values.skewY;
}
function has2DTranslate(values) {
  return is2DTranslate(values.x) || is2DTranslate(values.y);
}
function is2DTranslate(value) {
  return value && value !== "0%";
}
function scalePoint(point, scale, originPoint) {
  const distanceFromOrigin = point - originPoint;
  const scaled = scale * distanceFromOrigin;
  return originPoint + scaled;
}
function applyPointDelta(point, translate, scale, originPoint, boxScale) {
  if (boxScale !== void 0) {
    point = scalePoint(point, boxScale, originPoint);
  }
  return scalePoint(point, scale, originPoint) + translate;
}
function applyAxisDelta(axis, translate = 0, scale = 1, originPoint, boxScale) {
  axis.min = applyPointDelta(axis.min, translate, scale, originPoint, boxScale);
  axis.max = applyPointDelta(axis.max, translate, scale, originPoint, boxScale);
}
function applyBoxDelta(box, { x, y }) {
  applyAxisDelta(box.x, x.translate, x.scale, x.originPoint);
  applyAxisDelta(box.y, y.translate, y.scale, y.originPoint);
}
const TREE_SCALE_SNAP_MIN = 0.999999999999;
const TREE_SCALE_SNAP_MAX = 1.0000000000001;
function applyTreeDeltas(box, treeScale, treePath, isSharedTransition = false) {
  const treeLength = treePath.length;
  if (!treeLength)
    return;
  treeScale.x = treeScale.y = 1;
  let node;
  let delta;
  for (let i = 0; i < treeLength; i++) {
    node = treePath[i];
    delta = node.projectionDelta;
    const { visualElement } = node.options;
    if (visualElement && visualElement.props.style && visualElement.props.style.display === "contents") {
      continue;
    }
    if (isSharedTransition && node.options.layoutScroll && node.scroll && node !== node.root) {
      transformBox(box, {
        x: -node.scroll.offset.x,
        y: -node.scroll.offset.y
      });
    }
    if (delta) {
      treeScale.x *= delta.x.scale;
      treeScale.y *= delta.y.scale;
      applyBoxDelta(box, delta);
    }
    if (isSharedTransition && hasTransform(node.latestValues)) {
      transformBox(box, node.latestValues);
    }
  }
  if (treeScale.x < TREE_SCALE_SNAP_MAX && treeScale.x > TREE_SCALE_SNAP_MIN) {
    treeScale.x = 1;
  }
  if (treeScale.y < TREE_SCALE_SNAP_MAX && treeScale.y > TREE_SCALE_SNAP_MIN) {
    treeScale.y = 1;
  }
}
function translateAxis$1(axis, distance) {
  axis.min = axis.min + distance;
  axis.max = axis.max + distance;
}
function transformAxis(axis, axisTranslate, axisScale, boxScale, axisOrigin = 0.5) {
  const originPoint = mixNumber(axis.min, axis.max, axisOrigin);
  applyAxisDelta(axis, axisTranslate, axisScale, originPoint, boxScale);
}
function transformBox(box, transform) {
  transformAxis(box.x, transform.x, transform.scaleX, transform.scale, transform.originX);
  transformAxis(box.y, transform.y, transform.scaleY, transform.scale, transform.originY);
}
function measureViewportBox$1(instance, transformPoint2) {
  return convertBoundingBoxToBox$1(transformBoxPoints$1(instance.getBoundingClientRect(), transformPoint2));
}
const featureProps = {
  animation: [
    "animate",
    "variants",
    "whileHover",
    "whileTap",
    "exit",
    "whileInView",
    "whileFocus",
    "whileDrag"
  ],
  exit: ["exit"],
  drag: ["drag", "dragControls"],
  focus: ["whileFocus"],
  hover: ["whileHover", "onHoverStart", "onHoverEnd"],
  tap: ["whileTap", "onTap", "onTapStart", "onTapCancel"],
  pan: ["onPan", "onPanStart", "onPanSessionStart", "onPanEnd"],
  inView: ["whileInView", "onViewportEnter", "onViewportLeave"],
  layout: ["layout", "layoutId"]
};
const featureDefinitions = {};
for (const key in featureProps) {
  featureDefinitions[key] = {
    isEnabled: (props) => featureProps[key].some((name) => !!props[name])
  };
}
const createAxisDelta = () => ({
  translate: 0,
  scale: 1,
  origin: 0,
  originPoint: 0
});
const createDelta = () => ({
  x: createAxisDelta(),
  y: createAxisDelta()
});
const createAxis$1 = () => ({ min: 0, max: 0 });
const createBox$1 = () => ({
  x: createAxis$1(),
  y: createAxis$1()
});
const isBrowser = typeof window !== "undefined";
const prefersReducedMotion$1 = { current: null };
const hasReducedMotionListener = { current: false };
function initPrefersReducedMotion() {
  hasReducedMotionListener.current = true;
  if (!isBrowser)
    return;
  if (window.matchMedia) {
    const motionMediaQuery = window.matchMedia("(prefers-reduced-motion)");
    const setReducedMotionPreferences = () => prefersReducedMotion$1.current = motionMediaQuery.matches;
    motionMediaQuery.addEventListener("change", setReducedMotionPreferences);
    setReducedMotionPreferences();
  } else {
    prefersReducedMotion$1.current = false;
  }
}
function isAnimationControls(v) {
  return v !== null && typeof v === "object" && typeof v.start === "function";
}
function isVariantLabel(v) {
  return typeof v === "string" || Array.isArray(v);
}
const variantPriorityOrder = [
  "animate",
  "whileInView",
  "whileFocus",
  "whileHover",
  "whileTap",
  "whileDrag",
  "exit"
];
const variantProps = ["initial", ...variantPriorityOrder];
function isControllingVariants(props) {
  return isAnimationControls(props.animate) || variantProps.some((name) => isVariantLabel(props[name]));
}
function isVariantNode(props) {
  return Boolean(isControllingVariants(props) || props.variants);
}
function updateMotionValuesFromProps(element2, next, prev) {
  for (const key in next) {
    const nextValue = next[key];
    const prevValue = prev[key];
    if (isMotionValue$1(nextValue)) {
      element2.addValue(key, nextValue);
    } else if (isMotionValue$1(prevValue)) {
      element2.addValue(key, motionValue(nextValue, { owner: element2 }));
    } else if (prevValue !== nextValue) {
      if (element2.hasValue(key)) {
        const existingValue = element2.getValue(key);
        if (existingValue.liveStyle === true) {
          existingValue.jump(nextValue);
        } else if (!existingValue.hasAnimated) {
          existingValue.set(nextValue);
        }
      } else {
        const latestValue = element2.getStaticValue(key);
        element2.addValue(key, motionValue(latestValue !== void 0 ? latestValue : nextValue, { owner: element2 }));
      }
    }
  }
  for (const key in prev) {
    if (next[key] === void 0)
      element2.removeValue(key);
  }
  return next;
}
const propEventHandlers = [
  "AnimationStart",
  "AnimationComplete",
  "Update",
  "BeforeLayoutMeasure",
  "LayoutMeasure",
  "LayoutAnimationStart",
  "LayoutAnimationComplete"
];
class VisualElement {
  /**
   * This method takes React props and returns found MotionValues. For example, HTML
   * MotionValues will be found within the style prop, whereas for Three.js within attribute arrays.
   *
   * This isn't an abstract method as it needs calling in the constructor, but it is
   * intended to be one.
   */
  scrapeMotionValuesFromProps(_props, _prevProps, _visualElement) {
    return {};
  }
  constructor({ parent, props, presenceContext, reducedMotionConfig, blockInitialAnimation, visualState }, options = {}) {
    this.current = null;
    this.children = /* @__PURE__ */ new Set();
    this.isVariantNode = false;
    this.isControllingVariants = false;
    this.shouldReduceMotion = null;
    this.values = /* @__PURE__ */ new Map();
    this.KeyframeResolver = KeyframeResolver;
    this.features = {};
    this.valueSubscriptions = /* @__PURE__ */ new Map();
    this.prevMotionValues = {};
    this.events = {};
    this.propEventSubscriptions = {};
    this.notifyUpdate = () => this.notify("Update", this.latestValues);
    this.render = () => {
      if (!this.current)
        return;
      this.triggerBuild();
      this.renderInstance(this.current, this.renderState, this.props.style, this.projection);
    };
    this.renderScheduledAt = 0;
    this.scheduleRender = () => {
      const now2 = time.now();
      if (this.renderScheduledAt < now2) {
        this.renderScheduledAt = now2;
        frame.render(this.render, false, true);
      }
    };
    const { latestValues, renderState } = visualState;
    this.latestValues = latestValues;
    this.baseTarget = { ...latestValues };
    this.initialValues = props.initial ? { ...latestValues } : {};
    this.renderState = renderState;
    this.parent = parent;
    this.props = props;
    this.presenceContext = presenceContext;
    this.depth = parent ? parent.depth + 1 : 0;
    this.reducedMotionConfig = reducedMotionConfig;
    this.options = options;
    this.blockInitialAnimation = Boolean(blockInitialAnimation);
    this.isControllingVariants = isControllingVariants(props);
    this.isVariantNode = isVariantNode(props);
    if (this.isVariantNode) {
      this.variantChildren = /* @__PURE__ */ new Set();
    }
    this.manuallyAnimateOnMount = Boolean(parent && parent.current);
    const { willChange, ...initialMotionValues } = this.scrapeMotionValuesFromProps(props, {}, this);
    for (const key in initialMotionValues) {
      const value = initialMotionValues[key];
      if (latestValues[key] !== void 0 && isMotionValue$1(value)) {
        value.set(latestValues[key]);
      }
    }
  }
  mount(instance) {
    this.current = instance;
    visualElementStore.set(instance, this);
    if (this.projection && !this.projection.instance) {
      this.projection.mount(instance);
    }
    if (this.parent && this.isVariantNode && !this.isControllingVariants) {
      this.removeFromVariantTree = this.parent.addVariantChild(this);
    }
    this.values.forEach((value, key) => this.bindToMotionValue(key, value));
    if (!hasReducedMotionListener.current) {
      initPrefersReducedMotion();
    }
    this.shouldReduceMotion = this.reducedMotionConfig === "never" ? false : this.reducedMotionConfig === "always" ? true : prefersReducedMotion$1.current;
    if (process.env.NODE_ENV !== "production") {
      warnOnce(this.shouldReduceMotion !== true, "You have Reduced Motion enabled on your device. Animations may not appear as expected.", "reduced-motion-disabled");
    }
    this.parent?.addChild(this);
    this.update(this.props, this.presenceContext);
  }
  unmount() {
    this.projection && this.projection.unmount();
    cancelFrame(this.notifyUpdate);
    cancelFrame(this.render);
    this.valueSubscriptions.forEach((remove) => remove());
    this.valueSubscriptions.clear();
    this.removeFromVariantTree && this.removeFromVariantTree();
    this.parent?.removeChild(this);
    for (const key in this.events) {
      this.events[key].clear();
    }
    for (const key in this.features) {
      const feature = this.features[key];
      if (feature) {
        feature.unmount();
        feature.isMounted = false;
      }
    }
    this.current = null;
  }
  addChild(child) {
    this.children.add(child);
    this.enteringChildren ?? (this.enteringChildren = /* @__PURE__ */ new Set());
    this.enteringChildren.add(child);
  }
  removeChild(child) {
    this.children.delete(child);
    this.enteringChildren && this.enteringChildren.delete(child);
  }
  bindToMotionValue(key, value) {
    if (this.valueSubscriptions.has(key)) {
      this.valueSubscriptions.get(key)();
    }
    const valueIsTransform = transformProps.has(key);
    if (valueIsTransform && this.onBindTransform) {
      this.onBindTransform();
    }
    const removeOnChange = value.on("change", (latestValue) => {
      this.latestValues[key] = latestValue;
      this.props.onUpdate && frame.preRender(this.notifyUpdate);
      if (valueIsTransform && this.projection) {
        this.projection.isTransformDirty = true;
      }
      this.scheduleRender();
    });
    let removeSyncCheck;
    if (window.MotionCheckAppearSync) {
      removeSyncCheck = window.MotionCheckAppearSync(this, key, value);
    }
    this.valueSubscriptions.set(key, () => {
      removeOnChange();
      if (removeSyncCheck)
        removeSyncCheck();
      if (value.owner)
        value.stop();
    });
  }
  sortNodePosition(other) {
    if (!this.current || !this.sortInstanceNodePosition || this.type !== other.type) {
      return 0;
    }
    return this.sortInstanceNodePosition(this.current, other.current);
  }
  updateFeatures() {
    let key = "animation";
    for (key in featureDefinitions) {
      const featureDefinition = featureDefinitions[key];
      if (!featureDefinition)
        continue;
      const { isEnabled, Feature: FeatureConstructor } = featureDefinition;
      if (!this.features[key] && FeatureConstructor && isEnabled(this.props)) {
        this.features[key] = new FeatureConstructor(this);
      }
      if (this.features[key]) {
        const feature = this.features[key];
        if (feature.isMounted) {
          feature.update();
        } else {
          feature.mount();
          feature.isMounted = true;
        }
      }
    }
  }
  triggerBuild() {
    this.build(this.renderState, this.latestValues, this.props);
  }
  /**
   * Measure the current viewport box with or without transforms.
   * Only measures axis-aligned boxes, rotate and skew must be manually
   * removed with a re-render to work.
   */
  measureViewportBox() {
    return this.current ? this.measureInstanceViewportBox(this.current, this.props) : createBox$1();
  }
  getStaticValue(key) {
    return this.latestValues[key];
  }
  setStaticValue(key, value) {
    this.latestValues[key] = value;
  }
  /**
   * Update the provided props. Ensure any newly-added motion values are
   * added to our map, old ones removed, and listeners updated.
   */
  update(props, presenceContext) {
    if (props.transformTemplate || this.props.transformTemplate) {
      this.scheduleRender();
    }
    this.prevProps = this.props;
    this.props = props;
    this.prevPresenceContext = this.presenceContext;
    this.presenceContext = presenceContext;
    for (let i = 0; i < propEventHandlers.length; i++) {
      const key = propEventHandlers[i];
      if (this.propEventSubscriptions[key]) {
        this.propEventSubscriptions[key]();
        delete this.propEventSubscriptions[key];
      }
      const listenerName = "on" + key;
      const listener = props[listenerName];
      if (listener) {
        this.propEventSubscriptions[key] = this.on(key, listener);
      }
    }
    this.prevMotionValues = updateMotionValuesFromProps(this, this.scrapeMotionValuesFromProps(props, this.prevProps, this), this.prevMotionValues);
    if (this.handleChildMotionValue) {
      this.handleChildMotionValue();
    }
  }
  getProps() {
    return this.props;
  }
  /**
   * Returns the variant definition with a given name.
   */
  getVariant(name) {
    return this.props.variants ? this.props.variants[name] : void 0;
  }
  /**
   * Returns the defined default transition on this component.
   */
  getDefaultTransition() {
    return this.props.transition;
  }
  getTransformPagePoint() {
    return this.props.transformPagePoint;
  }
  getClosestVariantNode() {
    return this.isVariantNode ? this : this.parent ? this.parent.getClosestVariantNode() : void 0;
  }
  /**
   * Add a child visual element to our set of children.
   */
  addVariantChild(child) {
    const closestVariantNode = this.getClosestVariantNode();
    if (closestVariantNode) {
      closestVariantNode.variantChildren && closestVariantNode.variantChildren.add(child);
      return () => closestVariantNode.variantChildren.delete(child);
    }
  }
  /**
   * Add a motion value and bind it to this visual element.
   */
  addValue(key, value) {
    const existingValue = this.values.get(key);
    if (value !== existingValue) {
      if (existingValue)
        this.removeValue(key);
      this.bindToMotionValue(key, value);
      this.values.set(key, value);
      this.latestValues[key] = value.get();
    }
  }
  /**
   * Remove a motion value and unbind any active subscriptions.
   */
  removeValue(key) {
    this.values.delete(key);
    const unsubscribe = this.valueSubscriptions.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.valueSubscriptions.delete(key);
    }
    delete this.latestValues[key];
    this.removeValueFromRenderState(key, this.renderState);
  }
  /**
   * Check whether we have a motion value for this key
   */
  hasValue(key) {
    return this.values.has(key);
  }
  getValue(key, defaultValue) {
    if (this.props.values && this.props.values[key]) {
      return this.props.values[key];
    }
    let value = this.values.get(key);
    if (value === void 0 && defaultValue !== void 0) {
      value = motionValue(defaultValue === null ? void 0 : defaultValue, { owner: this });
      this.addValue(key, value);
    }
    return value;
  }
  /**
   * If we're trying to animate to a previously unencountered value,
   * we need to check for it in our state and as a last resort read it
   * directly from the instance (which might have performance implications).
   */
  readValue(key, target) {
    let value = this.latestValues[key] !== void 0 || !this.current ? this.latestValues[key] : this.getBaseTargetFromProps(this.props, key) ?? this.readValueFromInstance(this.current, key, this.options);
    if (value !== void 0 && value !== null) {
      if (typeof value === "string" && (isNumericalString(value) || isZeroValueString(value))) {
        value = parseFloat(value);
      } else if (!findValueType(value) && complex.test(target)) {
        value = getAnimatableNone(key, target);
      }
      this.setBaseTarget(key, isMotionValue$1(value) ? value.get() : value);
    }
    return isMotionValue$1(value) ? value.get() : value;
  }
  /**
   * Set the base target to later animate back to. This is currently
   * only hydrated on creation and when we first read a value.
   */
  setBaseTarget(key, value) {
    this.baseTarget[key] = value;
  }
  /**
   * Find the base target for a value thats been removed from all animation
   * props.
   */
  getBaseTarget(key) {
    const { initial } = this.props;
    let valueFromInitial;
    if (typeof initial === "string" || typeof initial === "object") {
      const variant = resolveVariantFromProps(this.props, initial, this.presenceContext?.custom);
      if (variant) {
        valueFromInitial = variant[key];
      }
    }
    if (initial && valueFromInitial !== void 0) {
      return valueFromInitial;
    }
    const target = this.getBaseTargetFromProps(this.props, key);
    if (target !== void 0 && !isMotionValue$1(target))
      return target;
    return this.initialValues[key] !== void 0 && valueFromInitial === void 0 ? void 0 : this.baseTarget[key];
  }
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = new SubscriptionManager();
    }
    return this.events[eventName].add(callback);
  }
  notify(eventName, ...args) {
    if (this.events[eventName]) {
      this.events[eventName].notify(...args);
    }
  }
  scheduleRenderMicrotask() {
    microtask.render(this.render);
  }
}
class DOMVisualElement extends VisualElement {
  constructor() {
    super(...arguments);
    this.KeyframeResolver = DOMKeyframesResolver;
  }
  sortInstanceNodePosition(a, b) {
    return a.compareDocumentPosition(b) & 2 ? 1 : -1;
  }
  getBaseTargetFromProps(props, key) {
    return props.style ? props.style[key] : void 0;
  }
  removeValueFromRenderState(key, { vars, style: style2 }) {
    delete vars[key];
    delete style2[key];
  }
  handleChildMotionValue() {
    if (this.childSubscription) {
      this.childSubscription();
      delete this.childSubscription;
    }
    const { children } = this.props;
    if (isMotionValue$1(children)) {
      this.childSubscription = children.on("change", (latest) => {
        if (this.current) {
          this.current.textContent = `${latest}`;
        }
      });
    }
  }
}
const translateAlias = {
  x: "translateX",
  y: "translateY",
  z: "translateZ",
  transformPerspective: "perspective"
};
const numTransforms = transformPropOrder.length;
function buildTransform(latestValues, transform, transformTemplate) {
  let transformString = "";
  let transformIsDefault = true;
  for (let i = 0; i < numTransforms; i++) {
    const key = transformPropOrder[i];
    const value = latestValues[key];
    if (value === void 0)
      continue;
    let valueIsDefault = true;
    if (typeof value === "number") {
      valueIsDefault = value === (key.startsWith("scale") ? 1 : 0);
    } else {
      valueIsDefault = parseFloat(value) === 0;
    }
    if (!valueIsDefault || transformTemplate) {
      const valueAsType = getValueAsType(value, numberValueTypes[key]);
      if (!valueIsDefault) {
        transformIsDefault = false;
        const transformName = translateAlias[key] || key;
        transformString += `${transformName}(${valueAsType}) `;
      }
      if (transformTemplate) {
        transform[key] = valueAsType;
      }
    }
  }
  transformString = transformString.trim();
  if (transformTemplate) {
    transformString = transformTemplate(transform, transformIsDefault ? "" : transformString);
  } else if (transformIsDefault) {
    transformString = "none";
  }
  return transformString;
}
function buildHTMLStyles(state, latestValues, transformTemplate) {
  const { style: style2, vars, transformOrigin: transformOrigin2 } = state;
  let hasTransform2 = false;
  let hasTransformOrigin = false;
  for (const key in latestValues) {
    const value = latestValues[key];
    if (transformProps.has(key)) {
      hasTransform2 = true;
      continue;
    } else if (isCSSVariableName(key)) {
      vars[key] = value;
      continue;
    } else {
      const valueAsType = getValueAsType(value, numberValueTypes[key]);
      if (key.startsWith("origin")) {
        hasTransformOrigin = true;
        transformOrigin2[key] = valueAsType;
      } else {
        style2[key] = valueAsType;
      }
    }
  }
  if (!latestValues.transform) {
    if (hasTransform2 || transformTemplate) {
      style2.transform = buildTransform(latestValues, state.transform, transformTemplate);
    } else if (style2.transform) {
      style2.transform = "none";
    }
  }
  if (hasTransformOrigin) {
    const { originX = "50%", originY = "50%", originZ = 0 } = transformOrigin2;
    style2.transformOrigin = `${originX} ${originY} ${originZ}`;
  }
}
function renderHTML(element2, { style: style2, vars }, styleProp, projection) {
  const elementStyle = element2.style;
  let key;
  for (key in style2) {
    elementStyle[key] = style2[key];
  }
  projection?.applyProjectionStyles(elementStyle, styleProp);
  for (key in vars) {
    elementStyle.setProperty(key, vars[key]);
  }
}
function isForcedMotionValue(key, { layout, layoutId }) {
  return transformProps.has(key) || key.startsWith("origin") || (layout || layoutId !== void 0) && (!!scaleCorrectors$1[key] || key === "opacity");
}
function scrapeMotionValuesFromProps$1(props, prevProps, visualElement) {
  const { style: style2 } = props;
  const newValues = {};
  for (const key in style2) {
    if (isMotionValue$1(style2[key]) || prevProps.style && isMotionValue$1(prevProps.style[key]) || isForcedMotionValue(key, props) || visualElement?.getValue(key)?.liveStyle !== void 0) {
      newValues[key] = style2[key];
    }
  }
  return newValues;
}
function getComputedStyle$1(element2) {
  return window.getComputedStyle(element2);
}
class HTMLVisualElement extends DOMVisualElement {
  constructor() {
    super(...arguments);
    this.type = "html";
    this.renderInstance = renderHTML;
  }
  readValueFromInstance(instance, key) {
    if (transformProps.has(key)) {
      return this.projection?.isProjecting ? defaultTransformValue(key) : readTransformValue(instance, key);
    } else {
      const computedStyle = getComputedStyle$1(instance);
      const value = (isCSSVariableName(key) ? computedStyle.getPropertyValue(key) : computedStyle[key]) || 0;
      return typeof value === "string" ? value.trim() : value;
    }
  }
  measureInstanceViewportBox(instance, { transformPagePoint }) {
    return measureViewportBox$1(instance, transformPagePoint);
  }
  build(renderState, latestValues, props) {
    buildHTMLStyles(renderState, latestValues, props.transformTemplate);
  }
  scrapeMotionValuesFromProps(props, prevProps, visualElement) {
    return scrapeMotionValuesFromProps$1(props, prevProps, visualElement);
  }
}
const dashKeys = {
  offset: "stroke-dashoffset",
  array: "stroke-dasharray"
};
const camelKeys = {
  offset: "strokeDashoffset",
  array: "strokeDasharray"
};
function buildSVGPath(attrs, length, spacing = 1, offset2 = 0, useDashCase = true) {
  attrs.pathLength = 1;
  const keys = useDashCase ? dashKeys : camelKeys;
  attrs[keys.offset] = px$1.transform(-offset2);
  const pathLength = px$1.transform(length);
  const pathSpacing = px$1.transform(spacing);
  attrs[keys.array] = `${pathLength} ${pathSpacing}`;
}
function buildSVGAttrs(state, {
  attrX,
  attrY,
  attrScale,
  pathLength,
  pathSpacing = 1,
  pathOffset = 0,
  // This is object creation, which we try to avoid per-frame.
  ...latest
}, isSVGTag2, transformTemplate, styleProp) {
  buildHTMLStyles(state, latest, transformTemplate);
  if (isSVGTag2) {
    if (state.style.viewBox) {
      state.attrs.viewBox = state.style.viewBox;
    }
    return;
  }
  state.attrs = state.style;
  state.style = {};
  const { attrs, style: style2 } = state;
  if (attrs.transform) {
    style2.transform = attrs.transform;
    delete attrs.transform;
  }
  if (style2.transform || attrs.transformOrigin) {
    style2.transformOrigin = attrs.transformOrigin ?? "50% 50%";
    delete attrs.transformOrigin;
  }
  if (style2.transform) {
    style2.transformBox = styleProp?.transformBox ?? "fill-box";
    delete attrs.transformBox;
  }
  if (attrX !== void 0)
    attrs.x = attrX;
  if (attrY !== void 0)
    attrs.y = attrY;
  if (attrScale !== void 0)
    attrs.scale = attrScale;
  if (pathLength !== void 0) {
    buildSVGPath(attrs, pathLength, pathSpacing, pathOffset, false);
  }
}
const camelCaseAttributes = /* @__PURE__ */ new Set([
  "baseFrequency",
  "diffuseConstant",
  "kernelMatrix",
  "kernelUnitLength",
  "keySplines",
  "keyTimes",
  "limitingConeAngle",
  "markerHeight",
  "markerWidth",
  "numOctaves",
  "targetX",
  "targetY",
  "surfaceScale",
  "specularConstant",
  "specularExponent",
  "stdDeviation",
  "tableValues",
  "viewBox",
  "gradientTransform",
  "pathLength",
  "startOffset",
  "textLength",
  "lengthAdjust"
]);
const isSVGTag = (tag) => typeof tag === "string" && tag.toLowerCase() === "svg";
function renderSVG(element2, renderState, _styleProp, projection) {
  renderHTML(element2, renderState, void 0, projection);
  for (const key in renderState.attrs) {
    element2.setAttribute(!camelCaseAttributes.has(key) ? camelToDash(key) : key, renderState.attrs[key]);
  }
}
function scrapeMotionValuesFromProps(props, prevProps, visualElement) {
  const newValues = scrapeMotionValuesFromProps$1(props, prevProps, visualElement);
  for (const key in props) {
    if (isMotionValue$1(props[key]) || isMotionValue$1(prevProps[key])) {
      const targetKey = transformPropOrder.indexOf(key) !== -1 ? "attr" + key.charAt(0).toUpperCase() + key.substring(1) : key;
      newValues[targetKey] = props[key];
    }
  }
  return newValues;
}
class SVGVisualElement extends DOMVisualElement {
  constructor() {
    super(...arguments);
    this.type = "svg";
    this.isSVGTag = false;
    this.measureInstanceViewportBox = createBox$1;
  }
  getBaseTargetFromProps(props, key) {
    return props[key];
  }
  readValueFromInstance(instance, key) {
    if (transformProps.has(key)) {
      const defaultType = getDefaultValueType(key);
      return defaultType ? defaultType.default || 0 : 0;
    }
    key = !camelCaseAttributes.has(key) ? camelToDash(key) : key;
    return instance.getAttribute(key);
  }
  scrapeMotionValuesFromProps(props, prevProps, visualElement) {
    return scrapeMotionValuesFromProps(props, prevProps, visualElement);
  }
  build(renderState, latestValues, props) {
    buildSVGAttrs(renderState, latestValues, this.isSVGTag, props.transformTemplate, props.style);
  }
  renderInstance(instance, renderState, styleProp, projection) {
    renderSVG(instance, renderState, styleProp, projection);
  }
  mount(instance) {
    this.isSVGTag = isSVGTag(instance.tagName);
    super.mount(instance);
  }
}
function createVisualElement(Component, options) {
  return isSVGElement(Component) ? new SVGVisualElement(options) : new HTMLVisualElement(options);
}
function calcChildStagger(children, child, delayChildren, staggerChildren = 0, staggerDirection = 1) {
  const sortedChildren = Array.from(children).sort((a, b) => a.sortNodePosition(b));
  const index = sortedChildren.indexOf(child);
  const numChildren = children.size;
  const maxStaggerDuration = (numChildren - 1) * staggerChildren;
  const delayIsFunction = typeof delayChildren === "function";
  if (index === sortedChildren.length - 1) {
    child.parent.enteringChildren = void 0;
  }
  return delayIsFunction ? delayChildren(index, numChildren) : staggerDirection === 1 ? index * staggerChildren : maxStaggerDuration - index * staggerChildren;
}
const STATE_TYPES = [
  "initial",
  "animate",
  "whileInView",
  "whileHover",
  "whilePress",
  "whileDrag",
  "whileFocus",
  "exit"
];
class AnimationFeature extends Feature {
  unmountControls;
  constructor(state) {
    super(state);
    this.state.visualElement = createVisualElement(this.state.options.as, {
      presenceContext: null,
      parent: this.state.parent?.visualElement,
      props: {
        ...this.state.options,
        whileTap: this.state.options.whilePress
      },
      visualState: {
        renderState: {
          transform: {},
          transformOrigin: {},
          style: {},
          vars: {},
          attrs: {}
        },
        latestValues: {
          ...this.state.baseTarget
        }
      },
      reducedMotionConfig: this.state.options.motionConfig.reducedMotion
    });
    this.state.visualElement.parent?.addChild(this.state.visualElement);
    this.state.animateUpdates = this.animateUpdates;
    if (this.state.isMounted())
      this.state.startAnimation();
  }
  updateAnimationControlsSubscription() {
    const { animate } = this.state.options;
    if (isAnimationControls$1(animate)) {
      this.unmountControls = animate.subscribe(this.state);
    }
  }
  animateUpdates = ({ controlActiveState, directAnimate, directTransition, controlDelay = 0, isExit } = {}) => {
    const { reducedMotion } = this.state.options.motionConfig;
    this.state.visualElement.shouldReduceMotion = reducedMotion === "always" || reducedMotion === "user" && !!prefersReducedMotion$1.current;
    const prevTarget = this.state.target;
    this.state.target = { ...this.state.baseTarget };
    let animationOptions = {};
    animationOptions = this.resolveStateAnimation({
      controlActiveState,
      directAnimate,
      directTransition
    });
    this.state.finalTransition = animationOptions;
    const factories = this.createAnimationFactories(prevTarget, animationOptions, controlDelay);
    const { getChildAnimations } = this.setupChildAnimations(animationOptions, this.state.activeStates);
    return this.executeAnimations({
      factories,
      getChildAnimations,
      transition: animationOptions,
      controlActiveState,
      isExit
    });
  };
  executeAnimations({ factories, getChildAnimations, transition, controlActiveState, isExit = false }) {
    const getAnimation = () => Promise.all(factories.map((factory) => factory()).filter(Boolean));
    const animationTarget2 = { ...this.state.target };
    const element2 = this.state.element;
    const finishAnimation2 = (animationPromise) => {
      element2.dispatchEvent(motionEvent("motionstart", animationTarget2));
      this.state.options.onAnimationStart?.(animationTarget2);
      animationPromise.then(() => {
        element2.dispatchEvent(motionEvent("motioncomplete", animationTarget2, isExit));
        this.state.options.onAnimationComplete?.(animationTarget2);
      }).catch(noop$2);
    };
    const getAnimationPromise = () => {
      const animationPromise = transition?.when ? (transition.when === "beforeChildren" ? getAnimation() : getChildAnimations()).then(() => transition.when === "beforeChildren" ? getChildAnimations() : getAnimation()) : Promise.all([getAnimation(), getChildAnimations()]);
      finishAnimation2(animationPromise);
      return animationPromise;
    };
    return controlActiveState ? getAnimationPromise : getAnimationPromise();
  }
  /**
   * Setup child animations
   */
  setupChildAnimations(transition, controlActiveState) {
    const visualElement = this.state.visualElement;
    if (!visualElement.variantChildren?.size || !controlActiveState)
      return { getChildAnimations: () => Promise.resolve() };
    const { staggerChildren = 0, staggerDirection = 1, delayChildren = 0 } = transition || {};
    const numChildren = visualElement.variantChildren.size;
    const maxStaggerDuration = (numChildren - 1) * staggerChildren;
    const delayIsFunction = typeof delayChildren === "function";
    const generateStaggerDuration = delayIsFunction ? (i) => delayChildren(i, numChildren) : (
      // Support deprecated staggerChildren,will be removed in next major version
      staggerDirection === 1 ? (i = 0) => i * staggerChildren : (i = 0) => maxStaggerDuration - i * staggerChildren
    );
    const childAnimations = Array.from(visualElement.variantChildren).map((child, index) => {
      return child.state.animateUpdates({
        controlActiveState,
        controlDelay: (delayIsFunction ? 0 : delayChildren) + generateStaggerDuration(index)
      });
    });
    return {
      getChildAnimations: () => Promise.all(childAnimations.map((animation) => {
        return animation();
      }))
    };
  }
  createAnimationFactories(prevTarget, animationOptions, controlDelay) {
    const factories = [];
    const target = {};
    for (const key in this.state.target) {
      if (!hasChanged(prevTarget[key], this.state.target[key]))
        continue;
      this.state.baseTarget[key] ??= style.get(this.state.element, key);
      target[key] = this.state.target[key] === "none" && isDef(transformResetValue[key]) ? transformResetValue[key] : this.state.target[key];
    }
    if (Object.keys(target).length) {
      factories.push(() => animateVisualElement(this.state.visualElement, { ...target, transition: animationOptions }, { delay: controlDelay }));
    }
    return factories;
  }
  resolveStateAnimation({ controlActiveState, directAnimate, directTransition }) {
    let variantTransition = this.state.options.transition;
    let variant = {};
    const { variants, custom, transition, animatePresenceContext } = this.state.options;
    const customValue = animatePresenceContext?.custom ?? custom;
    this.state.activeStates = { ...this.state.activeStates, ...controlActiveState };
    STATE_TYPES.forEach((name) => {
      if (!this.state.activeStates[name] || isAnimationControls$1(this.state.options[name]))
        return;
      const definition = this.state.options[name];
      let resolvedVariant = isDef(definition) ? resolveVariant$1(definition, variants, customValue) : void 0;
      if (this.state.visualElement.isVariantNode) {
        const controlVariant = resolveVariant$1(this.state.context[name], variants, customValue);
        resolvedVariant = controlVariant ? Object.assign(controlVariant || {}, resolvedVariant) : variant;
      }
      if (!resolvedVariant)
        return;
      if (name !== "initial")
        variantTransition = resolvedVariant.transition || this.state.options.transition || {};
      variant = Object.assign(variant, resolvedVariant);
    });
    if (directAnimate) {
      variant = resolveVariant$1(directAnimate, variants, customValue);
      variantTransition = variant.transition || directTransition || transition;
    }
    Object.entries(variant).forEach(([key, value]) => {
      if (key === "transition")
        return;
      this.state.target[key] = value;
    });
    return variantTransition;
  }
  /**
   * Subscribe any provided AnimationControls to the component's VisualElement
   */
  mount() {
    const { element: element2 } = this.state;
    mountedStates.set(element2, this.state);
    if (!visualElementStore.get(element2)) {
      this.state.visualElement.mount(element2);
      visualElementStore.set(element2, this.state.visualElement);
    }
    this.state.visualElement.state = this.state;
    this.updateAnimationControlsSubscription();
    const visualElement = this.state.visualElement;
    const parentVisualElement = visualElement.parent;
    visualElement.enteringChildren = void 0;
    if (this.state.parent?.isMounted() && !visualElement.isControllingVariants && parentVisualElement?.enteringChildren?.has(visualElement)) {
      const parentOptions = this.state.parent.options;
      const parentCustom = parentOptions.custom ?? parentOptions.animatePresenceContext?.custom;
      const derivedParentVariant = parentOptions.animate ? resolveVariant$1(parentOptions.animate, parentOptions.variants, parentCustom) : void 0;
      const parentTransition = this.state.parent.finalTransition || derivedParentVariant?.transition || {};
      const { delayChildren, staggerChildren = 0, staggerDirection = 1 } = parentTransition;
      const delayIsFunction = typeof delayChildren === "function";
      const group = parentVisualElement.variantChildren?.size ? parentVisualElement.variantChildren : parentVisualElement.enteringChildren?.size ? parentVisualElement.enteringChildren : parentVisualElement.children;
      const controlDelay = (delayIsFunction ? 0 : delayChildren || 0) + calcChildStagger(group, visualElement, delayChildren, staggerChildren, staggerDirection);
      this.animateUpdates({
        controlActiveState: this.state.parent.activeStates,
        controlDelay
      })();
    }
  }
  update() {
    const { animate } = this.state.options;
    const { animate: prevAnimate } = this.state.visualElement.prevProps || {};
    if (animate !== prevAnimate) {
      this.updateAnimationControlsSubscription();
    }
  }
  unmount() {
    this.unmountControls?.();
  }
}
function extractEventInfo$1(event) {
  return {
    point: {
      x: event.pageX,
      y: event.pageY
    }
  };
}
function handlePressEvent(state, event, lifecycle) {
  const props = state.options;
  if (props.whilePress) {
    state.setActive("whilePress", lifecycle === "Start");
  }
  const eventName = `onPress${lifecycle === "End" ? "" : lifecycle}`;
  const callback = props[eventName];
  if (callback) {
    frame$1.postRender(() => callback(event, extractEventInfo$1(event)));
  }
}
class PressGesture extends Feature {
  isActive() {
    const { whilePress, onPress, onPressCancel, onPressStart } = this.state.options;
    return Boolean(whilePress || onPress || onPressCancel || onPressStart);
  }
  constructor(state) {
    super(state);
  }
  mount() {
    this.register();
  }
  update() {
    const { whilePress, onPress, onPressCancel, onPressStart } = this.state.options;
    if (!(whilePress || onPress || onPressCancel || onPressStart)) {
      this.register();
    }
  }
  register() {
    const element2 = this.state.element;
    if (!element2 || !this.isActive())
      return;
    this.unmount();
    this.unmount = press(element2, (el, startEvent) => {
      handlePressEvent(this.state, startEvent, "Start");
      return (endEvent, { success }) => handlePressEvent(this.state, endEvent, success ? "End" : "Cancel");
    }, { useGlobalTarget: this.state.options.globalPressTarget });
  }
}
function handleHoverEvent(state, event, lifecycle) {
  const props = state.options;
  if (props.whileHover) {
    state.setActive("whileHover", lifecycle === "Start");
  }
  const eventName = `onHover${lifecycle}`;
  const callback = props[eventName];
  if (callback) {
    frame$1.postRender(() => callback(event, extractEventInfo$1(event)));
  }
}
class HoverGesture extends Feature {
  isActive() {
    const { whileHover, onHoverStart, onHoverEnd } = this.state.options;
    return Boolean(whileHover || onHoverStart || onHoverEnd);
  }
  constructor(state) {
    super(state);
  }
  mount() {
    this.register();
  }
  update() {
    const { whileHover, onHoverStart, onHoverEnd } = this.state.visualElement.prevProps;
    if (!(whileHover || onHoverStart || onHoverEnd)) {
      this.register();
    }
  }
  register() {
    const element2 = this.state.element;
    if (!element2 || !this.isActive())
      return;
    this.unmount();
    this.unmount = hover(element2, (el, startEvent) => {
      handleHoverEvent(this.state, startEvent, "Start");
      return (endEvent) => {
        handleHoverEvent(this.state, endEvent, "End");
      };
    });
  }
}
function handleViewportEvent(state, entry, lifecycle) {
  const props = state.options;
  if (props.whileInView) {
    state.setActive("whileInView", lifecycle === "Enter");
  }
  const eventName = `onViewport${lifecycle}`;
  const callback = props[eventName];
  if (callback) {
    frame$1.postRender(() => callback(entry));
  }
}
class InViewGesture extends Feature {
  isActive() {
    const { whileInView, onViewportEnter, onViewportLeave } = this.state.options;
    return Boolean(whileInView || onViewportEnter || onViewportLeave);
  }
  constructor(state) {
    super(state);
  }
  startObserver() {
    const element2 = this.state.element;
    if (!element2 || !this.isActive())
      return;
    this.unmount();
    const { once, ...viewOptions } = this.state.options.inViewOptions || {};
    this.unmount = inView(element2, (_, entry) => {
      handleViewportEvent(this.state, entry, "Enter");
      if (!once) {
        return (endEvent) => {
          handleViewportEvent(this.state, entry, "Leave");
        };
      }
    }, viewOptions);
  }
  mount() {
    this.startObserver();
  }
  update() {
    const { props, prevProps } = this.state.visualElement;
    const hasOptionsChanged = ["amount", "margin", "root"].some(hasViewportOptionChanged(props, prevProps));
    if (hasOptionsChanged) {
      this.startObserver();
    }
  }
}
function hasViewportOptionChanged({ inViewOptions = {} }, { inViewOptions: prevViewport = {} } = {}) {
  return (name) => inViewOptions[name] !== prevViewport[name];
}
function isPrimaryPointer(event) {
  if (event.pointerType === "mouse") {
    return typeof event.button !== "number" || event.button <= 0;
  } else {
    return event.isPrimary !== false;
  }
}
function addPointerEvent(target, eventName, handler, options) {
  return addDomEvent$1(target, eventName, addPointerInfo(handler), options);
}
function extractEventInfo(event, pointType = "page") {
  return {
    point: {
      x: event[`${pointType}X`],
      y: event[`${pointType}Y`]
    }
  };
}
function addPointerInfo(handler) {
  return (event) => isPrimaryPointer(event) && handler(event, extractEventInfo(event));
}
function addDomEvent$1(target, eventName, handler, options = { passive: true }) {
  target.addEventListener(eventName, handler, options);
  return () => target.removeEventListener(eventName, handler);
}
class FocusGesture extends Feature {
  isActive = false;
  onFocus() {
    let isFocusVisible = false;
    try {
      isFocusVisible = this.state.element.matches(":focus-visible");
    } catch (e) {
      isFocusVisible = true;
    }
    if (!isFocusVisible)
      return;
    this.state.setActive("whileFocus", true);
    this.isActive = true;
  }
  onBlur() {
    if (!this.isActive)
      return;
    this.state.setActive("whileFocus", false);
    this.isActive = false;
  }
  mount() {
    this.unmount = pipe(addDomEvent$1(this.state.element, "focus", () => this.onFocus()), addDomEvent$1(this.state.element, "blur", () => this.onBlur()));
  }
}
function animateSingleValue(value, keyframes, options) {
  const motionValue$1 = isMotionValue$1(value) ? value : motionValue(value);
  motionValue$1.start(animateMotionValue("", motionValue$1, keyframes, options));
  return motionValue$1.animation;
}
const compareByDepth = (a, b) => a.depth - b.depth;
class FlatTree {
  constructor() {
    this.children = [];
    this.isDirty = false;
  }
  add(child) {
    addUniqueItem(this.children, child);
    this.isDirty = true;
  }
  remove(child) {
    removeItem(this.children, child);
    this.isDirty = true;
  }
  forEach(callback) {
    this.isDirty && this.children.sort(compareByDepth);
    this.isDirty = false;
    this.children.forEach(callback);
  }
}
function resolveMotionValue(value) {
  return isMotionValue$1(value) ? value.get() : value;
}
const borders = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"];
const numBorders = borders.length;
const asNumber = (value) => typeof value === "string" ? parseFloat(value) : value;
const isPx = (value) => typeof value === "number" || px$1.test(value);
function mixValues(target, follow, lead, progress2, shouldCrossfadeOpacity, isOnlyMember) {
  if (shouldCrossfadeOpacity) {
    target.opacity = mixNumber(0, lead.opacity ?? 1, easeCrossfadeIn(progress2));
    target.opacityExit = mixNumber(follow.opacity ?? 1, 0, easeCrossfadeOut(progress2));
  } else if (isOnlyMember) {
    target.opacity = mixNumber(follow.opacity ?? 1, lead.opacity ?? 1, progress2);
  }
  for (let i = 0; i < numBorders; i++) {
    const borderLabel = `border${borders[i]}Radius`;
    let followRadius = getRadius(follow, borderLabel);
    let leadRadius = getRadius(lead, borderLabel);
    if (followRadius === void 0 && leadRadius === void 0)
      continue;
    followRadius || (followRadius = 0);
    leadRadius || (leadRadius = 0);
    const canMix = followRadius === 0 || leadRadius === 0 || isPx(followRadius) === isPx(leadRadius);
    if (canMix) {
      target[borderLabel] = Math.max(mixNumber(asNumber(followRadius), asNumber(leadRadius), progress2), 0);
      if (percent.test(leadRadius) || percent.test(followRadius)) {
        target[borderLabel] += "%";
      }
    } else {
      target[borderLabel] = leadRadius;
    }
  }
  if (follow.rotate || lead.rotate) {
    target.rotate = mixNumber(follow.rotate || 0, lead.rotate || 0, progress2);
  }
}
function getRadius(values, radiusName) {
  return values[radiusName] !== void 0 ? values[radiusName] : values.borderRadius;
}
const easeCrossfadeIn = /* @__PURE__ */ compress(0, 0.5, circOut);
const easeCrossfadeOut = /* @__PURE__ */ compress(0.5, 0.95, noop$3);
function compress(min, max, easing) {
  return (p) => {
    if (p < min)
      return 0;
    if (p > max)
      return 1;
    return easing(progress(min, max, p));
  };
}
function copyAxisInto(axis, originAxis) {
  axis.min = originAxis.min;
  axis.max = originAxis.max;
}
function copyBoxInto(box, originBox) {
  copyAxisInto(box.x, originBox.x);
  copyAxisInto(box.y, originBox.y);
}
function copyAxisDeltaInto(delta, originDelta) {
  delta.translate = originDelta.translate;
  delta.scale = originDelta.scale;
  delta.originPoint = originDelta.originPoint;
  delta.origin = originDelta.origin;
}
const SCALE_PRECISION = 1e-4;
const SCALE_MIN = 1 - SCALE_PRECISION;
const SCALE_MAX = 1 + SCALE_PRECISION;
const TRANSLATE_PRECISION = 0.01;
const TRANSLATE_MIN = 0 - TRANSLATE_PRECISION;
const TRANSLATE_MAX = 0 + TRANSLATE_PRECISION;
function calcLength$1(axis) {
  return axis.max - axis.min;
}
function isNear(value, target, maxDistance) {
  return Math.abs(value - target) <= maxDistance;
}
function calcAxisDelta(delta, source, target, origin = 0.5) {
  delta.origin = origin;
  delta.originPoint = mixNumber(source.min, source.max, delta.origin);
  delta.scale = calcLength$1(target) / calcLength$1(source);
  delta.translate = mixNumber(target.min, target.max, delta.origin) - delta.originPoint;
  if (delta.scale >= SCALE_MIN && delta.scale <= SCALE_MAX || isNaN(delta.scale)) {
    delta.scale = 1;
  }
  if (delta.translate >= TRANSLATE_MIN && delta.translate <= TRANSLATE_MAX || isNaN(delta.translate)) {
    delta.translate = 0;
  }
}
function calcBoxDelta(delta, source, target, origin) {
  calcAxisDelta(delta.x, source.x, target.x, origin ? origin.originX : void 0);
  calcAxisDelta(delta.y, source.y, target.y, origin ? origin.originY : void 0);
}
function calcRelativeAxis(target, relative, parent) {
  target.min = parent.min + relative.min;
  target.max = target.min + calcLength$1(relative);
}
function calcRelativeBox(target, relative, parent) {
  calcRelativeAxis(target.x, relative.x, parent.x);
  calcRelativeAxis(target.y, relative.y, parent.y);
}
function calcRelativeAxisPosition(target, layout, parent) {
  target.min = layout.min - parent.min;
  target.max = target.min + calcLength$1(layout);
}
function calcRelativePosition(target, layout, parent) {
  calcRelativeAxisPosition(target.x, layout.x, parent.x);
  calcRelativeAxisPosition(target.y, layout.y, parent.y);
}
function removePointDelta(point, translate, scale, originPoint, boxScale) {
  point -= translate;
  point = scalePoint(point, 1 / scale, originPoint);
  if (boxScale !== void 0) {
    point = scalePoint(point, 1 / boxScale, originPoint);
  }
  return point;
}
function removeAxisDelta(axis, translate = 0, scale = 1, origin = 0.5, boxScale, originAxis = axis, sourceAxis = axis) {
  if (percent.test(translate)) {
    translate = parseFloat(translate);
    const relativeProgress = mixNumber(sourceAxis.min, sourceAxis.max, translate / 100);
    translate = relativeProgress - sourceAxis.min;
  }
  if (typeof translate !== "number")
    return;
  let originPoint = mixNumber(originAxis.min, originAxis.max, origin);
  if (axis === originAxis)
    originPoint -= translate;
  axis.min = removePointDelta(axis.min, translate, scale, originPoint, boxScale);
  axis.max = removePointDelta(axis.max, translate, scale, originPoint, boxScale);
}
function removeAxisTransforms(axis, transforms2, [key, scaleKey, originKey], origin, sourceAxis) {
  removeAxisDelta(axis, transforms2[key], transforms2[scaleKey], transforms2[originKey], transforms2.scale, origin, sourceAxis);
}
const xKeys = ["x", "scaleX", "originX"];
const yKeys = ["y", "scaleY", "originY"];
function removeBoxTransforms(box, transforms2, originBox, sourceBox) {
  removeAxisTransforms(box.x, transforms2, xKeys, originBox ? originBox.x : void 0, sourceBox ? sourceBox.x : void 0);
  removeAxisTransforms(box.y, transforms2, yKeys, originBox ? originBox.y : void 0, sourceBox ? sourceBox.y : void 0);
}
function isAxisDeltaZero(delta) {
  return delta.translate === 0 && delta.scale === 1;
}
function isDeltaZero(delta) {
  return isAxisDeltaZero(delta.x) && isAxisDeltaZero(delta.y);
}
function axisEquals(a, b) {
  return a.min === b.min && a.max === b.max;
}
function boxEquals(a, b) {
  return axisEquals(a.x, b.x) && axisEquals(a.y, b.y);
}
function axisEqualsRounded(a, b) {
  return Math.round(a.min) === Math.round(b.min) && Math.round(a.max) === Math.round(b.max);
}
function boxEqualsRounded(a, b) {
  return axisEqualsRounded(a.x, b.x) && axisEqualsRounded(a.y, b.y);
}
function aspectRatio(box) {
  return calcLength$1(box.x) / calcLength$1(box.y);
}
function axisDeltaEquals(a, b) {
  return a.translate === b.translate && a.scale === b.scale && a.originPoint === b.originPoint;
}
class NodeStack {
  constructor() {
    this.members = [];
  }
  add(node) {
    addUniqueItem(this.members, node);
    node.scheduleRender();
  }
  remove(node) {
    removeItem(this.members, node);
    if (node === this.prevLead) {
      this.prevLead = void 0;
    }
    if (node === this.lead) {
      const prevLead = this.members[this.members.length - 1];
      if (prevLead) {
        this.promote(prevLead);
      }
    }
  }
  relegate(node) {
    const indexOfNode = this.members.findIndex((member) => node === member);
    if (indexOfNode === 0)
      return false;
    let prevLead;
    for (let i = indexOfNode; i >= 0; i--) {
      const member = this.members[i];
      if (member.isPresent !== false) {
        prevLead = member;
        break;
      }
    }
    if (prevLead) {
      this.promote(prevLead);
      return true;
    } else {
      return false;
    }
  }
  promote(node, preserveFollowOpacity) {
    const prevLead = this.lead;
    if (node === prevLead)
      return;
    this.prevLead = prevLead;
    this.lead = node;
    node.show();
    if (prevLead) {
      prevLead.instance && prevLead.scheduleRender();
      node.scheduleRender();
      node.resumeFrom = prevLead;
      if (preserveFollowOpacity) {
        node.resumeFrom.preserveOpacity = true;
      }
      if (prevLead.snapshot) {
        node.snapshot = prevLead.snapshot;
        node.snapshot.latestValues = prevLead.animationValues || prevLead.latestValues;
      }
      if (node.root && node.root.isUpdating) {
        node.isLayoutDirty = true;
      }
      const { crossfade } = node.options;
      if (crossfade === false) {
        prevLead.hide();
      }
    }
  }
  exitAnimationComplete() {
    this.members.forEach((node) => {
      const { options, resumingFrom } = node;
      options.onExitComplete && options.onExitComplete();
      if (resumingFrom) {
        resumingFrom.options.onExitComplete && resumingFrom.options.onExitComplete();
      }
    });
  }
  scheduleRender() {
    this.members.forEach((node) => {
      node.instance && node.scheduleRender(false);
    });
  }
  /**
   * Clear any leads that have been removed this render to prevent them from being
   * used in future animations and to prevent memory leaks
   */
  removeLeadSnapshot() {
    if (this.lead && this.lead.snapshot) {
      this.lead.snapshot = void 0;
    }
  }
}
function buildProjectionTransform(delta, treeScale, latestTransform) {
  let transform = "";
  const xTranslate = delta.x.translate / treeScale.x;
  const yTranslate = delta.y.translate / treeScale.y;
  const zTranslate = latestTransform?.z || 0;
  if (xTranslate || yTranslate || zTranslate) {
    transform = `translate3d(${xTranslate}px, ${yTranslate}px, ${zTranslate}px) `;
  }
  if (treeScale.x !== 1 || treeScale.y !== 1) {
    transform += `scale(${1 / treeScale.x}, ${1 / treeScale.y}) `;
  }
  if (latestTransform) {
    const { transformPerspective, rotate, rotateX, rotateY, skewX, skewY } = latestTransform;
    if (transformPerspective)
      transform = `perspective(${transformPerspective}px) ${transform}`;
    if (rotate)
      transform += `rotate(${rotate}deg) `;
    if (rotateX)
      transform += `rotateX(${rotateX}deg) `;
    if (rotateY)
      transform += `rotateY(${rotateY}deg) `;
    if (skewX)
      transform += `skewX(${skewX}deg) `;
    if (skewY)
      transform += `skewY(${skewY}deg) `;
  }
  const elementScaleX = delta.x.scale * treeScale.x;
  const elementScaleY = delta.y.scale * treeScale.y;
  if (elementScaleX !== 1 || elementScaleY !== 1) {
    transform += `scale(${elementScaleX}, ${elementScaleY})`;
  }
  return transform || "none";
}
function eachAxis$1(callback) {
  return [callback("x"), callback("y")];
}
const globalProjectionState = {
  /**
   * Global flag as to whether the tree has animated since the last time
   * we resized the window
   */
  hasAnimatedSinceResize: true
};
const metrics = {
  nodes: 0,
  calculatedTargetDeltas: 0,
  calculatedProjections: 0
};
const transformAxes = ["", "X", "Y", "Z"];
const animationTarget = 1e3;
let id = 0;
function resetDistortingTransform(key, visualElement, values, sharedAnimationValues) {
  const { latestValues } = visualElement;
  if (latestValues[key]) {
    values[key] = latestValues[key];
    visualElement.setStaticValue(key, 0);
    if (sharedAnimationValues) {
      sharedAnimationValues[key] = 0;
    }
  }
}
function cancelTreeOptimisedTransformAnimations(projectionNode) {
  projectionNode.hasCheckedOptimisedAppear = true;
  if (projectionNode.root === projectionNode)
    return;
  const { visualElement } = projectionNode.options;
  if (!visualElement)
    return;
  const appearId = getOptimisedAppearId(visualElement);
  if (window.MotionHasOptimisedAnimation(appearId, "transform")) {
    const { layout, layoutId } = projectionNode.options;
    window.MotionCancelOptimisedAnimation(appearId, "transform", frame, !(layout || layoutId));
  }
  const { parent } = projectionNode;
  if (parent && !parent.hasCheckedOptimisedAppear) {
    cancelTreeOptimisedTransformAnimations(parent);
  }
}
function createProjectionNode({ attachResizeListener, defaultParent, measureScroll, checkIsScrollRoot, resetTransform }) {
  return class ProjectionNode {
    constructor(latestValues = {}, parent = defaultParent?.()) {
      this.id = id++;
      this.animationId = 0;
      this.animationCommitId = 0;
      this.children = /* @__PURE__ */ new Set();
      this.options = {};
      this.isTreeAnimating = false;
      this.isAnimationBlocked = false;
      this.isLayoutDirty = false;
      this.isProjectionDirty = false;
      this.isSharedProjectionDirty = false;
      this.isTransformDirty = false;
      this.updateManuallyBlocked = false;
      this.updateBlockedByResize = false;
      this.isUpdating = false;
      this.isSVG = false;
      this.needsReset = false;
      this.shouldResetTransform = false;
      this.hasCheckedOptimisedAppear = false;
      this.treeScale = { x: 1, y: 1 };
      this.eventHandlers = /* @__PURE__ */ new Map();
      this.hasTreeAnimated = false;
      this.updateScheduled = false;
      this.scheduleUpdate = () => this.update();
      this.projectionUpdateScheduled = false;
      this.checkUpdateFailed = () => {
        if (this.isUpdating) {
          this.isUpdating = false;
          this.clearAllSnapshots();
        }
      };
      this.updateProjection = () => {
        this.projectionUpdateScheduled = false;
        if (statsBuffer.value) {
          metrics.nodes = metrics.calculatedTargetDeltas = metrics.calculatedProjections = 0;
        }
        this.nodes.forEach(propagateDirtyNodes);
        this.nodes.forEach(resolveTargetDelta);
        this.nodes.forEach(calcProjection);
        this.nodes.forEach(cleanDirtyNodes);
        if (statsBuffer.addProjectionMetrics) {
          statsBuffer.addProjectionMetrics(metrics);
        }
      };
      this.resolvedRelativeTargetAt = 0;
      this.hasProjected = false;
      this.isVisible = true;
      this.animationProgress = 0;
      this.sharedNodes = /* @__PURE__ */ new Map();
      this.latestValues = latestValues;
      this.root = parent ? parent.root || parent : this;
      this.path = parent ? [...parent.path, parent] : [];
      this.parent = parent;
      this.depth = parent ? parent.depth + 1 : 0;
      for (let i = 0; i < this.path.length; i++) {
        this.path[i].shouldResetTransform = true;
      }
      if (this.root === this)
        this.nodes = new FlatTree();
    }
    addEventListener(name, handler) {
      if (!this.eventHandlers.has(name)) {
        this.eventHandlers.set(name, new SubscriptionManager());
      }
      return this.eventHandlers.get(name).add(handler);
    }
    notifyListeners(name, ...args) {
      const subscriptionManager = this.eventHandlers.get(name);
      subscriptionManager && subscriptionManager.notify(...args);
    }
    hasListeners(name) {
      return this.eventHandlers.has(name);
    }
    /**
     * Lifecycles
     */
    mount(instance) {
      if (this.instance)
        return;
      this.isSVG = isSVGElement$1(instance) && !isSVGSVGElement(instance);
      this.instance = instance;
      const { layoutId, layout, visualElement } = this.options;
      if (visualElement && !visualElement.current) {
        visualElement.mount(instance);
      }
      this.root.nodes.add(this);
      this.parent && this.parent.children.add(this);
      if (this.root.hasTreeAnimated && (layout || layoutId)) {
        this.isLayoutDirty = true;
      }
      if (attachResizeListener) {
        let cancelDelay;
        let innerWidth = 0;
        const resizeUnblockUpdate = () => this.root.updateBlockedByResize = false;
        frame.read(() => {
          innerWidth = window.innerWidth;
        });
        attachResizeListener(instance, () => {
          const newInnerWidth = window.innerWidth;
          if (newInnerWidth === innerWidth)
            return;
          innerWidth = newInnerWidth;
          this.root.updateBlockedByResize = true;
          cancelDelay && cancelDelay();
          cancelDelay = delay(resizeUnblockUpdate, 250);
          if (globalProjectionState.hasAnimatedSinceResize) {
            globalProjectionState.hasAnimatedSinceResize = false;
            this.nodes.forEach(finishAnimation);
          }
        });
      }
      if (layoutId) {
        this.root.registerSharedNode(layoutId, this);
      }
      if (this.options.animate !== false && visualElement && (layoutId || layout)) {
        this.addEventListener("didUpdate", ({ delta, hasLayoutChanged, hasRelativeLayoutChanged, layout: newLayout }) => {
          if (this.isTreeAnimationBlocked()) {
            this.target = void 0;
            this.relativeTarget = void 0;
            return;
          }
          const layoutTransition = this.options.transition || visualElement.getDefaultTransition() || defaultLayoutTransition;
          const { onLayoutAnimationStart, onLayoutAnimationComplete } = visualElement.getProps();
          const hasTargetChanged = !this.targetLayout || !boxEqualsRounded(this.targetLayout, newLayout);
          const hasOnlyRelativeTargetChanged = !hasLayoutChanged && hasRelativeLayoutChanged;
          if (this.options.layoutRoot || this.resumeFrom || hasOnlyRelativeTargetChanged || hasLayoutChanged && (hasTargetChanged || !this.currentAnimation)) {
            if (this.resumeFrom) {
              this.resumingFrom = this.resumeFrom;
              this.resumingFrom.resumingFrom = void 0;
            }
            const animationOptions = {
              ...getValueTransition(layoutTransition, "layout"),
              onPlay: onLayoutAnimationStart,
              onComplete: onLayoutAnimationComplete
            };
            if (visualElement.shouldReduceMotion || this.options.layoutRoot) {
              animationOptions.delay = 0;
              animationOptions.type = false;
            }
            this.startAnimation(animationOptions);
            this.setAnimationOrigin(delta, hasOnlyRelativeTargetChanged);
          } else {
            if (!hasLayoutChanged) {
              finishAnimation(this);
            }
            if (this.isLead() && this.options.onExitComplete) {
              this.options.onExitComplete();
            }
          }
          this.targetLayout = newLayout;
        });
      }
    }
    unmount() {
      this.options.layoutId && this.willUpdate();
      this.root.nodes.remove(this);
      const stack = this.getStack();
      stack && stack.remove(this);
      this.parent && this.parent.children.delete(this);
      this.instance = void 0;
      this.eventHandlers.clear();
      cancelFrame(this.updateProjection);
    }
    // only on the root
    blockUpdate() {
      this.updateManuallyBlocked = true;
    }
    unblockUpdate() {
      this.updateManuallyBlocked = false;
    }
    isUpdateBlocked() {
      return this.updateManuallyBlocked || this.updateBlockedByResize;
    }
    isTreeAnimationBlocked() {
      return this.isAnimationBlocked || this.parent && this.parent.isTreeAnimationBlocked() || false;
    }
    // Note: currently only running on root node
    startUpdate() {
      if (this.isUpdateBlocked())
        return;
      this.isUpdating = true;
      this.nodes && this.nodes.forEach(resetSkewAndRotation);
      this.animationId++;
    }
    getTransformTemplate() {
      const { visualElement } = this.options;
      return visualElement && visualElement.getProps().transformTemplate;
    }
    willUpdate(shouldNotifyListeners = true) {
      this.root.hasTreeAnimated = true;
      if (this.root.isUpdateBlocked()) {
        this.options.onExitComplete && this.options.onExitComplete();
        return;
      }
      if (window.MotionCancelOptimisedAnimation && !this.hasCheckedOptimisedAppear) {
        cancelTreeOptimisedTransformAnimations(this);
      }
      !this.root.isUpdating && this.root.startUpdate();
      if (this.isLayoutDirty)
        return;
      this.isLayoutDirty = true;
      for (let i = 0; i < this.path.length; i++) {
        const node = this.path[i];
        node.shouldResetTransform = true;
        node.updateScroll("snapshot");
        if (node.options.layoutRoot) {
          node.willUpdate(false);
        }
      }
      const { layoutId, layout } = this.options;
      if (layoutId === void 0 && !layout)
        return;
      const transformTemplate = this.getTransformTemplate();
      this.prevTransformTemplateValue = transformTemplate ? transformTemplate(this.latestValues, "") : void 0;
      this.updateSnapshot();
      shouldNotifyListeners && this.notifyListeners("willUpdate");
    }
    update() {
      this.updateScheduled = false;
      const updateWasBlocked = this.isUpdateBlocked();
      if (updateWasBlocked) {
        this.unblockUpdate();
        this.clearAllSnapshots();
        this.nodes.forEach(clearMeasurements);
        return;
      }
      if (this.animationId <= this.animationCommitId) {
        this.nodes.forEach(clearIsLayoutDirty);
        return;
      }
      this.animationCommitId = this.animationId;
      if (!this.isUpdating) {
        this.nodes.forEach(clearIsLayoutDirty);
      } else {
        this.isUpdating = false;
        this.nodes.forEach(resetTransformStyle);
        this.nodes.forEach(updateLayout);
        this.nodes.forEach(notifyLayoutUpdate);
      }
      this.clearAllSnapshots();
      const now2 = time.now();
      frameData.delta = clamp(0, 1e3 / 60, now2 - frameData.timestamp);
      frameData.timestamp = now2;
      frameData.isProcessing = true;
      frameSteps.update.process(frameData);
      frameSteps.preRender.process(frameData);
      frameSteps.render.process(frameData);
      frameData.isProcessing = false;
    }
    didUpdate() {
      if (!this.updateScheduled) {
        this.updateScheduled = true;
        microtask.read(this.scheduleUpdate);
      }
    }
    clearAllSnapshots() {
      this.nodes.forEach(clearSnapshot);
      this.sharedNodes.forEach(removeLeadSnapshots);
    }
    scheduleUpdateProjection() {
      if (!this.projectionUpdateScheduled) {
        this.projectionUpdateScheduled = true;
        frame.preRender(this.updateProjection, false, true);
      }
    }
    scheduleCheckAfterUnmount() {
      frame.postRender(() => {
        if (this.isLayoutDirty) {
          this.root.didUpdate();
        } else {
          this.root.checkUpdateFailed();
        }
      });
    }
    /**
     * Update measurements
     */
    updateSnapshot() {
      if (this.snapshot || !this.instance)
        return;
      this.snapshot = this.measure();
      if (this.snapshot && !calcLength$1(this.snapshot.measuredBox.x) && !calcLength$1(this.snapshot.measuredBox.y)) {
        this.snapshot = void 0;
      }
    }
    updateLayout() {
      if (!this.instance)
        return;
      this.updateScroll();
      if (!(this.options.alwaysMeasureLayout && this.isLead()) && !this.isLayoutDirty) {
        return;
      }
      if (this.resumeFrom && !this.resumeFrom.instance) {
        for (let i = 0; i < this.path.length; i++) {
          const node = this.path[i];
          node.updateScroll();
        }
      }
      const prevLayout = this.layout;
      this.layout = this.measure(false);
      this.layoutCorrected = createBox$1();
      this.isLayoutDirty = false;
      this.projectionDelta = void 0;
      this.notifyListeners("measure", this.layout.layoutBox);
      const { visualElement } = this.options;
      visualElement && visualElement.notify("LayoutMeasure", this.layout.layoutBox, prevLayout ? prevLayout.layoutBox : void 0);
    }
    updateScroll(phase = "measure") {
      let needsMeasurement = Boolean(this.options.layoutScroll && this.instance);
      if (this.scroll && this.scroll.animationId === this.root.animationId && this.scroll.phase === phase) {
        needsMeasurement = false;
      }
      if (needsMeasurement && this.instance) {
        const isRoot = checkIsScrollRoot(this.instance);
        this.scroll = {
          animationId: this.root.animationId,
          phase,
          isRoot,
          offset: measureScroll(this.instance),
          wasRoot: this.scroll ? this.scroll.isRoot : isRoot
        };
      }
    }
    resetTransform() {
      if (!resetTransform)
        return;
      const isResetRequested = this.isLayoutDirty || this.shouldResetTransform || this.options.alwaysMeasureLayout;
      const hasProjection = this.projectionDelta && !isDeltaZero(this.projectionDelta);
      const transformTemplate = this.getTransformTemplate();
      const transformTemplateValue = transformTemplate ? transformTemplate(this.latestValues, "") : void 0;
      const transformTemplateHasChanged = transformTemplateValue !== this.prevTransformTemplateValue;
      if (isResetRequested && this.instance && (hasProjection || hasTransform(this.latestValues) || transformTemplateHasChanged)) {
        resetTransform(this.instance, transformTemplateValue);
        this.shouldResetTransform = false;
        this.scheduleRender();
      }
    }
    measure(removeTransform = true) {
      const pageBox = this.measurePageBox();
      let layoutBox = this.removeElementScroll(pageBox);
      if (removeTransform) {
        layoutBox = this.removeTransform(layoutBox);
      }
      roundBox(layoutBox);
      return {
        animationId: this.root.animationId,
        measuredBox: pageBox,
        layoutBox,
        latestValues: {},
        source: this.id
      };
    }
    measurePageBox() {
      const { visualElement } = this.options;
      if (!visualElement)
        return createBox$1();
      const box = visualElement.measureViewportBox();
      const wasInScrollRoot = this.scroll?.wasRoot || this.path.some(checkNodeWasScrollRoot);
      if (!wasInScrollRoot) {
        const { scroll } = this.root;
        if (scroll) {
          translateAxis$1(box.x, scroll.offset.x);
          translateAxis$1(box.y, scroll.offset.y);
        }
      }
      return box;
    }
    removeElementScroll(box) {
      const boxWithoutScroll = createBox$1();
      copyBoxInto(boxWithoutScroll, box);
      if (this.scroll?.wasRoot) {
        return boxWithoutScroll;
      }
      for (let i = 0; i < this.path.length; i++) {
        const node = this.path[i];
        const { scroll, options } = node;
        if (node !== this.root && scroll && options.layoutScroll) {
          if (scroll.wasRoot) {
            copyBoxInto(boxWithoutScroll, box);
          }
          translateAxis$1(boxWithoutScroll.x, scroll.offset.x);
          translateAxis$1(boxWithoutScroll.y, scroll.offset.y);
        }
      }
      return boxWithoutScroll;
    }
    applyTransform(box, transformOnly = false) {
      const withTransforms = createBox$1();
      copyBoxInto(withTransforms, box);
      for (let i = 0; i < this.path.length; i++) {
        const node = this.path[i];
        if (!transformOnly && node.options.layoutScroll && node.scroll && node !== node.root) {
          transformBox(withTransforms, {
            x: -node.scroll.offset.x,
            y: -node.scroll.offset.y
          });
        }
        if (!hasTransform(node.latestValues))
          continue;
        transformBox(withTransforms, node.latestValues);
      }
      if (hasTransform(this.latestValues)) {
        transformBox(withTransforms, this.latestValues);
      }
      return withTransforms;
    }
    removeTransform(box) {
      const boxWithoutTransform = createBox$1();
      copyBoxInto(boxWithoutTransform, box);
      for (let i = 0; i < this.path.length; i++) {
        const node = this.path[i];
        if (!node.instance)
          continue;
        if (!hasTransform(node.latestValues))
          continue;
        hasScale(node.latestValues) && node.updateSnapshot();
        const sourceBox = createBox$1();
        const nodeBox = node.measurePageBox();
        copyBoxInto(sourceBox, nodeBox);
        removeBoxTransforms(boxWithoutTransform, node.latestValues, node.snapshot ? node.snapshot.layoutBox : void 0, sourceBox);
      }
      if (hasTransform(this.latestValues)) {
        removeBoxTransforms(boxWithoutTransform, this.latestValues);
      }
      return boxWithoutTransform;
    }
    setTargetDelta(delta) {
      this.targetDelta = delta;
      this.root.scheduleUpdateProjection();
      this.isProjectionDirty = true;
    }
    setOptions(options) {
      this.options = {
        ...this.options,
        ...options,
        crossfade: options.crossfade !== void 0 ? options.crossfade : true
      };
    }
    clearMeasurements() {
      this.scroll = void 0;
      this.layout = void 0;
      this.snapshot = void 0;
      this.prevTransformTemplateValue = void 0;
      this.targetDelta = void 0;
      this.target = void 0;
      this.isLayoutDirty = false;
    }
    forceRelativeParentToResolveTarget() {
      if (!this.relativeParent)
        return;
      if (this.relativeParent.resolvedRelativeTargetAt !== frameData.timestamp) {
        this.relativeParent.resolveTargetDelta(true);
      }
    }
    resolveTargetDelta(forceRecalculation = false) {
      const lead = this.getLead();
      this.isProjectionDirty || (this.isProjectionDirty = lead.isProjectionDirty);
      this.isTransformDirty || (this.isTransformDirty = lead.isTransformDirty);
      this.isSharedProjectionDirty || (this.isSharedProjectionDirty = lead.isSharedProjectionDirty);
      const isShared = Boolean(this.resumingFrom) || this !== lead;
      const canSkip = !(forceRecalculation || isShared && this.isSharedProjectionDirty || this.isProjectionDirty || this.parent?.isProjectionDirty || this.attemptToResolveRelativeTarget || this.root.updateBlockedByResize);
      if (canSkip)
        return;
      const { layout, layoutId } = this.options;
      if (!this.layout || !(layout || layoutId))
        return;
      this.resolvedRelativeTargetAt = frameData.timestamp;
      if (!this.targetDelta && !this.relativeTarget) {
        const relativeParent = this.getClosestProjectingParent();
        if (relativeParent && relativeParent.layout && this.animationProgress !== 1) {
          this.relativeParent = relativeParent;
          this.forceRelativeParentToResolveTarget();
          this.relativeTarget = createBox$1();
          this.relativeTargetOrigin = createBox$1();
          calcRelativePosition(this.relativeTargetOrigin, this.layout.layoutBox, relativeParent.layout.layoutBox);
          copyBoxInto(this.relativeTarget, this.relativeTargetOrigin);
        } else {
          this.relativeParent = this.relativeTarget = void 0;
        }
      }
      if (!this.relativeTarget && !this.targetDelta)
        return;
      if (!this.target) {
        this.target = createBox$1();
        this.targetWithTransforms = createBox$1();
      }
      if (this.relativeTarget && this.relativeTargetOrigin && this.relativeParent && this.relativeParent.target) {
        this.forceRelativeParentToResolveTarget();
        calcRelativeBox(this.target, this.relativeTarget, this.relativeParent.target);
      } else if (this.targetDelta) {
        if (Boolean(this.resumingFrom)) {
          this.target = this.applyTransform(this.layout.layoutBox);
        } else {
          copyBoxInto(this.target, this.layout.layoutBox);
        }
        applyBoxDelta(this.target, this.targetDelta);
      } else {
        copyBoxInto(this.target, this.layout.layoutBox);
      }
      if (this.attemptToResolveRelativeTarget) {
        this.attemptToResolveRelativeTarget = false;
        const relativeParent = this.getClosestProjectingParent();
        if (relativeParent && Boolean(relativeParent.resumingFrom) === Boolean(this.resumingFrom) && !relativeParent.options.layoutScroll && relativeParent.target && this.animationProgress !== 1) {
          this.relativeParent = relativeParent;
          this.forceRelativeParentToResolveTarget();
          this.relativeTarget = createBox$1();
          this.relativeTargetOrigin = createBox$1();
          calcRelativePosition(this.relativeTargetOrigin, this.target, relativeParent.target);
          copyBoxInto(this.relativeTarget, this.relativeTargetOrigin);
        } else {
          this.relativeParent = this.relativeTarget = void 0;
        }
      }
      if (statsBuffer.value) {
        metrics.calculatedTargetDeltas++;
      }
    }
    getClosestProjectingParent() {
      if (!this.parent || hasScale(this.parent.latestValues) || has2DTranslate(this.parent.latestValues)) {
        return void 0;
      }
      if (this.parent.isProjecting()) {
        return this.parent;
      } else {
        return this.parent.getClosestProjectingParent();
      }
    }
    isProjecting() {
      return Boolean((this.relativeTarget || this.targetDelta || this.options.layoutRoot) && this.layout);
    }
    calcProjection() {
      const lead = this.getLead();
      const isShared = Boolean(this.resumingFrom) || this !== lead;
      let canSkip = true;
      if (this.isProjectionDirty || this.parent?.isProjectionDirty) {
        canSkip = false;
      }
      if (isShared && (this.isSharedProjectionDirty || this.isTransformDirty)) {
        canSkip = false;
      }
      if (this.resolvedRelativeTargetAt === frameData.timestamp) {
        canSkip = false;
      }
      if (canSkip)
        return;
      const { layout, layoutId } = this.options;
      this.isTreeAnimating = Boolean(this.parent && this.parent.isTreeAnimating || this.currentAnimation || this.pendingAnimation);
      if (!this.isTreeAnimating) {
        this.targetDelta = this.relativeTarget = void 0;
      }
      if (!this.layout || !(layout || layoutId))
        return;
      copyBoxInto(this.layoutCorrected, this.layout.layoutBox);
      const prevTreeScaleX = this.treeScale.x;
      const prevTreeScaleY = this.treeScale.y;
      applyTreeDeltas(this.layoutCorrected, this.treeScale, this.path, isShared);
      if (lead.layout && !lead.target && (this.treeScale.x !== 1 || this.treeScale.y !== 1)) {
        lead.target = lead.layout.layoutBox;
        lead.targetWithTransforms = createBox$1();
      }
      const { target } = lead;
      if (!target) {
        if (this.prevProjectionDelta) {
          this.createProjectionDeltas();
          this.scheduleRender();
        }
        return;
      }
      if (!this.projectionDelta || !this.prevProjectionDelta) {
        this.createProjectionDeltas();
      } else {
        copyAxisDeltaInto(this.prevProjectionDelta.x, this.projectionDelta.x);
        copyAxisDeltaInto(this.prevProjectionDelta.y, this.projectionDelta.y);
      }
      calcBoxDelta(this.projectionDelta, this.layoutCorrected, target, this.latestValues);
      if (this.treeScale.x !== prevTreeScaleX || this.treeScale.y !== prevTreeScaleY || !axisDeltaEquals(this.projectionDelta.x, this.prevProjectionDelta.x) || !axisDeltaEquals(this.projectionDelta.y, this.prevProjectionDelta.y)) {
        this.hasProjected = true;
        this.scheduleRender();
        this.notifyListeners("projectionUpdate", target);
      }
      if (statsBuffer.value) {
        metrics.calculatedProjections++;
      }
    }
    hide() {
      this.isVisible = false;
    }
    show() {
      this.isVisible = true;
    }
    scheduleRender(notifyAll = true) {
      this.options.visualElement?.scheduleRender();
      if (notifyAll) {
        const stack = this.getStack();
        stack && stack.scheduleRender();
      }
      if (this.resumingFrom && !this.resumingFrom.instance) {
        this.resumingFrom = void 0;
      }
    }
    createProjectionDeltas() {
      this.prevProjectionDelta = createDelta();
      this.projectionDelta = createDelta();
      this.projectionDeltaWithTransform = createDelta();
    }
    setAnimationOrigin(delta, hasOnlyRelativeTargetChanged = false) {
      const snapshot2 = this.snapshot;
      const snapshotLatestValues = snapshot2 ? snapshot2.latestValues : {};
      const mixedValues = { ...this.latestValues };
      const targetDelta = createDelta();
      if (!this.relativeParent || !this.relativeParent.options.layoutRoot) {
        this.relativeTarget = this.relativeTargetOrigin = void 0;
      }
      this.attemptToResolveRelativeTarget = !hasOnlyRelativeTargetChanged;
      const relativeLayout = createBox$1();
      const snapshotSource = snapshot2 ? snapshot2.source : void 0;
      const layoutSource = this.layout ? this.layout.source : void 0;
      const isSharedLayoutAnimation = snapshotSource !== layoutSource;
      const stack = this.getStack();
      const isOnlyMember = !stack || stack.members.length <= 1;
      const shouldCrossfadeOpacity = Boolean(isSharedLayoutAnimation && !isOnlyMember && this.options.crossfade === true && !this.path.some(hasOpacityCrossfade));
      this.animationProgress = 0;
      let prevRelativeTarget;
      this.mixTargetDelta = (latest) => {
        const progress2 = latest / 1e3;
        mixAxisDelta(targetDelta.x, delta.x, progress2);
        mixAxisDelta(targetDelta.y, delta.y, progress2);
        this.setTargetDelta(targetDelta);
        if (this.relativeTarget && this.relativeTargetOrigin && this.layout && this.relativeParent && this.relativeParent.layout) {
          calcRelativePosition(relativeLayout, this.layout.layoutBox, this.relativeParent.layout.layoutBox);
          mixBox(this.relativeTarget, this.relativeTargetOrigin, relativeLayout, progress2);
          if (prevRelativeTarget && boxEquals(this.relativeTarget, prevRelativeTarget)) {
            this.isProjectionDirty = false;
          }
          if (!prevRelativeTarget)
            prevRelativeTarget = createBox$1();
          copyBoxInto(prevRelativeTarget, this.relativeTarget);
        }
        if (isSharedLayoutAnimation) {
          this.animationValues = mixedValues;
          mixValues(mixedValues, snapshotLatestValues, this.latestValues, progress2, shouldCrossfadeOpacity, isOnlyMember);
        }
        this.root.scheduleUpdateProjection();
        this.scheduleRender();
        this.animationProgress = progress2;
      };
      this.mixTargetDelta(this.options.layoutRoot ? 1e3 : 0);
    }
    startAnimation(options) {
      this.notifyListeners("animationStart");
      this.currentAnimation?.stop();
      this.resumingFrom?.currentAnimation?.stop();
      if (this.pendingAnimation) {
        cancelFrame(this.pendingAnimation);
        this.pendingAnimation = void 0;
      }
      this.pendingAnimation = frame.update(() => {
        globalProjectionState.hasAnimatedSinceResize = true;
        activeAnimations.layout++;
        this.motionValue || (this.motionValue = motionValue(0));
        this.currentAnimation = animateSingleValue(this.motionValue, [0, 1e3], {
          ...options,
          velocity: 0,
          isSync: true,
          onUpdate: (latest) => {
            this.mixTargetDelta(latest);
            options.onUpdate && options.onUpdate(latest);
          },
          onStop: () => {
            activeAnimations.layout--;
          },
          onComplete: () => {
            activeAnimations.layout--;
            options.onComplete && options.onComplete();
            this.completeAnimation();
          }
        });
        if (this.resumingFrom) {
          this.resumingFrom.currentAnimation = this.currentAnimation;
        }
        this.pendingAnimation = void 0;
      });
    }
    completeAnimation() {
      if (this.resumingFrom) {
        this.resumingFrom.currentAnimation = void 0;
        this.resumingFrom.preserveOpacity = void 0;
      }
      const stack = this.getStack();
      stack && stack.exitAnimationComplete();
      this.resumingFrom = this.currentAnimation = this.animationValues = void 0;
      this.notifyListeners("animationComplete");
    }
    finishAnimation() {
      if (this.currentAnimation) {
        this.mixTargetDelta && this.mixTargetDelta(animationTarget);
        this.currentAnimation.stop();
      }
      this.completeAnimation();
    }
    applyTransformsToTarget() {
      const lead = this.getLead();
      let { targetWithTransforms, target, layout, latestValues } = lead;
      if (!targetWithTransforms || !target || !layout)
        return;
      if (this !== lead && this.layout && layout && shouldAnimatePositionOnly(this.options.animationType, this.layout.layoutBox, layout.layoutBox)) {
        target = this.target || createBox$1();
        const xLength = calcLength$1(this.layout.layoutBox.x);
        target.x.min = lead.target.x.min;
        target.x.max = target.x.min + xLength;
        const yLength = calcLength$1(this.layout.layoutBox.y);
        target.y.min = lead.target.y.min;
        target.y.max = target.y.min + yLength;
      }
      copyBoxInto(targetWithTransforms, target);
      transformBox(targetWithTransforms, latestValues);
      calcBoxDelta(this.projectionDeltaWithTransform, this.layoutCorrected, targetWithTransforms, latestValues);
    }
    registerSharedNode(layoutId, node) {
      if (!this.sharedNodes.has(layoutId)) {
        this.sharedNodes.set(layoutId, new NodeStack());
      }
      const stack = this.sharedNodes.get(layoutId);
      stack.add(node);
      const config = node.options.initialPromotionConfig;
      node.promote({
        transition: config ? config.transition : void 0,
        preserveFollowOpacity: config && config.shouldPreserveFollowOpacity ? config.shouldPreserveFollowOpacity(node) : void 0
      });
    }
    isLead() {
      const stack = this.getStack();
      return stack ? stack.lead === this : true;
    }
    getLead() {
      const { layoutId } = this.options;
      return layoutId ? this.getStack()?.lead || this : this;
    }
    getPrevLead() {
      const { layoutId } = this.options;
      return layoutId ? this.getStack()?.prevLead : void 0;
    }
    getStack() {
      const { layoutId } = this.options;
      if (layoutId)
        return this.root.sharedNodes.get(layoutId);
    }
    promote({ needsReset, transition, preserveFollowOpacity } = {}) {
      const stack = this.getStack();
      if (stack)
        stack.promote(this, preserveFollowOpacity);
      if (needsReset) {
        this.projectionDelta = void 0;
        this.needsReset = true;
      }
      if (transition)
        this.setOptions({ transition });
    }
    relegate() {
      const stack = this.getStack();
      if (stack) {
        return stack.relegate(this);
      } else {
        return false;
      }
    }
    resetSkewAndRotation() {
      const { visualElement } = this.options;
      if (!visualElement)
        return;
      let hasDistortingTransform = false;
      const { latestValues } = visualElement;
      if (latestValues.z || latestValues.rotate || latestValues.rotateX || latestValues.rotateY || latestValues.rotateZ || latestValues.skewX || latestValues.skewY) {
        hasDistortingTransform = true;
      }
      if (!hasDistortingTransform)
        return;
      const resetValues = {};
      if (latestValues.z) {
        resetDistortingTransform("z", visualElement, resetValues, this.animationValues);
      }
      for (let i = 0; i < transformAxes.length; i++) {
        resetDistortingTransform(`rotate${transformAxes[i]}`, visualElement, resetValues, this.animationValues);
        resetDistortingTransform(`skew${transformAxes[i]}`, visualElement, resetValues, this.animationValues);
      }
      visualElement.render();
      for (const key in resetValues) {
        visualElement.setStaticValue(key, resetValues[key]);
        if (this.animationValues) {
          this.animationValues[key] = resetValues[key];
        }
      }
      visualElement.scheduleRender();
    }
    applyProjectionStyles(targetStyle, styleProp) {
      if (!this.instance || this.isSVG)
        return;
      if (!this.isVisible) {
        targetStyle.visibility = "hidden";
        return;
      }
      const transformTemplate = this.getTransformTemplate();
      if (this.needsReset) {
        this.needsReset = false;
        targetStyle.visibility = "";
        targetStyle.opacity = "";
        targetStyle.pointerEvents = resolveMotionValue(styleProp?.pointerEvents) || "";
        targetStyle.transform = transformTemplate ? transformTemplate(this.latestValues, "") : "none";
        return;
      }
      const lead = this.getLead();
      if (!this.projectionDelta || !this.layout || !lead.target) {
        if (this.options.layoutId) {
          targetStyle.opacity = this.latestValues.opacity !== void 0 ? this.latestValues.opacity : 1;
          targetStyle.pointerEvents = resolveMotionValue(styleProp?.pointerEvents) || "";
        }
        if (this.hasProjected && !hasTransform(this.latestValues)) {
          targetStyle.transform = transformTemplate ? transformTemplate({}, "") : "none";
          this.hasProjected = false;
        }
        return;
      }
      targetStyle.visibility = "";
      const valuesToRender = lead.animationValues || lead.latestValues;
      this.applyTransformsToTarget();
      let transform = buildProjectionTransform(this.projectionDeltaWithTransform, this.treeScale, valuesToRender);
      if (transformTemplate) {
        transform = transformTemplate(valuesToRender, transform);
      }
      targetStyle.transform = transform;
      const { x, y } = this.projectionDelta;
      targetStyle.transformOrigin = `${x.origin * 100}% ${y.origin * 100}% 0`;
      if (lead.animationValues) {
        targetStyle.opacity = lead === this ? valuesToRender.opacity ?? this.latestValues.opacity ?? 1 : this.preserveOpacity ? this.latestValues.opacity : valuesToRender.opacityExit;
      } else {
        targetStyle.opacity = lead === this ? valuesToRender.opacity !== void 0 ? valuesToRender.opacity : "" : valuesToRender.opacityExit !== void 0 ? valuesToRender.opacityExit : 0;
      }
      for (const key in scaleCorrectors$1) {
        if (valuesToRender[key] === void 0)
          continue;
        const { correct, applyTo, isCSSVariable } = scaleCorrectors$1[key];
        const corrected = transform === "none" ? valuesToRender[key] : correct(valuesToRender[key], lead);
        if (applyTo) {
          const num = applyTo.length;
          for (let i = 0; i < num; i++) {
            targetStyle[applyTo[i]] = corrected;
          }
        } else {
          if (isCSSVariable) {
            this.options.visualElement.renderState.vars[key] = corrected;
          } else {
            targetStyle[key] = corrected;
          }
        }
      }
      if (this.options.layoutId) {
        targetStyle.pointerEvents = lead === this ? resolveMotionValue(styleProp?.pointerEvents) || "" : "none";
      }
    }
    clearSnapshot() {
      this.resumeFrom = this.snapshot = void 0;
    }
    // Only run on root
    resetTree() {
      this.root.nodes.forEach((node) => node.currentAnimation?.stop());
      this.root.nodes.forEach(clearMeasurements);
      this.root.sharedNodes.clear();
    }
  };
}
function updateLayout(node) {
  node.updateLayout();
}
function notifyLayoutUpdate(node) {
  const snapshot2 = node.resumeFrom?.snapshot || node.snapshot;
  if (node.isLead() && node.layout && snapshot2 && node.hasListeners("didUpdate")) {
    const { layoutBox: layout, measuredBox: measuredLayout } = node.layout;
    const { animationType } = node.options;
    const isShared = snapshot2.source !== node.layout.source;
    if (animationType === "size") {
      eachAxis$1((axis) => {
        const axisSnapshot = isShared ? snapshot2.measuredBox[axis] : snapshot2.layoutBox[axis];
        const length = calcLength$1(axisSnapshot);
        axisSnapshot.min = layout[axis].min;
        axisSnapshot.max = axisSnapshot.min + length;
      });
    } else if (shouldAnimatePositionOnly(animationType, snapshot2.layoutBox, layout)) {
      eachAxis$1((axis) => {
        const axisSnapshot = isShared ? snapshot2.measuredBox[axis] : snapshot2.layoutBox[axis];
        const length = calcLength$1(layout[axis]);
        axisSnapshot.max = axisSnapshot.min + length;
        if (node.relativeTarget && !node.currentAnimation) {
          node.isProjectionDirty = true;
          node.relativeTarget[axis].max = node.relativeTarget[axis].min + length;
        }
      });
    }
    const layoutDelta = createDelta();
    calcBoxDelta(layoutDelta, layout, snapshot2.layoutBox);
    const visualDelta = createDelta();
    if (isShared) {
      calcBoxDelta(visualDelta, node.applyTransform(measuredLayout, true), snapshot2.measuredBox);
    } else {
      calcBoxDelta(visualDelta, layout, snapshot2.layoutBox);
    }
    const hasLayoutChanged = !isDeltaZero(layoutDelta);
    let hasRelativeLayoutChanged = false;
    if (!node.resumeFrom) {
      const relativeParent = node.getClosestProjectingParent();
      if (relativeParent && !relativeParent.resumeFrom) {
        const { snapshot: parentSnapshot, layout: parentLayout } = relativeParent;
        if (parentSnapshot && parentLayout) {
          const relativeSnapshot = createBox$1();
          calcRelativePosition(relativeSnapshot, snapshot2.layoutBox, parentSnapshot.layoutBox);
          const relativeLayout = createBox$1();
          calcRelativePosition(relativeLayout, layout, parentLayout.layoutBox);
          if (!boxEqualsRounded(relativeSnapshot, relativeLayout)) {
            hasRelativeLayoutChanged = true;
          }
          if (relativeParent.options.layoutRoot) {
            node.relativeTarget = relativeLayout;
            node.relativeTargetOrigin = relativeSnapshot;
            node.relativeParent = relativeParent;
          }
        }
      }
    }
    node.notifyListeners("didUpdate", {
      layout,
      snapshot: snapshot2,
      delta: visualDelta,
      layoutDelta,
      hasLayoutChanged,
      hasRelativeLayoutChanged
    });
  } else if (node.isLead()) {
    const { onExitComplete } = node.options;
    onExitComplete && onExitComplete();
  }
  node.options.transition = void 0;
}
function propagateDirtyNodes(node) {
  if (statsBuffer.value) {
    metrics.nodes++;
  }
  if (!node.parent)
    return;
  if (!node.isProjecting()) {
    node.isProjectionDirty = node.parent.isProjectionDirty;
  }
  node.isSharedProjectionDirty || (node.isSharedProjectionDirty = Boolean(node.isProjectionDirty || node.parent.isProjectionDirty || node.parent.isSharedProjectionDirty));
  node.isTransformDirty || (node.isTransformDirty = node.parent.isTransformDirty);
}
function cleanDirtyNodes(node) {
  node.isProjectionDirty = node.isSharedProjectionDirty = node.isTransformDirty = false;
}
function clearSnapshot(node) {
  node.clearSnapshot();
}
function clearMeasurements(node) {
  node.clearMeasurements();
}
function clearIsLayoutDirty(node) {
  node.isLayoutDirty = false;
}
function resetTransformStyle(node) {
  const { visualElement } = node.options;
  if (visualElement && visualElement.getProps().onBeforeLayoutMeasure) {
    visualElement.notify("BeforeLayoutMeasure");
  }
  node.resetTransform();
}
function finishAnimation(node) {
  node.finishAnimation();
  node.targetDelta = node.relativeTarget = node.target = void 0;
  node.isProjectionDirty = true;
}
function resolveTargetDelta(node) {
  node.resolveTargetDelta();
}
function calcProjection(node) {
  node.calcProjection();
}
function resetSkewAndRotation(node) {
  node.resetSkewAndRotation();
}
function removeLeadSnapshots(stack) {
  stack.removeLeadSnapshot();
}
function mixAxisDelta(output, delta, p) {
  output.translate = mixNumber(delta.translate, 0, p);
  output.scale = mixNumber(delta.scale, 1, p);
  output.origin = delta.origin;
  output.originPoint = delta.originPoint;
}
function mixAxis(output, from, to, p) {
  output.min = mixNumber(from.min, to.min, p);
  output.max = mixNumber(from.max, to.max, p);
}
function mixBox(output, from, to, p) {
  mixAxis(output.x, from.x, to.x, p);
  mixAxis(output.y, from.y, to.y, p);
}
function hasOpacityCrossfade(node) {
  return node.animationValues && node.animationValues.opacityExit !== void 0;
}
const defaultLayoutTransition = {
  duration: 0.45,
  ease: [0.4, 0, 0.1, 1]
};
const userAgentContains = (string) => typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().includes(string);
const roundPoint = userAgentContains("applewebkit/") && !userAgentContains("chrome/") ? Math.round : noop$3;
function roundAxis(axis) {
  axis.min = roundPoint(axis.min);
  axis.max = roundPoint(axis.max);
}
function roundBox(box) {
  roundAxis(box.x);
  roundAxis(box.y);
}
function shouldAnimatePositionOnly(animationType, snapshot2, layout) {
  return animationType === "position" || animationType === "preserve-aspect" && !isNear(aspectRatio(snapshot2), aspectRatio(layout), 0.2);
}
function checkNodeWasScrollRoot(node) {
  return node !== node.root && node.scroll?.wasRoot;
}
function addDomEvent(target, eventName, handler, options = { passive: true }) {
  target.addEventListener(eventName, handler, options);
  return () => target.removeEventListener(eventName, handler);
}
const DocumentProjectionNode = createProjectionNode({
  attachResizeListener: (ref, notify) => addDomEvent(ref, "resize", notify),
  measureScroll: () => ({
    x: document.documentElement.scrollLeft || document.body.scrollLeft,
    y: document.documentElement.scrollTop || document.body.scrollTop
  }),
  checkIsScrollRoot: () => true
});
const rootProjectionNode = {
  current: void 0
};
const HTMLProjectionNode = createProjectionNode({
  measureScroll: (instance) => ({
    x: instance.scrollLeft,
    y: instance.scrollTop
  }),
  defaultParent: () => {
    if (!rootProjectionNode.current) {
      const documentNode = new DocumentProjectionNode({});
      documentNode.mount(window);
      documentNode.setOptions({ layoutScroll: true });
      rootProjectionNode.current = documentNode;
    }
    return rootProjectionNode.current;
  },
  resetTransform: (instance, value) => {
    instance.style.transform = value !== void 0 ? value : "none";
  },
  checkIsScrollRoot: (instance) => Boolean(window.getComputedStyle(instance).position === "fixed")
});
function getClosestProjectingNode(visualElement) {
  if (!visualElement)
    return void 0;
  return visualElement.options.allowProjection !== false ? visualElement.projection : getClosestProjectingNode(visualElement.parent);
}
function pixelsToPercent(pixels, axis) {
  if (axis.max === axis.min)
    return 0;
  return pixels / (axis.max - axis.min) * 100;
}
const correctBorderRadius = {
  correct: (latest, node) => {
    if (!node.target)
      return latest;
    if (typeof latest === "string") {
      if (px.test(latest)) {
        latest = parseFloat(latest);
      } else {
        return latest;
      }
    }
    const x = pixelsToPercent(latest, node.target.x);
    const y = pixelsToPercent(latest, node.target.y);
    return `${x}% ${y}%`;
  }
};
const correctBoxShadow = {
  correct: (latest, { treeScale, projectionDelta }) => {
    const original = latest;
    const shadow = complex$1.parse(latest);
    if (shadow.length > 5)
      return original;
    const template = complex$1.createTransformer(latest);
    const offset2 = typeof shadow[0] !== "number" ? 1 : 0;
    const xScale = projectionDelta.x.scale * treeScale.x;
    const yScale = projectionDelta.y.scale * treeScale.y;
    shadow[0 + offset2] /= xScale;
    shadow[1 + offset2] /= yScale;
    const averageScale = mixNumber$1(xScale, yScale, 0.5);
    if (typeof shadow[2 + offset2] === "number")
      shadow[2 + offset2] /= averageScale;
    if (typeof shadow[3 + offset2] === "number")
      shadow[3 + offset2] /= averageScale;
    return template(shadow);
  }
};
const defaultScaleCorrector = {
  borderRadius: {
    ...correctBorderRadius,
    applyTo: ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"]
  },
  borderTopLeftRadius: correctBorderRadius,
  borderTopRightRadius: correctBorderRadius,
  borderBottomLeftRadius: correctBorderRadius,
  borderBottomRightRadius: correctBorderRadius,
  boxShadow: correctBoxShadow
};
function isHTMLElement(value) {
  return typeof value === "object" && value !== null && "nodeType" in value;
}
class ProjectionFeature extends Feature {
  constructor(state) {
    super(state);
    addScaleCorrector$1(defaultScaleCorrector);
  }
  initProjection() {
    const options = this.state.options;
    this.state.visualElement.projection = new HTMLProjectionNode(this.state.visualElement.latestValues, options["data-framer-portal-id"] ? void 0 : getClosestProjectingNode(this.state.visualElement.parent));
    this.state.visualElement.projection.isPresent = true;
    this.setOptions();
  }
  beforeMount() {
    this.initProjection();
  }
  setOptions() {
    const options = this.state.options;
    this.state.visualElement.projection.setOptions({
      layout: options.layout,
      layoutId: options.layoutId,
      alwaysMeasureLayout: Boolean(options.drag) || options.dragConstraints && isHTMLElement(options.dragConstraints),
      visualElement: this.state.visualElement,
      animationType: typeof options.layout === "string" ? options.layout : "both",
      // initialPromotionConfig
      layoutRoot: options.layoutRoot,
      layoutScroll: options.layoutScroll,
      crossfade: options.crossfade,
      onExitComplete: () => {
        if (!this.state.visualElement.projection?.isPresent) {
          const done = doneCallbacks.get(this.state.element);
          this.state.isSafeToRemove = true;
          if (done) {
            done({
              detail: {
                isExit: true
              }
            }, true);
          }
        }
      }
    });
  }
  update() {
    this.setOptions();
  }
  mount() {
    this.state.visualElement.projection?.mount(this.state.element);
  }
}
function createLock(name) {
  let lock = null;
  return () => {
    const openLock = () => {
      lock = null;
    };
    if (lock === null) {
      lock = name;
      return openLock;
    }
    return false;
  };
}
const globalHorizontalLock = createLock("dragHorizontal");
const globalVerticalLock = createLock("dragVertical");
function getGlobalLock(drag) {
  let lock = false;
  if (drag === "y") {
    lock = globalVerticalLock();
  } else if (drag === "x") {
    lock = globalHorizontalLock();
  } else {
    const openHorizontal = globalHorizontalLock();
    const openVertical = globalVerticalLock();
    if (openHorizontal && openVertical) {
      lock = () => {
        openHorizontal();
        openVertical();
      };
    } else {
      if (openHorizontal)
        openHorizontal();
      if (openVertical)
        openVertical();
    }
  }
  return lock;
}
function calcLength(axis) {
  return axis.max - axis.min;
}
function applyConstraints(point, { min, max }, elastic) {
  if (min !== void 0 && point < min) {
    point = elastic ? mixNumber$1(min, point, elastic.min) : Math.max(point, min);
  } else if (max !== void 0 && point > max) {
    point = elastic ? mixNumber$1(max, point, elastic.max) : Math.min(point, max);
  }
  return point;
}
const defaultElastic = 0.35;
function calcRelativeConstraints(layoutBox, { top, left, bottom, right }) {
  return {
    x: calcRelativeAxisConstraints(layoutBox.x, left, right),
    y: calcRelativeAxisConstraints(layoutBox.y, top, bottom)
  };
}
function calcRelativeAxisConstraints(axis, min, max) {
  return {
    min: min !== void 0 ? axis.min + min : void 0,
    max: max !== void 0 ? axis.max + max - (axis.max - axis.min) : void 0
  };
}
function resolveDragElastic(dragElastic = defaultElastic) {
  if (dragElastic === false) {
    dragElastic = 0;
  } else if (dragElastic === true) {
    dragElastic = defaultElastic;
  }
  return {
    x: resolveAxisElastic(dragElastic, "left", "right"),
    y: resolveAxisElastic(dragElastic, "top", "bottom")
  };
}
function resolveAxisElastic(dragElastic, minLabel, maxLabel) {
  return {
    min: resolvePointElastic(dragElastic, minLabel),
    max: resolvePointElastic(dragElastic, maxLabel)
  };
}
function resolvePointElastic(dragElastic, label) {
  return typeof dragElastic === "number" ? dragElastic : dragElastic[label] || 0;
}
function rebaseAxisConstraints(layout, constraints) {
  const relativeConstraints = {};
  if (constraints.min !== void 0) {
    relativeConstraints.min = constraints.min - layout.min;
  }
  if (constraints.max !== void 0) {
    relativeConstraints.max = constraints.max - layout.min;
  }
  return relativeConstraints;
}
function calcViewportConstraints(layoutBox, constraintsBox) {
  return {
    x: calcViewportAxisConstraints(layoutBox.x, constraintsBox.x),
    y: calcViewportAxisConstraints(layoutBox.y, constraintsBox.y)
  };
}
function calcViewportAxisConstraints(layoutAxis, constraintsAxis) {
  let min = constraintsAxis.min - layoutAxis.min;
  let max = constraintsAxis.max - layoutAxis.max;
  if (constraintsAxis.max - constraintsAxis.min < layoutAxis.max - layoutAxis.min) {
    [min, max] = [max, min];
  }
  return { min, max };
}
function calcOrigin(source, target) {
  let origin = 0.5;
  const sourceLength = calcLength(source);
  const targetLength = calcLength(target);
  if (targetLength > sourceLength) {
    origin = progress$1(target.min, target.max - sourceLength, source.min);
  } else if (sourceLength > targetLength) {
    origin = progress$1(source.min, source.max - targetLength, target.min);
  }
  return clamp$1(0, 1, origin);
}
class PanSession {
  /**
   * @internal
   */
  history;
  /**
   * @internal
   */
  startEvent = null;
  /**
   * @internal
   */
  lastMoveEvent = null;
  /**
   * @internal
   */
  lastMoveEventInfo = null;
  /**
   * @internal
   */
  transformPagePoint;
  /**
   * @internal
   */
  handlers = {};
  /**
   * @internal
   */
  removeListeners;
  /**
   * For determining if an animation should resume after it is interupted
   *
   * @internal
   */
  dragSnapToOrigin;
  /**
   * @internal
   */
  contextWindow = window;
  constructor(event, handlers, { transformPagePoint, contextWindow, dragSnapToOrigin = false } = {}) {
    if (!isPrimaryPointer(event))
      return;
    this.dragSnapToOrigin = dragSnapToOrigin;
    this.handlers = handlers;
    this.transformPagePoint = transformPagePoint;
    this.contextWindow = contextWindow || window;
    const info = extractEventInfo(event);
    const initialInfo = transformPoint(info, this.transformPagePoint);
    const { point } = initialInfo;
    const { timestamp } = frameData$1;
    this.history = [{ ...point, timestamp }];
    const { onSessionStart } = handlers;
    onSessionStart && onSessionStart(event, getPanInfo(initialInfo, this.history));
    this.removeListeners = pipe(addPointerEvent(this.contextWindow, "pointermove", this.handlePointerMove), addPointerEvent(this.contextWindow, "pointerup", this.handlePointerUp), addPointerEvent(this.contextWindow, "pointercancel", this.handlePointerUp));
  }
  updatePoint = () => {
    if (!(this.lastMoveEvent && this.lastMoveEventInfo))
      return;
    const info = getPanInfo(this.lastMoveEventInfo, this.history);
    const isPanStarted = this.startEvent !== null;
    const isDistancePastThreshold = distance2D(info.offset, { x: 0, y: 0 }) >= 3;
    if (!isPanStarted && !isDistancePastThreshold)
      return;
    const { point } = info;
    const { timestamp } = frameData$1;
    this.history.push({ ...point, timestamp });
    const { onStart, onMove } = this.handlers;
    if (!isPanStarted) {
      onStart && onStart(this.lastMoveEvent, info);
      this.startEvent = this.lastMoveEvent;
    }
    onMove && onMove(this.lastMoveEvent, info);
  };
  handlePointerMove = (event, info) => {
    this.lastMoveEvent = event;
    this.lastMoveEventInfo = transformPoint(info, this.transformPagePoint);
    frame$1.update(this.updatePoint, true);
  };
  handlePointerUp = (event, info) => {
    this.end();
    const { onEnd, onSessionEnd, resumeAnimation } = this.handlers;
    if (this.dragSnapToOrigin)
      resumeAnimation && resumeAnimation();
    if (!(this.lastMoveEvent && this.lastMoveEventInfo))
      return;
    const panInfo = getPanInfo(event.type === "pointercancel" ? this.lastMoveEventInfo : transformPoint(info, this.transformPagePoint), this.history);
    if (this.startEvent && onEnd) {
      onEnd(event, panInfo);
    }
    onSessionEnd && onSessionEnd(event, panInfo);
  };
  updateHandlers(handlers) {
    this.handlers = handlers;
  }
  end() {
    this.removeListeners && this.removeListeners();
    cancelFrame$1(this.updatePoint);
  }
}
function transformPoint(info, transformPagePoint) {
  return transformPagePoint ? { point: transformPagePoint(info.point) } : info;
}
function subtractPoint(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}
function getPanInfo({ point }, history) {
  return {
    point,
    delta: subtractPoint(point, lastDevicePoint(history)),
    offset: subtractPoint(point, startDevicePoint(history)),
    velocity: getVelocity(history, 0.1)
  };
}
function startDevicePoint(history) {
  return history[0];
}
function lastDevicePoint(history) {
  return history[history.length - 1];
}
function getVelocity(history, timeDelta) {
  if (history.length < 2) {
    return { x: 0, y: 0 };
  }
  let i = history.length - 1;
  let timestampedPoint = null;
  const lastPoint = lastDevicePoint(history);
  while (i >= 0) {
    timestampedPoint = history[i];
    if (lastPoint.timestamp - timestampedPoint.timestamp > secondsToMilliseconds$1(timeDelta)) {
      break;
    }
    i--;
  }
  if (!timestampedPoint) {
    return { x: 0, y: 0 };
  }
  const time2 = millisecondsToSeconds(lastPoint.timestamp - timestampedPoint.timestamp);
  if (time2 === 0) {
    return { x: 0, y: 0 };
  }
  const currentVelocity = {
    x: (lastPoint.x - timestampedPoint.x) / time2,
    y: (lastPoint.y - timestampedPoint.y) / time2
  };
  if (currentVelocity.x === Infinity) {
    currentVelocity.x = 0;
  }
  if (currentVelocity.y === Infinity) {
    currentVelocity.y = 0;
  }
  return currentVelocity;
}
const createAxis = () => ({ min: 0, max: 0 });
function createBox() {
  return {
    x: createAxis(),
    y: createAxis()
  };
}
function eachAxis(callback) {
  return [callback("x"), callback("y")];
}
function getContextWindow({ current }) {
  return current ? current.ownerDocument.defaultView : null;
}
function isWillChangeMotionValue(value) {
  return Boolean(isMotionValue(value) && value.add);
}
function addValueToWillChange(visualElement, key) {
  const willChange = visualElement.getValue("willChange");
  if (isWillChangeMotionValue(willChange)) {
    return willChange.add(key);
  }
}
function convertBoundingBoxToBox({ top, left, right, bottom }) {
  return {
    x: { min: left, max: right },
    y: { min: top, max: bottom }
  };
}
function transformBoxPoints(point, transformPoint2) {
  if (!transformPoint2)
    return point;
  const topLeft = transformPoint2({ x: point.left, y: point.top });
  const bottomRight = transformPoint2({ x: point.right, y: point.bottom });
  return {
    top: topLeft.y,
    left: topLeft.x,
    bottom: bottomRight.y,
    right: bottomRight.x
  };
}
function convertBoxToBoundingBox({ x, y }) {
  return { top: y.min, right: x.max, bottom: y.max, left: x.min };
}
function translateAxis(axis, distance) {
  axis.min = axis.min + distance;
  axis.max = axis.max + distance;
}
function measureViewportBox(instance, transformPoint2) {
  return convertBoundingBoxToBox(transformBoxPoints(instance.getBoundingClientRect(), transformPoint2));
}
function measurePageBox(element2, rootProjectionNode2, transformPagePoint) {
  const viewportBox = measureViewportBox(element2, transformPagePoint);
  const { scroll } = rootProjectionNode2;
  if (scroll) {
    translateAxis(viewportBox.x, scroll.offset.x);
    translateAxis(viewportBox.y, scroll.offset.y);
  }
  return viewportBox;
}
function isPresent(visualElement) {
  return !doneCallbacks.has(visualElement.current);
}
const elementDragControls = /* @__PURE__ */ new WeakMap();
class VisualElementDragControls {
  visualElement;
  panSession;
  // This is a reference to the global drag gesture lock, ensuring only one component
  // can "capture" the drag of one or both axes.
  // TODO: Look into moving this into pansession?
  openGlobalLock = null;
  isDragging = false;
  currentDirection = null;
  originPoint = { x: 0, y: 0 };
  /**
   * The permitted boundaries of travel, in pixels.
   */
  constraints = false;
  hasMutatedConstraints = false;
  /**
   * The per-axis resolved elastic values.
   */
  elastic = createBox();
  constructor(visualElement) {
    this.visualElement = visualElement;
  }
  start(originEvent, { snapToCursor = false } = {}) {
    if (!isPresent(this.visualElement))
      return;
    const onSessionStart = (event) => {
      const { dragSnapToOrigin: dragSnapToOrigin2 } = this.getProps();
      dragSnapToOrigin2 ? this.pauseAnimation() : this.stopAnimation();
      if (snapToCursor) {
        this.snapToCursor(extractEventInfo(event, "page").point);
      }
    };
    const onStart = (event, info) => {
      const { drag, dragPropagation, onDragStart } = this.getProps();
      if (drag && !dragPropagation) {
        if (this.openGlobalLock)
          this.openGlobalLock();
        this.openGlobalLock = getGlobalLock(drag);
        if (!this.openGlobalLock)
          return;
      }
      this.isDragging = true;
      this.currentDirection = null;
      this.resolveConstraints();
      if (this.visualElement.projection) {
        this.visualElement.projection.isAnimationBlocked = true;
        this.visualElement.projection.target = void 0;
      }
      eachAxis((axis) => {
        let current = this.getAxisMotionValue(axis).get() || 0;
        if (percent$1.test(current)) {
          const { projection } = this.visualElement;
          if (projection && projection.layout) {
            const measuredAxis = projection.layout.layoutBox[axis];
            if (measuredAxis) {
              const length = calcLength(measuredAxis);
              current = length * (parseFloat(current) / 100);
            }
          }
        }
        this.originPoint[axis] = current;
      });
      if (onDragStart) {
        frame$1.postRender(() => onDragStart(event, info));
      }
      addValueToWillChange(this.visualElement, "transform");
      const state = this.visualElement.state;
      state.setActive("whileDrag", true);
    };
    const onMove = (event, info) => {
      const { dragPropagation, dragDirectionLock, onDirectionLock, onDrag } = this.getProps();
      if (!dragPropagation && !this.openGlobalLock)
        return;
      const { offset: offset2 } = info;
      if (dragDirectionLock && this.currentDirection === null) {
        this.currentDirection = getCurrentDirection(offset2);
        if (this.currentDirection !== null) {
          onDirectionLock && onDirectionLock(this.currentDirection);
        }
        return;
      }
      this.updateAxis("x", info.point, offset2);
      this.updateAxis("y", info.point, offset2);
      this.visualElement.render();
      onDrag && onDrag(event, info);
    };
    const onSessionEnd = (event, info) => this.stop(event, info);
    const resumeAnimation = () => eachAxis((axis) => this.getAnimationState(axis) === "paused" && this.getAxisMotionValue(axis).animation?.play());
    const { dragSnapToOrigin } = this.getProps();
    this.panSession = new PanSession(originEvent, {
      onSessionStart,
      onStart,
      onMove,
      onSessionEnd,
      resumeAnimation
    }, {
      transformPagePoint: this.visualElement.getTransformPagePoint(),
      dragSnapToOrigin,
      contextWindow: getContextWindow(this.visualElement)
    });
  }
  stop(event, info) {
    const isDragging = this.isDragging;
    this.cancel();
    if (!isDragging)
      return;
    const { velocity } = info;
    this.startAnimation(velocity);
    const { onDragEnd } = this.getProps();
    if (onDragEnd) {
      frame$1.postRender(() => onDragEnd(event, info));
    }
  }
  cancel() {
    this.isDragging = false;
    const { projection, animationState } = this.visualElement;
    if (projection) {
      projection.isAnimationBlocked = false;
    }
    this.panSession && this.panSession.end();
    this.panSession = void 0;
    const { dragPropagation } = this.getProps();
    if (!dragPropagation && this.openGlobalLock) {
      this.openGlobalLock();
      this.openGlobalLock = null;
    }
    const state = this.visualElement.state;
    state.setActive("whileDrag", false);
  }
  updateAxis(axis, _point, offset2) {
    const { drag } = this.getProps();
    if (!offset2 || !shouldDrag(axis, drag, this.currentDirection))
      return;
    const axisValue = this.getAxisMotionValue(axis);
    let next = this.originPoint[axis] + offset2[axis];
    if (this.constraints && this.constraints[axis]) {
      next = applyConstraints(next, this.constraints[axis], this.elastic[axis]);
    }
    axisValue.set(next);
  }
  resolveConstraints() {
    const { dragConstraints, dragElastic } = this.getProps();
    const layout = this.visualElement.projection && !this.visualElement.projection.layout ? this.visualElement.projection.measure(false) : this.visualElement.projection?.layout;
    const prevConstraints = this.constraints;
    if (dragConstraints && isHTMLElement(dragConstraints)) {
      if (!this.constraints) {
        this.constraints = this.resolveRefConstraints();
      }
    } else {
      if (dragConstraints && layout) {
        this.constraints = calcRelativeConstraints(layout.layoutBox, dragConstraints);
      } else {
        this.constraints = false;
      }
    }
    this.elastic = resolveDragElastic(dragElastic);
    if (prevConstraints !== this.constraints && layout && this.constraints && !this.hasMutatedConstraints) {
      eachAxis((axis) => {
        if (this.constraints !== false && this.getAxisMotionValue(axis)) {
          this.constraints[axis] = rebaseAxisConstraints(layout.layoutBox[axis], this.constraints[axis]);
        }
      });
    }
  }
  resolveRefConstraints() {
    const { dragConstraints: constraints, onMeasureDragConstraints } = this.getProps();
    if (!constraints || !isHTMLElement(constraints))
      return false;
    const constraintsElement = constraints;
    invariant(constraintsElement !== null, "If `dragConstraints` is set as a React ref, that ref must be passed to another component's `ref` prop.");
    const { projection } = this.visualElement;
    if (!projection || !projection.layout)
      return false;
    const constraintsBox = measurePageBox(constraintsElement, projection.root, this.visualElement.getTransformPagePoint());
    let measuredConstraints = calcViewportConstraints(projection.layout.layoutBox, constraintsBox);
    if (onMeasureDragConstraints) {
      const userConstraints = onMeasureDragConstraints(convertBoxToBoundingBox(measuredConstraints));
      this.hasMutatedConstraints = !!userConstraints;
      if (userConstraints) {
        measuredConstraints = convertBoundingBoxToBox(userConstraints);
      }
    }
    return measuredConstraints;
  }
  startAnimation(velocity) {
    const { drag, dragMomentum, dragElastic, dragTransition, dragSnapToOrigin, onDragTransitionEnd } = this.getProps();
    const constraints = this.constraints || {};
    const momentumAnimations = eachAxis((axis) => {
      if (!shouldDrag(axis, drag, this.currentDirection)) {
        return;
      }
      let transition = constraints && constraints[axis] || {};
      if (dragSnapToOrigin)
        transition = { min: 0, max: 0 };
      const bounceStiffness = dragElastic ? 200 : 1e6;
      const bounceDamping = dragElastic ? 40 : 1e7;
      const inertia = {
        type: "inertia",
        velocity: dragMomentum ? velocity[axis] : 0,
        bounceStiffness,
        bounceDamping,
        timeConstant: 750,
        restDelta: 1,
        restSpeed: 10,
        ...dragTransition,
        ...transition
      };
      return this.startAxisValueAnimation(axis, inertia);
    });
    return Promise.all(momentumAnimations).then(onDragTransitionEnd);
  }
  startAxisValueAnimation(axis, transition) {
    const axisValue = this.getAxisMotionValue(axis);
    addValueToWillChange(this.visualElement, axis);
    return axisValue.start(animateMotionValue(axis, axisValue, 0, transition, this.visualElement, false));
  }
  stopAnimation() {
    if (!isPresent(this.visualElement))
      return;
    eachAxis((axis) => this.getAxisMotionValue(axis).stop());
  }
  pauseAnimation() {
    eachAxis((axis) => this.getAxisMotionValue(axis).animation?.pause());
  }
  getAnimationState(axis) {
    return this.getAxisMotionValue(axis).animation?.state;
  }
  /**
   * Drag works differently depending on which props are provided.
   *
   * - If _dragX and _dragY are provided, we output the gesture delta directly to those motion values.
   * - Otherwise, we apply the delta to the x/y motion values.
   */
  getAxisMotionValue(axis) {
    const dragKey = `_drag${axis.toUpperCase()}`;
    const props = this.visualElement.getProps();
    const externalMotionValue = props[dragKey];
    return externalMotionValue || this.visualElement.getValue(axis, (props.initial ? props.initial[axis] : void 0) || 0);
  }
  snapToCursor(point) {
    eachAxis((axis) => {
      const { drag } = this.getProps();
      if (!shouldDrag(axis, drag, this.currentDirection))
        return;
      const { projection } = this.visualElement;
      const axisValue = this.getAxisMotionValue(axis);
      if (projection && projection.layout) {
        const { min, max } = projection.layout.layoutBox[axis];
        axisValue.set(point[axis] - mixNumber$1(min, max, 0.5));
      }
    });
  }
  /**
   * When the viewport resizes we want to check if the measured constraints
   * have changed and, if so, reposition the element within those new constraints
   * relative to where it was before the resize.
   */
  scalePositionWithinConstraints() {
    if (!this.visualElement.current)
      return;
    const { drag, dragConstraints } = this.getProps();
    const { projection } = this.visualElement;
    if (!isHTMLElement(dragConstraints) || !projection || !this.constraints)
      return;
    this.stopAnimation();
    const boxProgress = { x: 0, y: 0 };
    eachAxis((axis) => {
      const axisValue = this.getAxisMotionValue(axis);
      if (axisValue && this.constraints !== false) {
        const latest = axisValue.get();
        boxProgress[axis] = calcOrigin({ min: latest, max: latest }, this.constraints[axis]);
      }
    });
    const { transformTemplate } = this.visualElement.getProps();
    this.visualElement.current.style.transform = transformTemplate ? transformTemplate({}, "") : "none";
    projection.root && projection.root.updateScroll();
    projection.updateLayout();
    this.resolveConstraints();
    eachAxis((axis) => {
      if (!shouldDrag(axis, drag, null))
        return;
      const axisValue = this.getAxisMotionValue(axis);
      const { min, max } = this.constraints[axis];
      axisValue.set(mixNumber$1(min, max, boxProgress[axis]));
    });
  }
  addListeners() {
    if (!this.visualElement.current)
      return;
    elementDragControls.set(this.visualElement, this);
    const element2 = this.visualElement.current;
    const stopPointerListener = addPointerEvent(element2, "pointerdown", (event) => {
      const { drag, dragListener = true } = this.getProps();
      drag && dragListener && this.start(event);
    });
    const measureDragConstraints = () => {
      const { dragConstraints } = this.getProps();
      if (isHTMLElement(dragConstraints)) {
        this.constraints = this.resolveRefConstraints();
      }
    };
    const { projection } = this.visualElement;
    const stopMeasureLayoutListener = projection.addEventListener("measure", measureDragConstraints);
    if (projection && !projection.layout) {
      projection.root && projection.root.updateScroll();
      projection.updateLayout();
    }
    frame$1.read(measureDragConstraints);
    const stopResizeListener = addDomEvent$1(window, "resize", () => this.scalePositionWithinConstraints());
    const stopLayoutUpdateListener = projection.addEventListener("didUpdate", (({ delta, hasLayoutChanged }) => {
      if (this.isDragging && hasLayoutChanged) {
        eachAxis((axis) => {
          const motionValue2 = this.getAxisMotionValue(axis);
          if (!motionValue2)
            return;
          this.originPoint[axis] += delta[axis].translate;
          motionValue2.set(motionValue2.get() + delta[axis].translate);
        });
        this.visualElement.render();
      }
    }));
    return () => {
      stopResizeListener();
      stopPointerListener();
      stopMeasureLayoutListener();
      stopLayoutUpdateListener && stopLayoutUpdateListener();
    };
  }
  getProps() {
    const props = this.visualElement.getProps();
    const { drag = false, dragDirectionLock = false, dragPropagation = false, dragConstraints = false, dragElastic = defaultElastic, dragMomentum = true } = props;
    return {
      ...props,
      drag,
      dragDirectionLock,
      dragPropagation,
      dragConstraints,
      dragElastic,
      dragMomentum
    };
  }
}
function shouldDrag(direction, drag, currentDirection) {
  return (drag === true || drag === direction) && (currentDirection === null || currentDirection === direction);
}
function getCurrentDirection(offset2, lockThreshold = 10) {
  let direction = null;
  if (Math.abs(offset2.y) > lockThreshold) {
    direction = "y";
  } else if (Math.abs(offset2.x) > lockThreshold) {
    direction = "x";
  }
  return direction;
}
class DragGesture extends Feature {
  controls;
  removeGroupControls = noop$2;
  removeListeners = noop$2;
  constructor(state) {
    super(state);
    this.controls = new VisualElementDragControls(state.visualElement);
  }
  mount() {
    const { dragControls } = this.state.options;
    if (dragControls) {
      this.removeGroupControls = dragControls.subscribe(this.controls);
    }
    this.removeListeners = this.controls.addListeners() || noop$2;
  }
  unmount() {
    this.removeGroupControls();
    this.removeListeners();
  }
}
const scaleCorrectors = {};
function addScaleCorrector(correctors) {
  for (const key in correctors) {
    scaleCorrectors[key] = correctors[key];
    if (isCSSVariableName$1(key)) {
      scaleCorrectors[key].isCSSVariable = true;
    }
  }
}
class LayoutFeature extends Feature {
  constructor(state) {
    super(state);
    addScaleCorrector(defaultScaleCorrector);
  }
  beforeUpdate() {
    this.state.willUpdate("beforeUpdate");
  }
  update() {
    this.didUpdate();
  }
  didUpdate() {
    if (this.state.options.layout || this.state.options.layoutId || this.state.options.drag) {
      this.state.visualElement.projection?.root?.didUpdate();
    }
  }
  mount() {
    const options = this.state.options;
    const layoutGroup = this.state.options.layoutGroup;
    if (options.layout || options.layoutId) {
      const projection = this.state.visualElement.projection;
      if (projection) {
        projection.promote();
        layoutGroup?.group?.add(projection);
      }
    }
    this.didUpdate();
  }
  beforeUnmount() {
    const projection = this.state.visualElement.projection;
    if (projection) {
      this.state.willUpdate("beforeUnmount");
      if (this.state.options.layoutId) {
        projection.isPresent = false;
        projection.relegate();
      } else if (this.state.options.layout) {
        this.state.isSafeToRemove = true;
      }
    }
  }
  unmount() {
    const layoutGroup = this.state.options.layoutGroup;
    const projection = this.state.visualElement.projection;
    if (projection) {
      if (layoutGroup?.group && (this.state.options.layout || this.state.options.layoutId)) {
        layoutGroup.group.remove(projection);
      }
      this.didUpdate();
    }
  }
}
function asyncHandler(handler) {
  return (event, info) => {
    if (handler) {
      frame$1.postRender(() => handler(event, info));
    }
  };
}
class PanGesture extends Feature {
  session;
  removePointerDownListener = noop$2;
  onPointerDown(pointerDownEvent) {
    this.session = new PanSession(pointerDownEvent, this.createPanHandlers(), {
      transformPagePoint: this.state.visualElement.getTransformPagePoint(),
      contextWindow: getContextWindow(this.state.visualElement)
    });
  }
  createPanHandlers() {
    return {
      onSessionStart: asyncHandler((_, info) => {
        const { onPanSessionStart } = this.state.options;
        onPanSessionStart && onPanSessionStart(_, info);
      }),
      onStart: asyncHandler((_, info) => {
        const { onPanStart } = this.state.options;
        onPanStart && onPanStart(_, info);
      }),
      onMove: (event, info) => {
        const { onPan } = this.state.options;
        onPan && onPan(event, info);
      },
      onEnd: (event, info) => {
        const { onPanEnd } = this.state.options;
        delete this.session;
        if (onPanEnd) {
          frame$1.postRender(() => onPanEnd(event, info));
        }
      }
    };
  }
  mount() {
    this.removePointerDownListener = addPointerEvent(this.state.element, "pointerdown", this.onPointerDown.bind(this));
  }
  update() {
  }
  unmount() {
    this.removePointerDownListener();
    this.session && this.session.end();
  }
}
const domMax = [
  AnimationFeature,
  PressGesture,
  HoverGesture,
  InViewGesture,
  FocusGesture,
  ProjectionFeature,
  PanGesture,
  DragGesture,
  LayoutFeature
];
const MotionStateContext = new Context2("MotionState");
const LayoutGroupContext = new Context2("LayoutGroup");
const LazyMotionContext = new Context2("LazyMotionContext");
const defaultConfig = {
  reducedMotion: "never",
  transition: void 0,
  nonce: void 0
};
const MotionConfigContext = new Context2("MotionConfig");
function useMotionConfig() {
  return MotionConfigContext.getOr(() => defaultConfig);
}
const PresenceManagerContext = new Context2("PresenceManagerContext", {});
const validMotionProps = /* @__PURE__ */ new Set([
  "animate",
  "exit",
  "variants",
  "initial",
  "style",
  // "values",
  "variants",
  "transition",
  "transformTemplate",
  "custom",
  "inherit",
  "onBeforeLayoutMeasure",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onDragStart",
  "onDrag",
  "onDragEnd",
  "onMeasureDragConstraints",
  "onDirectionLock",
  "onDragTransitionEnd",
  // "_dragX",
  // "_dragY",
  "onHoverStart",
  "onHoverEnd",
  "onViewportEnter",
  "onViewportLeave",
  // "globalTapTarget",
  "ignoreStrict",
  // "viewport",
  // just doing what the vue version does
  "forwardMotionProps",
  "as",
  "ref"
  // atp idk,
]);
function isValidMotionProp(key) {
  return key.startsWith("while") || key.startsWith("drag") && key !== "draggable" || key.startsWith("layout") || key.startsWith("onTap") || key.startsWith("onPan") || key.startsWith("onLayout") || validMotionProps.has(key);
}
Motion[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/motion-sv/dist/components/motion/motion.svelte";
const VOID_TAGS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
function Motion($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        features = [],
        as: AsComponent,
        props,
        ref: externalRef = void 0,
        forwardMotionProps = false
      } = $$props;
      const parentState = MotionStateContext.getOr(null);
      const layoutGroup = LayoutGroupContext.getOr({});
      const config = useMotionConfig();
      const animatePresenceContext = AnimatePresenceContext.getOr({});
      const presenceManager = PresenceManagerContext.getOr({});
      const lazyMotionContext = LazyMotionContext.getOr({ features: () => [], strict: false });
      const layoutMotionScope = LayoutMotionScopeContext.getOr(null);
      if (process.env.NODE_ENV !== "production" && // @ts-expect-error
      features?.length && lazyMotionContext.strict) {
        const strictMessage = "You have rendered a `motion` component within a `LazyMotion` component. This will break tree shaking. Import and render a `m` component instead.";
        props.ignoreStrict ? warning(false, strictMessage) : invariant(false, strictMessage);
      }
      function getLayoutId() {
        if (layoutGroup.id && props.layoutId) return `${layoutGroup.id}-${props.layoutId}`;
        return props.layoutId || void 0;
      }
      const motionOptions = derived(() => ({
        ...props,
        features,
        lazyMotionContext,
        layoutId: getLayoutId(),
        transition: props.transition ?? config().transition,
        layoutGroup,
        motionConfig: config(),
        inViewOptions: props.inViewOptions ?? config().inViewOptions,
        animatePresenceContext,
        initial: animatePresenceContext.initial === false ? animatePresenceContext.initial : props.initial === true ? void 0 : props.initial
      }));
      const motionState = new MotionState(motionOptions(), parentState);
      MotionStateContext.set(motionState);
      layoutMotionScope?.register(motionState);
      const getAttrs = derived(() => {
        const isSVG = motionState.type === "svg";
        const attrsProps = {};
        for (const key2 of Reflect.ownKeys(props)) {
          if (typeof key2 === "string") {
            if (isValidMotionProp(key2)) continue;
            const value = props[key2];
            attrsProps[key2] = isMotionValue(value) ? value.get() : value;
          } else {
            attrsProps[key2] = props[key2];
          }
        }
        let styleSource = isSVG ? {} : motionState.visualElement?.latestValues || motionState.baseTarget;
        if (props.whileInView && props.inViewOptions?.useClipPathWorkaround && !motionState.activeStates.whileInView) {
          const filtered = {};
          for (const key2 in styleSource) {
            if (key2 === "clipPath") {
              const value = styleSource[key2];
              if (typeof value === "string" && value.includes("100%")) {
                continue;
              }
            }
            filtered[key2] = styleSource[key2];
          }
          styleSource = filtered;
        }
        let styleProps = { ...props.style, ...styleSource };
        const isWaitBlocked = presenceManager.isWaitBlocked?.() === true;
        if (isWaitBlocked && !motionState.activeStates.exit) {
          styleProps.display = "none";
        }
        if (isSVG) {
          const { attrs, style: style3 } = convertSvgStyleToAttributes({
            ...motionState.isMounted() ? motionState.target : motionState.baseTarget,
            ...styleProps
          });
          if (style3.transform || attrs.transformOrigin) {
            style3.transformOrigin = attrs.transformOrigin ?? "50% 50%";
            delete attrs.transformOrigin;
          }
          if (style3.transform) {
            style3.transformBox = style3.transformBox ?? "fill-box";
            delete attrs.transformBox;
          }
          Object.assign(attrsProps, attrs);
          styleProps = style3;
        }
        if (props.drag && props.dragListener !== false) {
          Object.assign(styleProps, {
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            touchAction: props.drag === true ? "none" : `pan-${props.drag === "x" ? "y" : "x"}`
          });
        }
        const style2 = createStyles(styleProps);
        if (style2) attrsProps.style = css(style2);
        return attrsProps;
      });
      watch(
        () => motionOptions(),
        (options) => {
          motionState.update(options);
        },
        { lazy: true }
      );
      function nodeRef(node) {
        externalRef = node;
        const waitBlocked = run(() => presenceManager.isWaitBlocked?.() === true);
        motionState.mount(
          node,
          run(() => motionOptions()),
          /* notAnimate when wait-blocked */
          waitBlocked
        );
        if (waitBlocked) {
          motionState.setActive("animate", false, false);
        }
        return () => {
          motionState.unmount();
        };
      }
      presenceManager.isWaitBlocked?.() === true;
      const isInPresenceContext = AnimatePresenceContext.exists();
      animatePresenceContext.transition;
      const shouldAllowExit = () => !!props.exit && isInPresenceContext;
      const EXITING_KEY = "__motion_exiting__";
      const onintrostart = () => shouldAllowExit() && presenceManager.onIntroStart?.(motionState.element);
      const onoutrostart = () => {
        if (!shouldAllowExit()) return;
        motionState.element[EXITING_KEY] = true;
        presenceManager.onOutroStart?.(motionState.element);
      };
      const onoutroend = () => {
        if (!shouldAllowExit()) return;
        delete motionState.element[EXITING_KEY];
        presenceManager.onOutroEnd?.(motionState.element);
      };
      const key = createAttachmentKey();
      const sharedProps = derived(() => ({
        ...getAttrs(),
        [key]: nodeRef,
        onintrostart,
        onoutrostart,
        onoutroend
      }));
      if (typeof AsComponent === "string") {
        $$renderer2.push("<!--[0-->");
        if (VOID_TAGS.has(AsComponent)) {
          $$renderer2.push("<!--[0-->");
          validate_dynamic_element_tag(() => AsComponent);
          push_element($$renderer2, AsComponent, 401, 2);
          element($$renderer2, AsComponent, () => {
            $$renderer2.push(`${attributes({ ...sharedProps() })}`);
          });
          pop_element();
        } else {
          $$renderer2.push("<!--[-1-->");
          validate_dynamic_element_tag(() => AsComponent);
          validate_void_dynamic_element(() => AsComponent);
          push_element($$renderer2, AsComponent, 403, 2);
          element(
            $$renderer2,
            AsComponent,
            () => {
              $$renderer2.push(`${attributes({
                ...sharedProps(),
                xmlns: motionState.type === "svg" ? "http://www.w3.org/2000/svg" : void 0
              })}`);
            },
            () => {
              props.children?.($$renderer2);
              $$renderer2.push(`<!---->`);
            }
          );
          pop_element();
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
        if (AsComponent) {
          $$renderer2.push("<!--[-->");
          AsComponent($$renderer2, spread_props([sharedProps()]));
          $$renderer2.push("<!--]-->");
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push("<!--]-->");
        }
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref: externalRef });
    },
    Motion
  );
}
Motion.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const componentMaxCache = /* @__PURE__ */ new Map();
const componentMiniCache = /* @__PURE__ */ new Map();
function createMotionComponent(component, options = {}) {
  const isString = typeof component === "string";
  isString ? component : component.name || "";
  const componentCache = options.features?.length > 0 ? componentMaxCache : componentMiniCache;
  if (isString && componentCache?.has(component)) {
    return componentCache.get(component);
  }
  const motionComponent = (anchor, props) => {
    const getAs = () => props.as || component || "div";
    return Motion(anchor, {
      features: options.features,
      get forwardMotionProps() {
        return props.forwardMotionProps || options.forwardMotionProps;
      },
      get as() {
        return getAs();
      },
      get props() {
        return withProp(props, "as", getAs());
      },
      get ref() {
        return props.ref;
      },
      set ref(value) {
        props.ref = value;
      }
    });
  };
  if (isString) {
    componentCache?.set(component, motionComponent);
  }
  return motionComponent;
}
function createMotionComponentWithFeatures(features = []) {
  return new Proxy({}, {
    get(_target, key) {
      if (key === "create") {
        return (component, options) => createMotionComponent(component, {
          ...options,
          features
        });
      }
      return createMotionComponent(key, {
        features
      });
    }
  });
}
const motion = createMotionComponentWithFeatures(domMax);
const LayoutMotionScopeContext = new Context2("LayoutMotionScope");
motion.create("div");
function is_date(obj) {
  return Object.prototype.toString.call(obj) === "[object Date]";
}
function linear(t) {
  return t;
}
function get_interpolator(a, b) {
  if (a === b || a !== a) return () => a;
  const type = typeof a;
  if (type !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    throw new Error("Cannot interpolate values of different type");
  }
  if (Array.isArray(a)) {
    const arr = (
      /** @type {Array<any>} */
      b.map((bi, i) => {
        return get_interpolator(
          /** @type {Array<any>} */
          a[i],
          bi
        );
      })
    );
    return (t) => arr.map((fn) => fn(t));
  }
  if (type === "object") {
    if (!a || !b) {
      throw new Error("Object cannot be null");
    }
    if (is_date(a) && is_date(b)) {
      const an = a.getTime();
      const bn = b.getTime();
      const delta = bn - an;
      return (t) => new Date(an + t * delta);
    }
    const keys = Object.keys(b);
    const interpolators = {};
    keys.forEach((key) => {
      interpolators[key] = get_interpolator(a[key], b[key]);
    });
    return (t) => {
      const result = {};
      keys.forEach((key) => {
        result[key] = interpolators[key](t);
      });
      return result;
    };
  }
  if (type === "number") {
    const delta = (
      /** @type {number} */
      b - /** @type {number} */
      a
    );
    return (t) => a + t * delta;
  }
  return () => b;
}
function tweened(value, defaults = {}) {
  const store2 = writable(value);
  let task;
  let target_value = value;
  function set(new_value, opts) {
    target_value = new_value;
    if (value == null) {
      store2.set(value = new_value);
      return Promise.resolve();
    }
    let previous_task = task;
    let started = false;
    let {
      delay: delay2 = 0,
      duration = 400,
      easing = linear,
      interpolate = get_interpolator
    } = { ...defaults, ...opts };
    if (duration === 0) {
      if (previous_task) {
        previous_task.abort();
        previous_task = null;
      }
      store2.set(value = target_value);
      return Promise.resolve();
    }
    const start = raf.now() + delay2;
    let fn;
    task = loop((now2) => {
      if (now2 < start) return true;
      if (!started) {
        fn = interpolate(
          /** @type {any} */
          value,
          new_value
        );
        if (typeof duration === "function")
          duration = duration(
            /** @type {any} */
            value,
            new_value
          );
        started = true;
      }
      if (previous_task) {
        previous_task.abort();
        previous_task = null;
      }
      const elapsed = now2 - start;
      if (elapsed > /** @type {number} */
      duration) {
        store2.set(value = new_value);
        return false;
      }
      store2.set(value = fn(easing(elapsed / duration)));
      return true;
    });
    return task.promise;
  }
  return {
    set,
    update: (fn, opts) => set(fn(
      /** @type {any} */
      target_value,
      /** @type {any} */
      value
    ), opts),
    subscribe: store2.subscribe
  };
}
const prefersReducedMotion = /* @__PURE__ */ new MediaQuery(
  "(prefers-reduced-motion: reduce)"
);
function useReducedMotion() {
  return prefersReducedMotion;
}
const EASE_OUT = [0.16, 1, 0.3, 1];
function cn(...inputs) {
  return twMerge(clsx$1(inputs));
}
const PANEL_SPRING = { type: "spring", stiffness: 560, damping: 40, mass: 0.5 };
Markdown[FILENAME] = "src/desktop-renderer/app/Markdown.svelte";
function Markdown($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { text } = $$props;
      const html$1 = derived(() => DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true })));
      $$renderer2.push(`<div class="md">`);
      push_element($$renderer2, "div", 13, 0);
      $$renderer2.push(`${html(html$1())}</div>`);
      pop_element();
    },
    Markdown
  );
}
Markdown.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
CompactionDialog[FILENAME] = "src/desktop-renderer/app/CompactionDialog.svelte";
function CompactionDialog($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { item = null, threadId, onRetry } = $$props;
      const open = derived(() => !!item);
      const reduce = useReducedMotion();
      function close() {
        item = null;
      }
      if (
        // Listen for Escape at the window level so it works even before the dialog
        // receives focus. Active only while the dialog is open.
        item
      ) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div${attr("aria-hidden", !open())} data-testid="compaction-dialog-overlay"${attr_class(clsx(cn("fixed inset-0 z-[100]", open() ? "pointer-events-auto" : "pointer-events-none")))}>`);
        push_element($$renderer2, "div", 53, 2);
        if (motion.div) {
          $$renderer2.push("<!--[-->");
          motion.div($$renderer2, {
            initial: false,
            animate: { opacity: open() ? 1 : 0 },
            transition: { duration: open() ? 0.18 : 0.12, ease: EASE_OUT },
            onclick: close,
            class: cn("absolute inset-0 bg-bg/40 [backdrop-filter:blur(12px)_saturate(140%)] [-webkit-backdrop-filter:blur(12px)_saturate(140%)]", open() ? "pointer-events-auto" : "pointer-events-none")
          });
          $$renderer2.push("<!--]-->");
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push("<!--]-->");
        }
        $$renderer2.push(` <div class="pointer-events-none absolute inset-0 flex items-center justify-center p-4" style="padding-left: var(--content-left, 0px)">`);
        push_element($$renderer2, "div", 70, 4);
        if (motion.div) {
          $$renderer2.push("<!--[-->");
          motion.div($$renderer2, {
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "Compaction summary",
            tabindex: -1,
            initial: { opacity: 0, y: -8, scale: 0.97 },
            animate: {
              opacity: open() ? 1 : 0,
              y: open() || reduce.current ? 0 : -8,
              scale: open() || reduce.current ? 1 : 0.97
            },
            transition: reduce.current ? { duration: 0.1 } : open() ? PANEL_SPRING : { duration: 0.12, ease: EASE_OUT },
            class: cn("pointer-events-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl will-change-transform"),
            children: prevent_snippet_stringification(($$renderer3) => {
              $$renderer3.push(`<div class="flex items-start gap-3 border-b border-border px-5 py-4">`);
              push_element($$renderer3, "div", 90, 8);
              $$renderer3.push(`<span class="mt-0.5 shrink-0 text-faint text-lg leading-none">`);
              push_element($$renderer3, "span", 91, 10);
              $$renderer3.push(`⌘</span>`);
              pop_element();
              $$renderer3.push(` <div class="min-w-0 flex-1">`);
              push_element($$renderer3, "div", 92, 10);
              $$renderer3.push(`<h2 class="text-sm font-semibold text-fg">`);
              push_element($$renderer3, "h2", 93, 12);
              $$renderer3.push(`${escape_html(item.aborted ? "Compaction aborted" : item.error ? "Compaction failed" : item.reason === "manual" ? "Context compacted" : "Context compacted automatically")}</h2>`);
              pop_element();
              $$renderer3.push(` `);
              if (item.tokensBefore && item.tokensAfter) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<p class="mt-1 text-xs text-faint">`);
                push_element($$renderer3, "p", 103, 14);
                $$renderer3.push(`${escape_html(item.tokensBefore)} → ${escape_html(item.tokensAfter)} tokens</p>`);
                pop_element();
              } else if (item.tokensBefore) {
                $$renderer3.push("<!--[1-->");
                $$renderer3.push(`<p class="mt-1 text-xs text-faint">`);
                push_element($$renderer3, "p", 107, 14);
                $$renderer3.push(`${escape_html(item.tokensBefore)} tokens summarised</p>`);
                pop_element();
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]--></div>`);
              pop_element();
              $$renderer3.push(` <button type="button" class="shrink-0 rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Close">`);
              push_element($$renderer3, "button", 110, 10);
              $$renderer3.push(`✕</button>`);
              pop_element();
              $$renderer3.push(`</div>`);
              pop_element();
              $$renderer3.push(` <div class="px-5 py-4">`);
              push_element($$renderer3, "div", 120, 8);
              if (item.error) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<div class="rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-2 text-xs text-danger">`);
                push_element($$renderer3, "div", 122, 12);
                $$renderer3.push(`<p>`);
                push_element($$renderer3, "p", 123, 14);
                $$renderer3.push(`${escape_html(item.error)}</p>`);
                pop_element();
                $$renderer3.push(`</div>`);
                pop_element();
              } else if (item.summary) {
                $$renderer3.push("<!--[1-->");
                $$renderer3.push(`<div class="max-h-[80vh] overflow-y-auto text-xs leading-relaxed text-fg-soft">`);
                push_element($$renderer3, "div", 126, 12);
                Markdown($$renderer3, { text: item.summary });
                $$renderer3.push(`<!----></div>`);
                pop_element();
              } else {
                $$renderer3.push("<!--[-1-->");
                $$renderer3.push(`<p class="text-sm text-faint">`);
                push_element($$renderer3, "p", 130, 12);
                $$renderer3.push(`No summary available.</p>`);
                pop_element();
              }
              $$renderer3.push(`<!--]--> `);
              if (item.error && onRetry) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<button type="button" class="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border-strong/40 bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg">`);
                push_element($$renderer3, "button", 134, 12);
                Rotate_cw($$renderer3, { size: 12 });
                $$renderer3.push(`<!----> <span>`);
                push_element($$renderer3, "span", 140, 14);
                $$renderer3.push(`Retry compaction</span>`);
                pop_element();
                $$renderer3.push(`</button>`);
                pop_element();
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]--></div>`);
              pop_element();
            }),
            $$slots: { default: true }
          });
          $$renderer2.push("<!--]-->");
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push("<!--]-->");
        }
        $$renderer2.push(`</div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { item });
    },
    CompactionDialog
  );
}
CompactionDialog.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const HINT_RE = /^The user has pinned these connections for this task\. Use them preferentially:\n((?:- [^\n]*(?:\n|$))+)\n*/;
const ITEM_RE = /^- (custom connection|composio toolkit) "([^"]+)"/gm;
function parseConnectionsHint(text) {
  const m = HINT_RE.exec(text);
  if (!m) return null;
  const bullets = m[1] ?? "";
  const connections = [];
  for (const item of bullets.matchAll(ITEM_RE)) {
    connections.push({
      kind: item[1] === "custom connection" ? "custom" : "composio",
      name: item[2] ?? ""
    });
  }
  if (connections.length === 0) return null;
  return { connections, body: text.slice(m[0].length) };
}
const S_HINT_RE = /^The user has pinned these Bitwarden Secrets Manager secrets for this task\.\nTo use one, call the bws_get_secret tool with its id; the value is returned as a tool result and is NOT in this prompt\.\nDo not echo the secret value back to the user unless they explicitly ask\.\n((?:- [^\n]*(?:\n|$))+)\n*/;
const S_ITEM_RE = /^- secret "([^"]+)" \(id: ([^)]+)\)/gm;
function parseSecretsHint(text) {
  const m = S_HINT_RE.exec(text);
  if (!m) return null;
  const bullets = m[1] ?? "";
  const secrets = [];
  for (const item of bullets.matchAll(S_ITEM_RE)) {
    secrets.push({ name: item[1] ?? "", id: item[2] ?? "" });
  }
  if (secrets.length === 0) return null;
  return { secrets, body: text.slice(m[0].length) };
}
const SUPPORTED_COMPOSER_IMAGE_TYPES = [
  { extension: "png", mimeType: "image/png" },
  { extension: "jpg", mimeType: "image/jpeg" },
  { extension: "jpeg", mimeType: "image/jpeg" },
  { extension: "gif", mimeType: "image/gif" },
  { extension: "webp", mimeType: "image/webp" }
];
new Set(
  SUPPORTED_COMPOSER_IMAGE_TYPES.map((t) => t.mimeType)
);
new Map(
  SUPPORTED_COMPOSER_IMAGE_TYPES.map((t) => [t.extension, t.mimeType])
);
Message_square_text[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/message-square-text.svelte";
function Message_square_text($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
          }
        ],
        ["path", { "d": "M7 11h10" }],
        ["path", { "d": "M7 15h6" }],
        ["path", { "d": "M7 7h8" }]
      ];
      Icon($$renderer2, spread_props([{ name: "message-square-text" }, props, { iconNode }]));
    },
    Message_square_text
  );
}
Message_square_text.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Sliders_horizontal[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/sliders-horizontal.svelte";
function Sliders_horizontal($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M10 5H3" }],
        ["path", { "d": "M12 19H3" }],
        ["path", { "d": "M14 3v4" }],
        ["path", { "d": "M16 17v4" }],
        ["path", { "d": "M21 12h-9" }],
        ["path", { "d": "M21 19h-5" }],
        ["path", { "d": "M21 5h-7" }],
        ["path", { "d": "M8 10v4" }],
        ["path", { "d": "M8 12H3" }]
      ];
      Icon($$renderer2, spread_props([{ name: "sliders-horizontal" }, props, { iconNode }]));
    },
    Sliders_horizontal
  );
}
Sliders_horizontal.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
X[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/x.svelte";
function X($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M18 6 6 18" }],
        ["path", { "d": "m6 6 12 12" }]
      ];
      Icon($$renderer2, spread_props([{ name: "x" }, props, { iconNode }]));
    },
    X
  );
}
X.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
class SessionMetaStore {
  byThread = new SvelteMap();
  requested = /* @__PURE__ */ new Set();
  /** Available models are session-independent in practice; cache once. */
  models = [];
  /** All auth-configured models (unscoped); cache once. */
  allModels = [];
  init() {
    api.on("event:sessionMeta", (meta) => this.byThread.set(meta.threadId, meta));
    api.on("event:scopeChanged", () => this.refreshModels());
  }
  for(threadId) {
    return this.byThread.get(threadId) ?? null;
  }
  /** Lazily fetch meta once per thread; later updates flow via events. */
  ensure(threadId) {
    if (this.requested.has(threadId)) return;
    this.requested.add(threadId);
    void api.invoke("threads:getMeta", threadId).then((meta) => this.byThread.set(meta.threadId, meta)).catch(() => this.requested.delete(threadId));
  }
  async loadModels(threadId) {
    if (this.models.length > 0) return;
    this.models = await api.invoke("threads:listModels", threadId);
  }
  async loadAllModels(threadId) {
    if (this.allModels.length > 0) return;
    this.allModels = await api.invoke("threads:listAllModels", threadId);
  }
  /** Force a re-fetch of the cached scoped list (after a scope change). */
  async refreshModels() {
    const threadId = this.byThread.keys().next().value ?? this.requested.values().next().value;
    if (!threadId) return;
    this.models = await api.invoke("threads:listModels", threadId);
  }
  /** Toggle a model in the global scope; updates the cached scoped list. */
  async setModelScoped(threadId, provider, id2, scoped) {
    this.models = await api.invoke("threads:setModelScoped", threadId, provider, id2, scoped);
  }
  set(meta) {
    this.byThread.set(meta.threadId, meta);
  }
}
const sessionMetas = new SessionMetaStore();
class CavemanStore {
  enabled = false;
  level = "full";
  loaded = false;
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    const state = await api.invoke("app:getCavemanState");
    this.enabled = state.enabled;
    this.level = state.level;
  }
  async toggle(threadId) {
    const next = !this.enabled;
    this.enabled = next;
    const state = await api.invoke("app:setCavemanEnabled", next);
    this.enabled = state.enabled;
    this.level = state.level;
    await api.invoke("threads:runCommand", threadId, next ? `/caveman ${state.level}` : "/caveman off");
  }
  /** Persist the on-level the composer toggle maps to. */
  async setLevel(level) {
    const state = await api.invoke("app:setCavemanLevel", level);
    this.enabled = state.enabled;
    this.level = state.level;
  }
}
const caveman = new CavemanStore();
function createIpcStore(opts) {
  let value = opts.default;
  let loaded = false;
  const load2 = async (force = false) => {
    if (!force && loaded) return;
    loaded = true;
    value = await api.invoke(opts.loadChannel);
  };
  const set = async (...args) => {
    value = await api.invoke(opts.setChannel, ...args);
  };
  return {
    get state() {
      return value;
    },
    load: load2,
    set
  };
}
const store$1 = createIpcStore({
  loadChannel: "app:getAutoCompact",
  setChannel: "app:setAutoCompact",
  default: { percent: 80, tokens: null }
});
const autoCompact = {
  get percent() {
    return store$1.state.percent;
  },
  get tokens() {
    return store$1.state.tokens;
  },
  load: (force) => store$1.load(force),
  set: (settings) => store$1.set(settings)
};
class SideChatStore {
  open = false;
  threadId = null;
  /** The conversation currently shown in the panel. */
  active = null;
  /** Live assistant text while a turn streams in. */
  streaming = false;
  buffer = "";
  error = null;
  /** History list for the current thread (newest first). */
  history = [];
  /** Composer draft, held here so the floating BTW cap can also submit it. */
  draft = "";
  started = false;
  init() {
    if (this.started) return;
    this.started = true;
    api.on("event:sideDelta", ({ convId, text }) => {
      if (this.active?.id === convId) this.buffer += text;
    });
    api.on("event:sideDone", ({ convId, error }) => {
      if (this.active?.id !== convId) return;
      this.streaming = false;
      if (error) {
        this.error = error;
        this.buffer = "";
        return;
      }
      if (this.buffer) {
        const msg = { role: "assistant", text: this.buffer };
        this.active = { ...this.active, messages: [...this.active.messages, msg] };
      }
      this.buffer = "";
      void this.refreshHistory();
    });
  }
  /** Open the panel for a thread, starting a fresh side conversation. */
  async openPanel(threadId, seedQuestion) {
    this.threadId = threadId;
    this.open = true;
    await this.startNew();
    await this.refreshHistory();
    if (seedQuestion) await this.ask(seedQuestion);
  }
  close() {
    this.open = false;
  }
  async startNew(modelOverride) {
    if (!this.threadId) return;
    this.error = null;
    this.buffer = "";
    this.streaming = false;
    this.active = await api.invoke("side:start", this.threadId, modelOverride ?? null);
  }
  /** Send the current draft (used by the floating BTW cap and Enter key). */
  async submitDraft() {
    const q = this.draft.trim();
    if (!q || this.streaming) return;
    this.draft = "";
    await this.ask(q);
  }
  async ask(question) {
    const q = question.trim();
    if (!q || this.streaming) return;
    if (!this.active) await this.startNew();
    if (!this.active) return;
    this.error = null;
    this.buffer = "";
    this.streaming = true;
    this.active = {
      ...this.active,
      messages: [...this.active.messages, { role: "user", text: q }]
    };
    await api.invoke("side:ask", this.active.id, q);
  }
  /** Reopen a prior side conversation to continue it. */
  async openConv(convId) {
    const conv = await api.invoke("side:get", convId);
    if (conv) {
      this.active = conv;
      this.error = null;
      this.buffer = "";
      this.streaming = false;
    }
  }
  async deleteConv(convId) {
    await api.invoke("side:delete", convId);
    if (this.active?.id === convId) this.active = null;
    await this.refreshHistory();
  }
  async refreshHistory() {
    if (!this.threadId) return;
    this.history = await api.invoke("side:list", this.threadId);
  }
}
const sideChat = new SideChatStore();
const starred = arrayPref("peachpi:commandStarred");
class CommandPrefsStore {
  starredKeys = [];
  initialized = false;
  /** Load persisted prefs and start cross-window sync. Idempotent. */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.starredKeys = starred.read();
    starred.sync(() => {
      this.starredKeys = starred.read();
    });
  }
  isStarred(key) {
    return this.starredKeys.includes(key);
  }
  toggle(key) {
    this.starredKeys = this.starredKeys.includes(key) ? this.starredKeys.filter((k) => k !== key) : [...this.starredKeys, key];
    starred.write(this.starredKeys);
  }
}
const commandPrefs = new CommandPrefsStore();
ReasoningDial[FILENAME] = "src/desktop-renderer/app/composer/ReasoningDial.svelte";
function ReasoningDial($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { level, available, onCycle } = $$props;
      const LABELS = {
        off: "OFF",
        minimal: "MIN",
        low: "LOW",
        medium: "MED",
        high: "HIGH",
        xhigh: "MAX"
      };
      const ORDER = ["off", "minimal", "low", "medium", "high", "xhigh"];
      const RADIUS = 40;
      function clockAngle(i, count) {
        if (i === 0) return 180;
        if (count <= 2) return 0;
        const start = 225;
        const end = 405;
        return start + (i - 1) * (end - start) / Math.max(1, count - 2);
      }
      const levels = derived(() => {
        const set = new Set(available.length ? available : ORDER);
        const ordered = ORDER.filter((l) => set.has(l));
        const list = ordered.length ? ordered : ["off"];
        return list.map((value, i) => {
          const a = clockAngle(i, list.length);
          const rad = a * Math.PI / 180;
          return {
            value,
            label: LABELS[value],
            clock: a,
            x: 50 + Math.cos(rad) * RADIUS,
            y: 50 + Math.sin(rad) * RADIUS
          };
        });
      });
      const active = derived(() => levels().find((l) => l.value === level) ?? levels()[0]);
      const angle = derived(() => active() ? active().clock - 270 : -125);
      $$renderer2.push(`<button class="reasoning-dial control-anchor" data-label="Reasoning"${attr_style(`--dial-angle: ${stringify(angle())}deg`)} title="Reasoning level (click to cycle)"${attr("aria-label", `Reasoning ${level}`)} data-testid="thinking-selector">`);
      push_element($$renderer2, "button", 56, 0);
      $$renderer2.push(`<span class="reasoning-dial__face" aria-hidden="true">`);
      push_element($$renderer2, "span", 65, 2);
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(levels());
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let entry = each_array[$$index];
        $$renderer2.push(`<span${attr_class(`reasoning-dial__setting ${entry.x >= 50 ? "reasoning-dial__setting--right" : ""} ${entry.value === level ? "reasoning-dial__setting--active" : ""}`)}${attr_style(`--sx: ${stringify(entry.x)}%; --sy: ${stringify(entry.y)}%`)}>`);
        push_element($$renderer2, "span", 67, 6);
        $$renderer2.push(`<span>`);
        push_element($$renderer2, "span", 73, 8);
        $$renderer2.push(`${escape_html(entry.label)}</span>`);
        pop_element();
        $$renderer2.push(` <span class="reasoning-dial__light">`);
        push_element($$renderer2, "span", 74, 8);
        $$renderer2.push(`</span>`);
        pop_element();
        $$renderer2.push(`</span>`);
        pop_element();
      }
      $$renderer2.push(`<!--]--> <span class="reasoning-dial__knob">`);
      push_element($$renderer2, "span", 77, 4);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(`</button>`);
      pop_element();
    },
    ReasoningDial
  );
}
ReasoningDial.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
ModelSelector[FILENAME] = "src/desktop-renderer/app/composer/ModelSelector.svelte";
function ModelSelector($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        model,
        models,
        allModels = [],
        onPick,
        onRequestModels,
        onRequestAllModels,
        onToggleScoped
      } = $$props;
      const keyOf = (provider, id2) => `${provider}:${id2}`;
      function shortLabel(label) {
        return label.replace(/^claude\s+/i, "Claude ").replace(/^gpt-?5/i, "GPT-5").replace(/\s+/g, " ").trim();
      }
      let open = false;
      let filter = "";
      let visualKey = void 0;
      let showHidden = false;
      let viewAll = false;
      const scopedKeys = derived(() => new Set(models.map((m) => keyOf(m.provider, m.id))));
      const baseModels = derived(() => viewAll ? allModels : models);
      const pinnedKeys = derived(() => modelPrefs.pinnedKeys);
      const pinnedOptions = derived(() => {
        const byKey = new Map(models.map((m) => [keyOf(m.provider, m.id), m]));
        const picked = [];
        for (const k of pinnedKeys()) {
          const m = byKey.get(k);
          if (m) picked.push(m);
        }
        for (const m of models) {
          if (picked.length >= 3) break;
          if (!picked.some((p) => p.provider === m.provider && p.id === m.id)) picked.push(m);
        }
        return picked.slice(0, 3);
      });
      const activeKey = derived(() => visualKey ?? (model ? keyOf(model.provider, model.id) : void 0));
      const overflowOption = derived(() => {
        if (!activeKey() || pinnedOptions().some((m) => keyOf(m.provider, m.id) === activeKey())) return void 0;
        return models.find((m) => keyOf(m.provider, m.id) === activeKey());
      });
      const sliderOptions = derived(() => overflowOption() ? [...pinnedOptions(), overflowOption()] : pinnedOptions());
      const activeSliderIndex = derived(() => sliderOptions().findIndex((m) => keyOf(m.provider, m.id) === activeKey()));
      const sliderPosition = derived(() => activeSliderIndex() >= 0 ? activeSliderIndex() : 1);
      const visibleModels = derived(() => modelPrefs.hiddenKeys.length === 0 ? baseModels() : baseModels().filter((m) => !modelPrefs.hiddenKeys.includes(keyOf(m.provider, m.id))));
      const filteredModels = derived(() => {
        return visibleModels();
      });
      const grouped = derived(() => {
        const groups = /* @__PURE__ */ new Map();
        for (const m of filteredModels()) {
          const arr = groups.get(m.provider);
          if (arr) arr.push(m);
          else groups.set(m.provider, [m]);
        }
        return [...groups.entries()].map(([provider, items]) => ({ provider, items }));
      });
      const hiddenCount = derived(() => baseModels().length - visibleModels().length);
      function toggleMenu() {
        open = !open;
        if (open) {
          viewAll = false;
          onRequestModels();
          onRequestAllModels?.();
        }
      }
      function selectModel(m) {
        visualKey = keyOf(m.provider, m.id);
        open = false;
        requestAnimationFrame(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        if (m.provider === model?.provider && m.id === model?.id) return;
        onPick(m.provider, m.id);
      }
      function selectSlot(index) {
        const option = pinnedOptions()[index];
        if (option) selectModel(option);
      }
      function openMenu() {
        if (!open) toggleMenu();
      }
      $$renderer2.push(`<span class="model-selector">`);
      push_element($$renderer2, "span", 151, 0);
      $$renderer2.push(`<span class="model-selector__anchor" data-section-label="Model">`);
      push_element($$renderer2, "span", 152, 2);
      $$renderer2.push(`<span class="composer__key-mount">`);
      push_element($$renderer2, "span", 153, 4);
      $$renderer2.push(`<span class="model-selector__badge model-selector__badge--slider" data-physical-key="model"${attr("aria-expanded", open)}${attr_style(`--model-slider-position: ${stringify(sliderPosition())}`)}>`);
      push_element($$renderer2, "span", 154, 6);
      $$renderer2.push(`<span class="model-selector__slider" aria-hidden="true">`);
      push_element($$renderer2, "span", 160, 8);
      $$renderer2.push(`<span class="model-selector__slider-ticks">`);
      push_element($$renderer2, "span", 161, 10);
      $$renderer2.push(`<span class="model-selector__slider-tick model-selector__slider-tick--0">`);
      push_element($$renderer2, "span", 162, 12);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="model-selector__slider-tick model-selector__slider-tick--1">`);
      push_element($$renderer2, "span", 163, 12);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="model-selector__slider-tick model-selector__slider-tick--2">`);
      push_element($$renderer2, "span", 164, 12);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="model-selector__slider-tick model-selector__slider-tick--3">`);
      push_element($$renderer2, "span", 165, 12);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="model-selector__slider-track">`);
      push_element($$renderer2, "span", 167, 10);
      $$renderer2.push(`<span class="model-selector__slider-rail">`);
      push_element($$renderer2, "span", 168, 12);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="model-selector__slider-glow">`);
      push_element($$renderer2, "span", 169, 12);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="model-selector__slider-thumb">`);
      push_element($$renderer2, "span", 171, 10);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <!--[-->`);
      const each_array = ensure_array_like(sliderOptions());
      for (let index = 0, $$length = each_array.length; index < $$length; index++) {
        let option = each_array[index];
        const isActive = keyOf(option.provider, option.id) === activeKey();
        $$renderer2.push(`<button${attr_class(`model-selector__slider-label model-selector__slider-label--slot model-selector__slider-label--slot-${stringify(index)}${isActive ? " model-selector__slider-label--selected" : ""}`, "svelte-16nuqib")} type="button"${attr("title", `Switch to ${option.name}`)}${attr("data-testid", index === 0 ? "model-selector" : void 0)}>`);
        push_element($$renderer2, "button", 176, 10);
        $$renderer2.push(`${escape_html(shortLabel(option.name))}</button>`);
        pop_element();
      }
      $$renderer2.push(`<!--]--> `);
      if (sliderOptions().length < 4) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<button class="model-selector__slider-label model-selector__slider-label--slot model-selector__slider-label--slot-3 model-selector__slider-label--menu svelte-16nuqib" type="button" aria-label="Open full model menu"${attr("aria-expanded", open)} data-testid="model-menu-toggle">`);
        push_element($$renderer2, "button", 193, 10);
        $$renderer2.push(`…</button>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></span>`);
      pop_element();
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` `);
      if (open) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="model-selector__dropdown" data-testid="model-menu">`);
        push_element($$renderer2, "div", 206, 6);
        $$renderer2.push(`<div class="model-selector__filter">`);
        push_element($$renderer2, "div", 207, 8);
        $$renderer2.push(`<input class="model-selector__filter-input" placeholder="Filter models..."${attr("value", filter)} autofocus=""/>`);
        push_element($$renderer2, "input", 209, 10);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
        $$renderer2.push(` `);
        if (onToggleScoped) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="model-selector__view-tabs svelte-16nuqib" role="tablist">`);
          push_element($$renderer2, "div", 217, 10);
          $$renderer2.push(`<button${attr_class(`model-selector__view-tab${viewAll ? "" : " is-active"}`, "svelte-16nuqib")} type="button" role="tab"${attr("aria-selected", !viewAll)}>`);
          push_element($$renderer2, "button", 218, 12);
          $$renderer2.push(`Scoped</button>`);
          pop_element();
          $$renderer2.push(` <button${attr_class(`model-selector__view-tab${viewAll ? " is-active" : ""}`, "svelte-16nuqib")} type="button" role="tab"${attr("aria-selected", viewAll)}>`);
          push_element($$renderer2, "button", 225, 12);
          $$renderer2.push(`All</button>`);
          pop_element();
          $$renderer2.push(` <span class="model-selector__view-hint svelte-16nuqib">`);
          push_element($$renderer2, "span", 232, 12);
          $$renderer2.push(`Tab to switch</span>`);
          pop_element();
          $$renderer2.push(`</div>`);
          pop_element();
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        const each_array_1 = ensure_array_like(grouped());
        if (each_array_1.length !== 0) {
          $$renderer2.push("<!--[-->");
          for (let $$index_3 = 0, $$length = each_array_1.length; $$index_3 < $$length; $$index_3++) {
            let group = each_array_1[$$index_3];
            $$renderer2.push(`<div>`);
            push_element($$renderer2, "div", 236, 10);
            $$renderer2.push(`<div class="model-selector__group-title">`);
            push_element($$renderer2, "div", 237, 12);
            $$renderer2.push(`${escape_html(group.provider)}</div>`);
            pop_element();
            $$renderer2.push(` <!--[-->`);
            const each_array_2 = ensure_array_like(group.items);
            for (let $$index_2 = 0, $$length2 = each_array_2.length; $$index_2 < $$length2; $$index_2++) {
              let option = each_array_2[$$index_2];
              const isActive = option.provider === model?.provider && option.id === model?.id;
              $$renderer2.push(`<div${attr_class(`model-selector__item${isActive ? " model-selector__item--active" : ""}`, "svelte-16nuqib")} role="button" tabindex="0">`);
              push_element($$renderer2, "div", 240, 14);
              $$renderer2.push(`<span class="model-selector__item-label">`);
              push_element($$renderer2, "span", 247, 16);
              $$renderer2.push(`${escape_html(option.name)}</span>`);
              pop_element();
              $$renderer2.push(` `);
              if (isActive) {
                $$renderer2.push("<!--[0-->");
                $$renderer2.push(`<span class="model-selector__item-meta">`);
                push_element($$renderer2, "span", 248, 30);
                $$renderer2.push(`active</span>`);
                pop_element();
              } else {
                $$renderer2.push("<!--[-1-->");
              }
              $$renderer2.push(`<!--]--> <span class="model-selector__item-actions" role="group">`);
              push_element($$renderer2, "span", 250, 16);
              $$renderer2.push(`<!--[-->`);
              const each_array_3 = ensure_array_like([0, 1, 2]);
              for (let $$index_1 = 0, $$length3 = each_array_3.length; $$index_1 < $$length3; $$index_1++) {
                let slot = each_array_3[$$index_1];
                $$renderer2.push(`<button class="model-selector__item-slot" type="button" tabindex="-1"${attr("title", `Keep in position ${slot + 1}`)}>`);
                push_element($$renderer2, "button", 256, 20);
                $$renderer2.push(`${escape_html(slot + 1)}</button>`);
                pop_element();
              }
              $$renderer2.push(`<!--]--> `);
              if (onToggleScoped) {
                $$renderer2.push("<!--[0-->");
                const isScoped = scopedKeys().has(keyOf(option.provider, option.id));
                $$renderer2.push(`<button${attr_class(`model-selector__item-scope${isScoped ? " is-scoped" : ""}`, "svelte-16nuqib")} type="button" tabindex="-1"${attr("title", isScoped ? "Remove from scoped models" : "Add to scoped models")}>`);
                push_element($$renderer2, "button", 266, 20);
                $$renderer2.push(`${escape_html(isScoped ? "scoped ✓" : "+ scope")}</button>`);
                pop_element();
              } else {
                $$renderer2.push("<!--[-1-->");
              }
              $$renderer2.push(`<!--]--> <button class="model-selector__item-hide" type="button" tabindex="-1" title="Hide from model menu">`);
              push_element($$renderer2, "button", 274, 18);
              $$renderer2.push(`hide</button>`);
              pop_element();
              $$renderer2.push(`</span>`);
              pop_element();
              $$renderer2.push(`</div>`);
              pop_element();
            }
            $$renderer2.push(`<!--]--></div>`);
            pop_element();
          }
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="model-selector__group-title">`);
          push_element($$renderer2, "div", 286, 10);
          $$renderer2.push(`No models</div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--> `);
        if (hiddenCount() > 0 || showHidden) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<button class="model-selector__show-hidden svelte-16nuqib" type="button">`);
          push_element($$renderer2, "button", 289, 10);
          $$renderer2.push(`${escape_html(`Show hidden (${hiddenCount()})`)}</button>`);
          pop_element();
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></span>`);
      pop_element();
      $$renderer2.push(`</span>`);
      pop_element();
      bind_props($$props, { selectSlot, openMenu });
    },
    ModelSelector
  );
}
ModelSelector.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const store = createIpcStore({
  loadChannel: "app:listScopedModels",
  setChannel: "app:setModelScoped",
  default: []
});
const scopedModels = {
  get models() {
    return store.state;
  },
  /** Start listening for cross-window scope changes. Idempotent. */
  init() {
    api.on("event:scopeChanged", () => {
      void this.load(true);
    });
  },
  load: (force = false) => store.load(force),
  toggle: (provider, id2, scoped) => store.set(provider, id2, scoped)
};
Model_scope_select[FILENAME] = "src/desktop-renderer/components/ui/model-scope-select/model-scope-select.svelte";
function Model_scope_select($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { open = false, class: className, floating = false } = $$props;
      let query = "";
      let expanded = /* @__PURE__ */ new Set();
      const q = derived(() => query.trim().toLowerCase());
      const searching = derived(() => q().length > 0);
      const total = derived(() => scopedModels.models.length);
      const scopedCount = derived(() => scopedModels.models.filter((m) => m.scoped).length);
      const scopedAll = derived(() => total() > 0 && scopedCount() === total());
      const filtered = derived(() => {
        if (!q()) return scopedModels.models;
        return scopedModels.models.filter((m) => m.name.toLowerCase().includes(q()) || m.provider.toLowerCase().includes(q()));
      });
      const grouped = derived(() => {
        const groups = /* @__PURE__ */ new Map();
        for (const m of filtered()) {
          const arr = groups.get(m.provider);
          if (arr) arr.push(m);
          else groups.set(m.provider, [m]);
        }
        return [...groups.entries()].map(([provider, items]) => ({ provider, items }));
      });
      function isExpanded(provider) {
        return searching() || expanded.has(provider);
      }
      async function openScopedModels() {
        await scopedModels.load();
        open = true;
      }
      function body($$renderer3) {
        validate_snippet_args($$renderer3);
        $$renderer3.push(`<div class="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1">`);
        push_element($$renderer3, "div", 97, 2);
        Search($$renderer3, { class: "size-3.5 shrink-0 text-faint" });
        $$renderer3.push(`<!----> <input type="search"${attr("value", query)} placeholder="Search models…" autofocus="" class="w-full bg-transparent text-xs text-fg outline-none placeholder:text-fainter" data-testid="scoped-models-search"/>`);
        push_element($$renderer3, "input", 100, 4);
        pop_element();
        $$renderer3.push(` `);
        if (floating) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<button type="button" class="shrink-0 text-faint hover:text-fg" aria-label="Close">`);
          push_element($$renderer3, "button", 110, 6);
          X($$renderer3, { class: "size-3.5" });
          $$renderer3.push(`<!----></button>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--></div>`);
        pop_element();
        $$renderer3.push(` <div class="flex items-center justify-between text-[11px] text-faint">`);
        push_element($$renderer3, "div", 119, 2);
        $$renderer3.push(`<span data-testid="scoped-models-count">`);
        push_element($$renderer3, "span", 120, 4);
        $$renderer3.push(`${escape_html(scopedCount())} of ${escape_html(total())} scoped`);
        if (scopedAll()) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`(all — empty scope)`);
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--></span>`);
        pop_element();
        $$renderer3.push(` <div class="flex gap-1">`);
        push_element($$renderer3, "div", 123, 4);
        $$renderer3.push(`<button type="button" class="rounded border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] text-fg hover:bg-surface-3 disabled:opacity-40"${attr("disabled", scopedAll(), true)} data-testid="scope-all">`);
        push_element($$renderer3, "button", 124, 6);
        $$renderer3.push(`All</button>`);
        pop_element();
        $$renderer3.push(` <button type="button" class="rounded border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] text-fg hover:bg-surface-3 disabled:opacity-40"${attr("disabled", scopedCount() === 0, true)} data-testid="scope-none">`);
        push_element($$renderer3, "button", 131, 6);
        $$renderer3.push(`None</button>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(` <div class="flex-1 min-h-0 overflow-y-auto">`);
        push_element($$renderer3, "div", 141, 2);
        if (total() === 0) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<p class="px-2 py-4 text-center text-xs text-faint" data-testid="scoped-models-empty">`);
          push_element($$renderer3, "p", 143, 6);
          $$renderer3.push(`No models available. Configure provider auth in pi first.</p>`);
          pop_element();
        } else if (grouped().length === 0) {
          $$renderer3.push("<!--[1-->");
          $$renderer3.push(`<p class="px-2 py-4 text-center text-xs text-faint">`);
          push_element($$renderer3, "p", 147, 6);
          $$renderer3.push(`No models match “${escape_html(query)}”.</p>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
          $$renderer3.push(`<!--[-->`);
          const each_array = ensure_array_like(grouped());
          for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
            let group = each_array[$$index_1];
            $$renderer3.push(`<div class="mb-0.5">`);
            push_element($$renderer3, "div", 150, 8);
            $$renderer3.push(`<button type="button" class="sticky top-0 z-10 flex w-full items-center gap-1.5 bg-surface px-2 py-1.5 text-left text-[11px] uppercase tracking-wide text-fainter hover:text-fg-soft"${attr("aria-expanded", isExpanded(group.provider))}${attr("data-testid", `scope-group-${group.provider}`)}>`);
            push_element($$renderer3, "button", 151, 10);
            Chevron_down($$renderer3, {
              class: cn("size-3 shrink-0 transition-transform", !isExpanded(group.provider) && "-rotate-90")
            });
            $$renderer3.push(`<!----> <span>`);
            push_element($$renderer3, "span", 159, 12);
            $$renderer3.push(`${escape_html(group.provider)}</span>`);
            pop_element();
            $$renderer3.push(` <span class="ml-auto normal-case tracking-normal text-fainter/70">`);
            push_element($$renderer3, "span", 160, 12);
            $$renderer3.push(`${escape_html(group.items.filter((m) => m.scoped).length)}/${escape_html(group.items.length)}</span>`);
            pop_element();
            $$renderer3.push(`</button>`);
            pop_element();
            $$renderer3.push(` `);
            if (isExpanded(group.provider)) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<!--[-->`);
              const each_array_1 = ensure_array_like(group.items);
              for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
                let m = each_array_1[$$index];
                $$renderer3.push(`<button type="button" class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 pl-6 text-left text-xs outline-none hover:bg-surface-2 data-[highlighted]:bg-surface-2"${attr("data-testid", `scope-toggle-${m.provider}-${m.id}`)}>`);
                push_element($$renderer3, "button", 166, 14);
                $$renderer3.push(`<span class="min-w-0 truncate text-fg"${attr("title", m.name)}>`);
                push_element($$renderer3, "span", 172, 16);
                $$renderer3.push(`${escape_html(m.name)}</span>`);
                pop_element();
                $$renderer3.push(` `);
                if (m.scoped) {
                  $$renderer3.push("<!--[0-->");
                  Check($$renderer3, { class: "size-3.5 shrink-0 text-emerald-500" });
                } else {
                  $$renderer3.push("<!--[-1-->");
                  $$renderer3.push(`<span class="size-3.5 shrink-0 rounded-sm border border-border-strong">`);
                  push_element($$renderer3, "span", 176, 18);
                  $$renderer3.push(`</span>`);
                  pop_element();
                }
                $$renderer3.push(`<!--]--></button>`);
                pop_element();
              }
              $$renderer3.push(`<!--]-->`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--></div>`);
            pop_element();
          }
          $$renderer3.push(`<!--]-->`);
        }
        $$renderer3.push(`<!--]--></div>`);
        pop_element();
      }
      let $$settled = true;
      let $$inner_renderer;
      function $$render_inner($$renderer3) {
        prevent_snippet_stringification(body);
        if (floating) {
          $$renderer3.push("<!--[0-->");
          if (open) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<div class="fixed inset-0 z-50">`);
            push_element($$renderer3, "div", 190, 4);
            $$renderer3.push(`</div>`);
            pop_element();
            $$renderer3.push(` <div data-testid="scoped-models-content" class="fixed top-1/2 z-50 flex h-[80vh] max-h-[80vh] w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-xl border border-border-strong bg-surface p-3 shadow-2xl" style="left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)">`);
            push_element($$renderer3, "div", 191, 4);
            body($$renderer3);
            $$renderer3.push(`<!----></div>`);
            pop_element();
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]-->`);
        } else {
          $$renderer3.push("<!--[-1-->");
          if (Popover) {
            $$renderer3.push("<!--[-->");
            Popover($$renderer3, {
              get open() {
                return open;
              },
              set open($$value) {
                open = $$value;
                $$settled = false;
              },
              children: prevent_snippet_stringification(($$renderer4) => {
                if (Popover_trigger) {
                  $$renderer4.push("<!--[-->");
                  Popover_trigger($$renderer4, {
                    "data-testid": "scoped-models-trigger",
                    class: cn("flex items-center justify-between gap-2 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none transition-colors hover:border-border-focus focus:border-border-focus data-[state=open]:border-border-focus", className),
                    children: prevent_snippet_stringification(($$renderer5) => {
                      $$renderer5.push(`<span class="truncate text-fg-soft">`);
                      push_element($$renderer5, "span", 208, 6);
                      if (total() === 0) {
                        $$renderer5.push("<!--[0-->");
                        $$renderer5.push(`No models`);
                      } else {
                        $$renderer5.push("<!--[-1-->");
                        $$renderer5.push(`${escape_html(scopedCount())} of ${escape_html(total())} scoped`);
                        if (scopedAll()) {
                          $$renderer5.push("<!--[0-->");
                          $$renderer5.push(`(all)`);
                        } else {
                          $$renderer5.push("<!--[-1-->");
                        }
                        $$renderer5.push(`<!--]-->`);
                      }
                      $$renderer5.push(`<!--]--></span>`);
                      pop_element();
                      $$renderer5.push(` `);
                      Chevron_down($$renderer5, { class: "size-4 shrink-0 text-faint" });
                      $$renderer5.push(`<!---->`);
                    }),
                    $$slots: { default: true }
                  });
                  $$renderer4.push("<!--]-->");
                } else {
                  $$renderer4.push("<!--[!-->");
                  $$renderer4.push("<!--]-->");
                }
                $$renderer4.push(` `);
                if (Portal) {
                  $$renderer4.push("<!--[-->");
                  Portal($$renderer4, {
                    children: prevent_snippet_stringification(($$renderer5) => {
                      if (Popover_content) {
                        $$renderer5.push("<!--[-->");
                        Popover_content($$renderer5, {
                          "data-testid": "scoped-models-content",
                          sideOffset: 4,
                          class: "z-50 flex max-h-96 min-w-80 flex-col gap-2 rounded-lg border border-border-strong bg-surface p-2 shadow-lg outline-none",
                          children: prevent_snippet_stringification(($$renderer6) => {
                            body($$renderer6);
                          }),
                          $$slots: { default: true }
                        });
                        $$renderer5.push("<!--]-->");
                      } else {
                        $$renderer5.push("<!--[!-->");
                        $$renderer5.push("<!--]-->");
                      }
                    })
                  });
                  $$renderer4.push("<!--]-->");
                } else {
                  $$renderer4.push("<!--[!-->");
                  $$renderer4.push("<!--]-->");
                }
              }),
              $$slots: { default: true }
            });
            $$renderer3.push("<!--]-->");
          } else {
            $$renderer3.push("<!--[!-->");
            $$renderer3.push("<!--]-->");
          }
        }
        $$renderer3.push(`<!--]-->`);
      }
      do {
        $$settled = true;
        $$inner_renderer = $$renderer2.copy();
        $$render_inner($$inner_renderer);
      } while (!$$settled);
      $$renderer2.subsume($$inner_renderer);
      bind_props($$props, { open, openScopedModels });
    },
    Model_scope_select
  );
}
Model_scope_select.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const SLOT_COUNT = 3;
const SLOTS_KEY = "peachpi:quickSlots";
const TOGGLES_KEY = "peachpi:quickSlotToggles";
const DEFAULT_SLOTS = [
  {
    ref: { kind: "extension", name: "caveman" },
    label: "Caveman",
    behavior: { type: "bound", binding: "caveman" }
  },
  null,
  null
];
function pad(arr, fill) {
  const out = arr.slice(0, SLOT_COUNT);
  while (out.length < SLOT_COUNT) out.push(fill);
  return out;
}
function readSlots() {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return DEFAULT_SLOTS.map((s) => s ? { ...s } : null);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SLOTS.map((s) => s ? { ...s } : null);
    return pad(parsed.map((s) => s && typeof s === "object" && s.ref && s.behavior ? s : null), null);
  } catch {
    return DEFAULT_SLOTS.map((s) => s ? { ...s } : null);
  }
}
function readToggles() {
  try {
    const raw = localStorage.getItem(TOGGLES_KEY);
    if (!raw) return pad([], false);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? pad(parsed.map(Boolean), false) : pad([], false);
  } catch {
    return pad([], false);
  }
}
class QuickSlotsStore {
  slots = pad([], null);
  /** Local on/off state for "toggle" behaviors, indexed by slot. */
  toggles = pad([], false);
  initialized = false;
  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.slots = readSlots();
    this.toggles = readToggles();
    window.addEventListener("storage", (e) => {
      if (e.key === SLOTS_KEY) this.slots = readSlots();
      if (e.key === TOGGLES_KEY) this.toggles = readToggles();
    });
  }
  persistSlots() {
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(this.slots));
    } catch {
    }
  }
  persistToggles() {
    try {
      localStorage.setItem(TOGGLES_KEY, JSON.stringify(this.toggles));
    } catch {
    }
  }
  assign(index, slot) {
    if (index < 0 || index >= SLOT_COUNT) return;
    this.slots = this.slots.map((s, i) => i === index ? slot : s);
    this.toggles = this.toggles.map((v, i) => i === index ? false : v);
    this.persistSlots();
    this.persistToggles();
  }
  clear(index) {
    if (index < 0 || index >= SLOT_COUNT) return;
    this.slots = this.slots.map((s, i) => i === index ? null : s);
    this.toggles = this.toggles.map((v, i) => i === index ? false : v);
    this.persistSlots();
    this.persistToggles();
  }
  /** Flip a "toggle" behavior's local LED state and return the new value. */
  flipToggle(index) {
    const next = !this.toggles[index];
    this.toggles = this.toggles.map((v, i) => i === index ? next : v);
    this.persistToggles();
    return next;
  }
}
const quickSlots = new QuickSlotsStore();
QuickSlots[FILENAME] = "src/desktop-renderer/app/composer/QuickSlots.svelte";
function QuickSlots($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        commands,
        cavemanEnabled,
        onToggleCaveman,
        onInjectSkill,
        onRunCommand,
        onRunSystem,
        onRunRaw,
        onRequestCommands,
        onAutoDetect
        /** All assignable commands (system + skills + extensions + prompts). */
        /** All assignable commands (system + skills + extensions + prompts). */
        /** Ask the host to lazy-load the slash command list before the picker shows. */
        /** Probe a command with a helper LLM to propose toggle behavior. */
      } = $$props;
      quickSlots.init();
      function isToggle(slot) {
        return slot.behavior.type !== "fire";
      }
      function isOn(index, slot) {
        if (slot.behavior.type === "bound") return cavemanEnabled;
        if (slot.behavior.type === "toggle") return quickSlots.toggles[index] ?? false;
        return false;
      }
      $$renderer2.push(`<div class="composer__slots-wrap">`);
      push_element($$renderer2, "div", 181, 0);
      $$renderer2.push(`<div class="composer__slots" role="group" aria-label="Quick-access actions">`);
      push_element($$renderer2, "div", 182, 2);
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(Array(SLOT_COUNT));
      for (let index = 0, $$length = each_array.length; index < $$length; index++) {
        each_array[index];
        const slot = quickSlots.slots[index];
        if (slot) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="devbtn">`);
          push_element($$renderer2, "span", 186, 8);
          $$renderer2.push(`<button${attr_class(`devbtn__switch ${isOn(index, slot) ? "devbtn__switch--on" : ""}`)}${attr("aria-pressed", isToggle(slot) ? isOn(index, slot) : void 0)}${attr("data-press", slot.behavior.type === "bound" && slot.behavior.binding === "caveman" ? "self" : void 0)}${attr("data-testid", `quick-slot-${index}`)}${attr("title", `${slot.label}${isToggle(slot) ? " (toggle)" : ""} — right-click to change`)}${attr("aria-label", slot.label)}>`);
          push_element($$renderer2, "button", 187, 10);
          $$renderer2.push(`<span class="devbtn__cap" aria-hidden="true">`);
          push_element($$renderer2, "span", 202, 12);
          $$renderer2.push(`</span>`);
          pop_element();
          $$renderer2.push(` <span class="devbtn__caption">`);
          push_element($$renderer2, "span", 203, 12);
          $$renderer2.push(`${escape_html(slot.label)}</span>`);
          pop_element();
          $$renderer2.push(`</button>`);
          pop_element();
          $$renderer2.push(`</span>`);
          pop_element();
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<span class="devbtn devbtn--empty">`);
          push_element($$renderer2, "span", 207, 8);
          $$renderer2.push(`<button class="devbtn__switch"${attr("data-testid", `quick-slot-${index}`)} title="Add a quick action" aria-label="Add a quick action">`);
          push_element($$renderer2, "button", 208, 10);
          $$renderer2.push(`<span class="devbtn__cap" aria-hidden="true">`);
          push_element($$renderer2, "span", 215, 12);
          $$renderer2.push(`+</span>`);
          pop_element();
          $$renderer2.push(` <span class="devbtn__caption">`);
          push_element($$renderer2, "span", 216, 12);
          $$renderer2.push(`Add</span>`);
          pop_element();
          $$renderer2.push(`</button>`);
          pop_element();
          $$renderer2.push(`</span>`);
          pop_element();
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div>`);
      pop_element();
      $$renderer2.push(` `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
      pop_element();
    },
    QuickSlots
  );
}
QuickSlots.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
ConnectorIcon[FILENAME] = "src/desktop-renderer/app/ConnectorIcon.svelte";
function ConnectorIcon($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { logoUrl = null, label, size: size2 = 20 } = $$props;
      const monogram = derived(() => (label.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase());
      const hue = derived(() => [...label].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
      if (logoUrl && true) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<img${attr("src", logoUrl)}${attr("alt", label)}${attr("width", size2)}${attr("height", size2)} class="shrink-0 rounded-md bg-white object-contain p-0.5"${attr_style(`width:${stringify(size2)}px;height:${stringify(size2)}px`)} onerror="this.__e=event"/>`);
        push_element($$renderer2, "img", 19, 2);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<span class="flex shrink-0 items-center justify-center rounded-md font-semibold text-white"${attr_style(`width:${stringify(size2)}px;height:${stringify(size2)}px;font-size:${stringify(Math.round(size2 * 0.5))}px;background:hsl(${stringify(hue())} 55% 45%)`)}${attr("aria-label", label)}>`);
        push_element($$renderer2, "span", 29, 2);
        $$renderer2.push(`${escape_html(monogram())}</span>`);
        pop_element();
      }
      $$renderer2.push(`<!--]-->`);
    },
    ConnectorIcon
  );
}
ConnectorIcon.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Star[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/star.svelte";
function Star($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "star" }, props, { iconNode }]));
    },
    Star
  );
}
Star.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
SlashMenu[FILENAME] = "src/desktop-renderer/app/composer/SlashMenu.svelte";
function SlashMenu($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        /** Active `/token` left of the caret, or null when the menu is closed. */
        query,
        /** The host-declared system-command list (names only here). */
        systemCommands,
        /** The host-loaded extension/prompt/skill commands (host owns the IPC load
         *  so the chip-auto-collapse effect + QuickSlots share one list). */
        loadedCommands,
        /** Active match index. Bindable so the host can reset / forward reads. */
        index = 0,
        /** Pick a slash command (skill prompt collapses to a chip; system/extension
         *  run now). The resolved body (with the `/token` stripped) is passed. */
        onPick
      } = $$props;
      let slashFilter = "starred";
      const allCommands = derived(() => [...systemCommands, ...loadedCommands]);
      const starKey = (c) => `${c.kind}:${c.name}`;
      const effectiveFilter = derived(() => query && slashFilter === "starred" ? "all" : slashFilter);
      const slashMatches = derived(() => {
        if (query === null) return [];
        const filter = effectiveFilter();
        return allCommands().filter((c) => filter === "all" ? true : filter === "starred" ? commandPrefs.isStarred(starKey(c)) : c.kind === filter).filter((c) => c.name.toLowerCase().includes(query)).sort((a, b) => {
          const ap = a.name.toLowerCase().startsWith(query) ? 0 : 1;
          const bp = b.name.toLowerCase().startsWith(query) ? 0 : 1;
          return ap - bp;
        }).slice(0, 50);
      });
      const slashKindsPresent = derived(() => new Set(allCommands().map((c) => c.kind)));
      const commandKindLabel = {
        skill: "skill",
        extension: "extension",
        prompt: "prompt",
        system: "system"
      };
      const commandKindBadge = {
        skill: "bg-emerald-500/15 text-emerald-700",
        extension: "bg-sky-500/15 text-sky-700",
        prompt: "bg-violet-500/15 text-violet-700",
        system: "bg-amber-500/15 text-amber-700"
      };
      const slashTabs = [
        { key: "starred", label: "Starred" },
        { key: "all", label: "All" },
        { key: "system", label: "System" },
        { key: "extension", label: "Extensions" },
        { key: "skill", label: "Skills" },
        { key: "prompt", label: "Prompts" }
      ];
      const slashVisibleTabs = derived(() => slashTabs.filter((t) => t.key === "all" || t.key === "starred" || slashKindsPresent().has(t.key)));
      function cycleSlashFilter(dir) {
        const keys = slashVisibleTabs().map((t) => t.key);
        const i = keys.indexOf(slashFilter);
        slashFilter = keys[(i + dir + keys.length) % keys.length];
      }
      function handleMenuKey(e) {
        if (e.key === "Tab") {
          e.preventDefault();
          cycleSlashFilter(e.shiftKey ? -1 : 1);
          return true;
        }
        const matches = slashMatches();
        if (matches.length === 0) return false;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          index = (index + 1) % matches.length;
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          index = (index - 1 + matches.length) % matches.length;
          return true;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onPick(matches[index]);
          return true;
        }
        return false;
      }
      if (query !== null) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl" data-testid="slash-menu">`);
        push_element($$renderer2, "div", 156, 2);
        $$renderer2.push(`<div class="flex items-center gap-1 border-b border-border-strong px-2 py-1.5">`);
        push_element($$renderer2, "div", 161, 4);
        $$renderer2.push(`<!--[-->`);
        const each_array = ensure_array_like(slashVisibleTabs());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let tab = each_array[$$index];
          $$renderer2.push(`<button${attr_class(`rounded px-2 py-0.5 text-[11px] font-medium ${stringify(effectiveFilter() === tab.key ? tab.key === "all" ? "bg-surface-3 text-fg" : tab.key === "starred" ? "bg-amber-400/20 text-amber-700" : commandKindBadge[tab.key] : "text-faint hover:bg-surface-2")}`)}>`);
          push_element($$renderer2, "button", 163, 8);
          $$renderer2.push(`${escape_html(tab.label)}</button>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--> <span class="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-faint">`);
        push_element($$renderer2, "span", 175, 6);
        $$renderer2.push(`<kbd class="rounded border border-border-strong bg-surface-2 px-1 py-0.5 font-sans text-[10px] leading-none">`);
        push_element($$renderer2, "kbd", 176, 8);
        $$renderer2.push(`⇥ Tab</kbd>`);
        pop_element();
        $$renderer2.push(` to switch</span>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
        $$renderer2.push(` <div class="max-h-96 overflow-y-auto">`);
        push_element($$renderer2, "div", 183, 4);
        const each_array_1 = ensure_array_like(slashMatches());
        if (each_array_1.length !== 0) {
          $$renderer2.push("<!--[-->");
          for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
            let cmd = each_array_1[i];
            const starred2 = commandPrefs.isStarred(starKey(cmd));
            $$renderer2.push(`<div${attr_class(`flex items-center ${i === index ? "bg-surface-2" : ""} hover:bg-surface-2`)}>`);
            push_element($$renderer2, "div", 186, 8);
            $$renderer2.push(`<button class="flex min-w-0 flex-1 items-baseline gap-2 px-3 py-1.5 text-left text-sm">`);
            push_element($$renderer2, "button", 189, 10);
            $$renderer2.push(`<span class="shrink-0 whitespace-nowrap font-mono text-fg">`);
            push_element($$renderer2, "span", 193, 12);
            $$renderer2.push(`/${escape_html(cmd.name)}</span>`);
            pop_element();
            $$renderer2.push(` <span class="min-w-0 truncate text-xs text-faint">`);
            push_element($$renderer2, "span", 194, 12);
            $$renderer2.push(`${escape_html(cmd.description)}</span>`);
            pop_element();
            $$renderer2.push(` <span${attr_class(`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${stringify(commandKindBadge[cmd.kind])}`)}>`);
            push_element($$renderer2, "span", 195, 12);
            $$renderer2.push(`${escape_html(commandKindLabel[cmd.kind])}</span>`);
            pop_element();
            $$renderer2.push(`</button>`);
            pop_element();
            $$renderer2.push(` <button${attr_class(`shrink-0 px-2 py-1.5 ${starred2 ? "text-amber-500" : "text-faint hover:text-amber-500"}`)}${attr("title", starred2 ? "Unstar" : "Star")}${attr("aria-label", starred2 ? "Unstar command" : "Star command")}>`);
            push_element($$renderer2, "button", 197, 10);
            Star($$renderer2, { size: 14, class: starred2 ? "fill-amber-400" : "" });
            $$renderer2.push(`<!----></button>`);
            pop_element();
            $$renderer2.push(`</div>`);
            pop_element();
          }
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="px-3 py-2 text-xs text-faint">`);
          push_element($$renderer2, "div", 207, 8);
          $$renderer2.push(`${escape_html(slashFilter === "starred" && !query ? "No starred commands yet — click the ★ to add one" : "No matching commands")}</div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--></div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { index, handleMenuKey });
    },
    SlashMenu
  );
}
SlashMenu.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
ConnectionsMenu[FILENAME] = "src/desktop-renderer/app/composer/ConnectionsMenu.svelte";
function ConnectionsMenu($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        /** Active `@token` left of the caret, or null when the menu is closed. */
        query,
        /** Active index into the virtual (connections ++ secrets) list. Bindable. */
        index = 0,
        /** Pin a connection chip (host mutates the draft + refocuses). */
        onPickConnection,
        /** Pin a BWS secret chip (host mutates the draft + refocuses). */
        onPickSecret
      } = $$props;
      let connectionsCatalog = [];
      let secretsCatalog = [];
      const atMatches = derived(() => {
        if (query === null) return [];
        const q = query;
        return connectionsCatalog.filter((c) => c.name.toLowerCase().includes(q)).sort((a, b) => {
          const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
          const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          return ap - bp;
        }).slice(0, 20);
      });
      const secretMatches = derived(() => {
        if (query === null) return [];
        const q = query;
        return secretsCatalog.filter((s) => s.name.toLowerCase().includes(q)).sort((a, b) => {
          const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
          const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          return ap - bp;
        }).slice(0, 20);
      });
      const total = derived(() => atMatches().length + secretMatches().length);
      function handleMenuKey(e) {
        const t = total();
        if (t === 0) return false;
        if (index >= t) index = 0;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          index = (index + 1) % t;
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          index = (index - 1 + t) % t;
          return true;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (index < atMatches().length) {
            onPickConnection(atMatches()[index]);
          } else {
            onPickSecret(secretMatches()[index - atMatches().length]);
          }
          return true;
        }
        return false;
      }
      if (
        // Expose the picker's referencable types so the host can build Referenced*
        // values from a ConnMenuItem/SecMenuItem without re-declaring them.
        query !== null
      ) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="absolute bottom-full mb-2 w-full overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl" data-testid="connections-menu">`);
        push_element($$renderer2, "div", 205, 2);
        $$renderer2.push(`<div class="border-b border-border-strong px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fainter">`);
        push_element($$renderer2, "div", 209, 4);
        $$renderer2.push(`Connections &amp; Secrets <span class="font-normal normal-case text-fainter">`);
        push_element($$renderer2, "span", 210, 32);
        $$renderer2.push(`· pick to pin @</span>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
        $$renderer2.push(` <div class="max-h-80 overflow-y-auto">`);
        push_element($$renderer2, "div", 212, 4);
        {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="px-3 py-2 text-xs text-faint">`);
          push_element($$renderer2, "div", 214, 8);
          $$renderer2.push(`Loading…</div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--></div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { index, handleMenuKey });
    },
    ConnectionsMenu
  );
}
ConnectionsMenu.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
SentryRenderer.init({
  beforeSend: (event) => {
    return null;
  }
});
function captureEvent(event, props) {
  return;
}
Composer[FILENAME] = "src/desktop-renderer/app/Composer.svelte";
function Composer($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        thread,
        onRewind,
        onNewThread,
        onCloneThread,
        onForkPicker,
        centered = false
        /** `/rewind [n]` from the composer — rewind the n-th turn from the end. */
        /** `/new` system command — start a new thread in the current project. */
        /** `/clone` or `/branch` — clone the current thread into a new thread. */
        /** `/fork` — open the fork-from-message picker. */
        /** Centered "new thread" state (composer in the middle, no messages yet). */
      } = $$props;
      const draft = derived(() => drafts.for(thread.id));
      const queue = derived(() => queues.for(thread.id));
      const running = derived(() => thread.status === "running");
      const compacting = derived(() => transcripts.itemsFor(thread.id).some((i) => i.kind === "compaction" && i.running));
      const meta = derived(() => sessionMetas.for(thread.id));
      const autoCompactPercent = derived(() => {
        const window2 = meta()?.contextWindow;
        const tokenPercent = autoCompact.tokens != null && window2 ? autoCompact.tokens / window2 * 100 : Infinity;
        return Math.min(100, autoCompact.percent, tokenPercent);
      });
      const autoCompactTokens = derived(() => meta()?.contextWindow ? Math.round(autoCompactPercent() / 100 * meta().contextWindow) : null);
      void caveman.load();
      void autoCompact.load();
      commandPrefs.init();
      function toggleCaveman() {
        playClick(caveman.enabled ? "up" : "down");
        void caveman.toggle(thread.id);
      }
      function injectSkill(cmd) {
        drafts.update(thread.id, { command: { name: cmd.name, kind: "skill" } });
      }
      function runRawCommand(raw) {
        if (!raw) return;
        void api.invoke("threads:runCommand", thread.id, raw).catch((err) => {
          console.error("slot command failed", err);
        });
      }
      async function pickModel(provider, id2) {
        playRotary();
        sessionMetas.set(await api.invoke("threads:setModel", thread.id, provider, id2));
      }
      const fmtTokens = (n) => {
        if (n == null) return "—";
        if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
        if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
        return String(Math.round(n));
      };
      async function cycleThinking(direction = 1) {
        if (!meta()) return;
        const levels = meta().availableThinkingLevels;
        if (levels.length === 0) return;
        const idx = levels.indexOf(meta().thinkingLevel);
        const next = levels[(idx + direction + levels.length) % levels.length];
        playRotary();
        sessionMetas.set(await api.invoke("threads:setThinking", thread.id, next));
      }
      let chipWidth = 0;
      let commands = [];
      let cursor = 0;
      function syncCursor() {
        cursor = 0;
      }
      const slashContext = derived(() => {
        void draft().text;
        const before = draft().text.slice(0, cursor);
        const slash = before.lastIndexOf("/");
        if (slash === -1) return null;
        if (slash > 0 && !/\s/.test(before[slash - 1])) return null;
        const token = before.slice(slash + 1);
        if (/\s/.test(token)) return null;
        return { start: slash, query: token.toLowerCase() };
      });
      const slashQuery = derived(() => slashContext()?.query ?? null);
      const systemCommandList = [
        {
          name: "model",
          description: "Choose the model",
          kind: "system"
        },
        {
          name: "compact",
          description: "Compact the conversation",
          kind: "system"
        },
        {
          name: "rewind",
          description: "Rewind the last turn (/rewind [n])",
          kind: "system"
        },
        {
          name: "btw",
          description: "Ask a side question (/btw <question>)",
          kind: "system"
        },
        {
          name: "plan",
          description: "Switch to Plan mode",
          kind: "system"
        },
        {
          name: "build",
          description: "Switch to Build mode",
          kind: "system"
        },
        {
          name: "new",
          description: "Start a new thread in this project",
          kind: "system"
        },
        {
          name: "branch",
          description: "Branch this thread into a new thread",
          kind: "system"
        },
        {
          name: "clone",
          description: "Clone this thread into a new thread",
          kind: "system"
        },
        {
          name: "fork",
          description: "Pick a turn to fork a new thread from",
          kind: "system"
        },
        {
          name: "reload",
          description: "Reload extensions/skills/prompts from disk",
          kind: "system"
        },
        {
          name: "scoped-models",
          description: "Pick which models appear in the composer",
          kind: "system"
        }
      ];
      new Set(systemCommandList.map((c) => c.name));
      let commandsLoadedFor = null;
      let slashIndex = 0;
      function ensureCommands() {
        if (commandsLoadedFor !== thread.id) {
          commandsLoadedFor = thread.id;
          void api.invoke("threads:listCommands", thread.id).then((c) => commands = c);
        }
      }
      const commandIcon = {
        skill: Book_open,
        extension: Puzzle,
        prompt: Message_square_text,
        system: Sliders_horizontal
      };
      function pickSlash(cmd) {
        const ctx = slashContext();
        const text = draft().text;
        const stripped = ctx ? text.slice(0, ctx.start) + text.slice(cursor) : "";
        if (cmd.kind === "system") {
          drafts.clearText(thread.id);
          runSystemCommand(cmd.name, stripped.trim());
          return;
        }
        if (cmd.kind !== "skill") {
          runSlashCommand(cmd, stripped.trim());
          return;
        }
        drafts.update(thread.id, { command: { name: cmd.name, kind: cmd.kind }, text: stripped });
        requestAnimationFrame(syncCursor);
      }
      function runSystemCommand(name, body) {
        switch (name) {
          case "model":
            break;
          case "compact":
            void api.invoke("threads:compact", thread.id);
            break;
          case "rewind":
            onRewind?.(/^\d+$/.test(body) ? Number(body) : 1);
            break;
          case "btw":
            void sideChat.openPanel(thread.id, body || void 0);
            break;
          case "plan":
            drafts.update(thread.id, { mode: "plan" });
            break;
          case "build":
            drafts.update(thread.id, { mode: "build" });
            break;
          case "new":
            onNewThread?.();
            break;
          case "clone":
          case "branch":
            onCloneThread?.();
            break;
          case "fork":
            onForkPicker?.();
            break;
          case "reload":
            void api.invoke("threads:reload", thread.id).then((res) => {
              if (!res.ok) extensionUi.notify(res.error ?? "Reload failed.", void 0, "error");
            });
            break;
        }
      }
      function runSlashCommand(cmd, body) {
        const outgoing = [`/${cmd.name}`, body].filter(Boolean).join(" ");
        drafts.clearText(thread.id);
        captureEvent("slash_command_run", { command: cmd.name, kind: cmd.kind });
        void api.invoke("threads:prompt", thread.id, outgoing, [], "all").catch((err) => {
          console.error("run command failed", err);
        });
      }
      const atContext = derived(() => {
        void draft().text;
        const before = draft().text.slice(0, cursor);
        const at = before.lastIndexOf("@");
        if (at === -1) return null;
        if (at > 0 && !/\s/.test(before[at - 1])) return null;
        const token = before.slice(at + 1);
        if (/\s/.test(token)) return null;
        return { start: at, query: token.toLowerCase() };
      });
      const atQuery = derived(() => atContext()?.query ?? null);
      let atIndex = 0;
      function pickConnection(c) {
        const ctx = atContext();
        const text = draft().text;
        const stripped = ctx ? text.slice(0, ctx.start) + text.slice(cursor) : "";
        const ref = c.kind === "custom" ? {
          kind: "custom",
          name: c.name,
          baseUrl: c.baseUrl,
          logoUrl: c.logoUrl
        } : {
          kind: "composio",
          name: c.name,
          toolkitSlug: c.toolkitSlug,
          logoUrl: c.logoUrl
        };
        if (!draft().connections.some((r) => r.kind === ref.kind && r.name === ref.name)) {
          drafts.update(thread.id, { text: stripped, connections: [...draft().connections, ref] });
          captureEvent("connection_pinned", { kind: c.kind });
        } else {
          drafts.update(thread.id, { text: stripped });
        }
        requestAnimationFrame(syncCursor);
      }
      function pickSecret(s) {
        const ctx = atContext();
        const text = draft().text;
        const stripped = ctx ? text.slice(0, ctx.start) + text.slice(cursor) : "";
        const ref = { id: s.id, name: s.name, projectId: s.projectId };
        if (!draft().secrets.some((r) => r.id === ref.id)) {
          drafts.update(thread.id, { text: stripped, secrets: [...draft().secrets, ref] });
        } else {
          drafts.update(thread.id, { text: stripped });
        }
        requestAnimationFrame(syncCursor);
      }
      let $$settled = true;
      let $$inner_renderer;
      function $$render_inner($$renderer3) {
        $$renderer3.push(`<footer class="composer-device shrink-0 px-6 pb-6 svelte-12tdgqe">`);
        push_element($$renderer3, "footer", 774, 0);
        $$renderer3.push(`<div class="composer__frame relative svelte-12tdgqe">`);
        push_element($$renderer3, "div", 775, 2);
        {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        SlashMenu($$renderer3, {
          query: slashQuery(),
          systemCommands: systemCommandList,
          loadedCommands: commands,
          onPick: pickSlash,
          get index() {
            return slashIndex;
          },
          set index($$value) {
            slashIndex = $$value;
            $$settled = false;
          }
        });
        $$renderer3.push(`<!----> `);
        ConnectionsMenu($$renderer3, {
          query: atQuery(),
          onPickConnection: pickConnection,
          onPickSecret: pickSecret,
          get index() {
            return atIndex;
          },
          set index($$value) {
            atIndex = $$value;
            $$settled = false;
          }
        });
        $$renderer3.push(`<!----> `);
        if (queue().followUp.length > 0) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<section class="qq svelte-12tdgqe" data-testid="queued-shelf" role="list"${attr("aria-label", `${queue().followUp.length} queued`)}>`);
          push_element($$renderer3, "section", 808, 6);
          $$renderer3.push(`<header class="qq__head svelte-12tdgqe">`);
          push_element($$renderer3, "header", 814, 8);
          $$renderer3.push(`<span class="qq__pulse svelte-12tdgqe" aria-hidden="true">`);
          push_element($$renderer3, "span", 815, 10);
          $$renderer3.push(`</span>`);
          pop_element();
          $$renderer3.push(` <span class="qq__head-label svelte-12tdgqe">`);
          push_element($$renderer3, "span", 816, 10);
          $$renderer3.push(`Up next</span>`);
          pop_element();
          $$renderer3.push(` <span class="qq__count svelte-12tdgqe" aria-hidden="true">`);
          push_element($$renderer3, "span", 817, 10);
          $$renderer3.push(`${escape_html(queue().followUp.length)}</span>`);
          pop_element();
          $$renderer3.push(` <span class="qq__head-hint svelte-12tdgqe" aria-hidden="true">`);
          push_element($$renderer3, "span", 818, 10);
          $$renderer3.push(`<span class="qq__head-tag qq__head-tag--queue svelte-12tdgqe">`);
          push_element($$renderer3, "span", 819, 12);
          $$renderer3.push(`${escape_html(queue().followUp.length)} queued</span>`);
          pop_element();
          $$renderer3.push(`</span>`);
          pop_element();
          $$renderer3.push(`</header>`);
          pop_element();
          $$renderer3.push(` <div class="qq__list svelte-12tdgqe">`);
          push_element($$renderer3, "div", 823, 8);
          if (queue().followUp.length > 0) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<div class="qq__group svelte-12tdgqe" role="group" aria-label="Queued messages">`);
            push_element($$renderer3, "div", 825, 12);
            $$renderer3.push(`<span class="qq__group-label svelte-12tdgqe">`);
            push_element($$renderer3, "span", 826, 14);
            $$renderer3.push(`queue</span>`);
            pop_element();
            $$renderer3.push(` <div class="qq__items svelte-12tdgqe">`);
            push_element($$renderer3, "div", 827, 14);
            $$renderer3.push(`<!--[-->`);
            const each_array = ensure_array_like(queue().followUp);
            for (let i = 0, $$length = each_array.length; i < $$length; i++) {
              let t = each_array[i];
              $$renderer3.push(`<div class="qq-item qq-item--queue svelte-12tdgqe" role="listitem">`);
              push_element($$renderer3, "div", 829, 18);
              $$renderer3.push(`<span class="qq-item__pos svelte-12tdgqe" aria-hidden="true">`);
              push_element($$renderer3, "span", 830, 20);
              $$renderer3.push(`${escape_html(i + 1)}</span>`);
              pop_element();
              $$renderer3.push(` <span class="qq-item__text svelte-12tdgqe"${attr("title", t)}>`);
              push_element($$renderer3, "span", 831, 20);
              $$renderer3.push(`${escape_html(t)}</span>`);
              pop_element();
              $$renderer3.push(` <button class="qq-item__action qq-item__action--promote svelte-12tdgqe" title="Steer now" aria-label="Steer now" data-testid="promote-steer">`);
              push_element($$renderer3, "button", 832, 20);
              $$renderer3.push(`<svg viewBox="0 0 16 16" aria-hidden="true" class="svelte-12tdgqe">`);
              push_element($$renderer3, "svg", 838, 21);
              $$renderer3.push(`<path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="svelte-12tdgqe">`);
              push_element($$renderer3, "path", 838, 65);
              $$renderer3.push(`</path>`);
              pop_element();
              $$renderer3.push(`</svg>`);
              pop_element();
              $$renderer3.push(`</button>`);
              pop_element();
              $$renderer3.push(` <button class="qq-item__action qq-item__action--delete svelte-12tdgqe" title="Remove" aria-label="Remove queued message" data-testid="delete-followup">`);
              push_element($$renderer3, "button", 839, 20);
              $$renderer3.push(`<svg viewBox="0 0 16 16" aria-hidden="true" class="svelte-12tdgqe">`);
              push_element($$renderer3, "svg", 845, 21);
              $$renderer3.push(`<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" class="svelte-12tdgqe">`);
              push_element($$renderer3, "path", 845, 65);
              $$renderer3.push(`</path>`);
              pop_element();
              $$renderer3.push(`</svg>`);
              pop_element();
              $$renderer3.push(`</button>`);
              pop_element();
              $$renderer3.push(`</div>`);
              pop_element();
            }
            $$renderer3.push(`<!--]--></div>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
          $$renderer3.push(`</section>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        if (draft().connections.length > 0) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="mb-2 flex flex-wrap gap-2 svelte-12tdgqe" data-testid="connections-shelf">`);
          push_element($$renderer3, "div", 857, 6);
          $$renderer3.push(`<!--[-->`);
          const each_array_1 = ensure_array_like(draft().connections);
          for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
            let c = each_array_1[i];
            $$renderer3.push(`<div class="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-xs text-fg-soft svelte-12tdgqe">`);
            push_element($$renderer3, "div", 859, 10);
            ConnectorIcon($$renderer3, { logoUrl: c.logoUrl, label: c.name, size: 14 });
            $$renderer3.push(`<!----> <span class="max-w-40 truncate svelte-12tdgqe">`);
            push_element($$renderer3, "span", 861, 12);
            $$renderer3.push(`@${escape_html(c.name)}</span>`);
            pop_element();
            $$renderer3.push(` <button class="ml-0.5 text-faint hover:text-danger svelte-12tdgqe" title="Remove connection"${attr("aria-label", `Remove connection ${stringify(c.name)}`)}>`);
            push_element($$renderer3, "button", 862, 12);
            X($$renderer3, { size: 12 });
            $$renderer3.push(`<!----></button>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        if (draft().secrets.length > 0) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="mb-2 flex flex-wrap gap-2 svelte-12tdgqe" data-testid="secrets-shelf">`);
          push_element($$renderer3, "div", 875, 6);
          $$renderer3.push(`<!--[-->`);
          const each_array_2 = ensure_array_like(draft().secrets);
          for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
            let s = each_array_2[i];
            $$renderer3.push(`<div class="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800 svelte-12tdgqe">`);
            push_element($$renderer3, "div", 877, 10);
            Key_round($$renderer3, { size: 14, class: "shrink-0" });
            $$renderer3.push(`<!----> <span class="max-w-40 truncate font-mono svelte-12tdgqe">`);
            push_element($$renderer3, "span", 879, 12);
            $$renderer3.push(`@${escape_html(s.name)}</span>`);
            pop_element();
            $$renderer3.push(` <button class="ml-0.5 text-amber-600/60 hover:text-danger svelte-12tdgqe" title="Remove secret"${attr("aria-label", `Remove secret ${stringify(s.name)}`)}>`);
            push_element($$renderer3, "button", 880, 12);
            X($$renderer3, { size: 12 });
            $$renderer3.push(`<!----></button>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        if (draft().attachments.length > 0) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="mb-2 flex flex-wrap gap-2 svelte-12tdgqe" data-testid="attachment-shelf">`);
          push_element($$renderer3, "div", 893, 6);
          $$renderer3.push(`<!--[-->`);
          const each_array_3 = ensure_array_like(draft().attachments);
          for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
            let att = each_array_3[$$index_3];
            $$renderer3.push(`<div class="group relative svelte-12tdgqe">`);
            push_element($$renderer3, "div", 895, 10);
            if (att.kind === "image") {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<button type="button" class="block cursor-zoom-in svelte-12tdgqe" title="Click to enlarge">`);
              push_element($$renderer3, "button", 897, 14);
              $$renderer3.push(`<img${attr("src", `data:${att.mimeType};base64,${att.data}`)}${attr("alt", att.name)} class="h-16 w-16 rounded-lg border border-border-strong object-cover svelte-12tdgqe"/>`);
              push_element($$renderer3, "img", 903, 16);
              pop_element();
              $$renderer3.push(`</button>`);
              pop_element();
            } else if (att.kind === "text") {
              $$renderer3.push("<!--[1-->");
              $$renderer3.push(`<button type="button" class="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-fg-soft hover:bg-surface-2 svelte-12tdgqe" title="Click to view">`);
              push_element($$renderer3, "button", 910, 14);
              File_text($$renderer3, { size: 13 });
              $$renderer3.push(`<!----> <span class="max-w-40 truncate svelte-12tdgqe">`);
              push_element($$renderer3, "span", 917, 16);
              $$renderer3.push(`${escape_html(att.name)}</span>`);
              pop_element();
              $$renderer3.push(`</button>`);
              pop_element();
            } else {
              $$renderer3.push("<!--[-1-->");
              $$renderer3.push(`<div class="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs text-fg-soft svelte-12tdgqe">`);
              push_element($$renderer3, "div", 920, 14);
              File_text($$renderer3, { size: 13 });
              $$renderer3.push(`<!----> <span class="max-w-40 truncate svelte-12tdgqe">`);
              push_element($$renderer3, "span", 922, 16);
              $$renderer3.push(`${escape_html(att.name)}</span>`);
              pop_element();
              $$renderer3.push(`</div>`);
              pop_element();
            }
            $$renderer3.push(`<!--]--> <button class="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-surface-3 text-[10px] text-fg group-hover:flex hover:bg-danger svelte-12tdgqe">`);
            push_element($$renderer3, "button", 925, 12);
            X($$renderer3, { size: 10 });
            $$renderer3.push(`<!----></button>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> <div class="composer__surface svelte-12tdgqe" role="region" aria-label="Composer">`);
        push_element($$renderer3, "div", 935, 4);
        $$renderer3.push(`<div class="composer__editor svelte-12tdgqe">`);
        push_element($$renderer3, "div", 948, 6);
        $$renderer3.push(`<div${attr_class(`composer__screen ${""}`, "svelte-12tdgqe")}>`);
        push_element($$renderer3, "div", 949, 8);
        if (draft().command) {
          $$renderer3.push("<!--[0-->");
          const Icon2 = commandIcon[draft().command.kind];
          $$renderer3.push(`<span class="skill-chip skill-chip--composer composer__cmd-chip svelte-12tdgqe" data-testid="composer-command-chip">`);
          push_element($$renderer3, "span", 962, 12);
          if (Icon2) {
            $$renderer3.push("<!--[-->");
            Icon2($$renderer3, { size: 12 });
            $$renderer3.push("<!--]-->");
          } else {
            $$renderer3.push("<!--[!-->");
            $$renderer3.push("<!--]-->");
          }
          $$renderer3.push(` <span class="svelte-12tdgqe">`);
          push_element($$renderer3, "span", 968, 14);
          $$renderer3.push(`${escape_html(draft().command.name)}</span>`);
          pop_element();
          $$renderer3.push(` <button type="button" class="skill-chip__remove svelte-12tdgqe"${attr("title", `Remove ${stringify(draft().command.kind)}`)}${attr("aria-label", `Remove ${stringify(draft().command.kind)}`)}>`);
          push_element($$renderer3, "button", 969, 14);
          X($$renderer3, { size: 10 });
          $$renderer3.push(`<!----></button>`);
          pop_element();
          $$renderer3.push(`</span>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> <textarea${attr("placeholder", running() ? "enter queues · ⌘enter steers · esc stops" : draft().mode === "plan" ? "plan something…" : "message the clanker")} data-testid="composer-input" rows="1" class="svelte-12tdgqe"${attr_style("", { "text-indent": draft().command ? `${chipWidth + 8}px` : null })}>`);
        push_element($$renderer3, "textarea", 978, 10);
        const $$body = escape_html(draft().text);
        if ($$body) {
          $$renderer3.push(`${$$body}`);
        }
        $$renderer3.push(`</textarea>`);
        pop_element();
        $$renderer3.push(` `);
        if (meta()?.contextPercent != null) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="composer__context svelte-12tdgqe" data-testid="context-usage">`);
          push_element($$renderer3, "div", 1003, 12);
          $$renderer3.push(`<div class="composer__context-track svelte-12tdgqe">`);
          push_element($$renderer3, "div", 1004, 14);
          $$renderer3.push(`<div class="composer__context-fill svelte-12tdgqe"${attr_style(`width: ${stringify(Math.min(100, meta().contextPercent))}%`)}>`);
          push_element($$renderer3, "div", 1005, 16);
          $$renderer3.push(`</div>`);
          pop_element();
          $$renderer3.push(` `);
          Tooltip($$renderer3, {
            class: "composer__context-marker",
            style: `left: ${stringify(autoCompactPercent())}%`,
            text: autoCompactTokens() != null ? `Auto-compacts at ${fmtTokens(autoCompactTokens())} tokens` : `Auto-compacts at ${Math.round(autoCompactPercent())}%`
          });
          $$renderer3.push(`<!----></div>`);
          pop_element();
          $$renderer3.push(` <span class="composer__context-label svelte-12tdgqe">`);
          push_element($$renderer3, "span", 1014, 14);
          $$renderer3.push(`${escape_html(fmtTokens(meta().contextTokens))} / ${escape_html(fmtTokens(meta().contextWindow))} `);
          if (meta().contextPercent > 30 && !running()) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<button class="composer__context-compact svelte-12tdgqe" data-testid="compact-button"${attr("title", `Compact context (auto-compacts at ${stringify(Math.round(autoCompactPercent()))}%)`)}>`);
            push_element($$renderer3, "button", 1017, 18);
            $$renderer3.push(`Compact</button>`);
            pop_element();
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--></span>`);
          pop_element();
          $$renderer3.push(`</div>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
          $$renderer3.push(`<div class="composer__context svelte-12tdgqe">`);
          push_element($$renderer3, "div", 1027, 12);
          $$renderer3.push(`<div class="composer__context-track svelte-12tdgqe">`);
          push_element($$renderer3, "div", 1028, 14);
          $$renderer3.push(`</div>`);
          pop_element();
          $$renderer3.push(` <span class="composer__context-label svelte-12tdgqe">`);
          push_element($$renderer3, "span", 1029, 14);
          $$renderer3.push(`Context —</span>`);
          pop_element();
          $$renderer3.push(`</div>`);
          pop_element();
        }
        $$renderer3.push(`<!--]--></div>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(` <div class="composer__footer-row svelte-12tdgqe">`);
        push_element($$renderer3, "div", 1036, 6);
        $$renderer3.push(`<div class="composer__controls svelte-12tdgqe">`);
        push_element($$renderer3, "div", 1037, 8);
        $$renderer3.push(`<span class="composer__key-mount composer__key-mount--mode svelte-12tdgqe">`);
        push_element($$renderer3, "span", 1039, 10);
        $$renderer3.push(`<button${attr_class(`composer-mode ${draft().mode === "plan" ? "composer-mode--plan" : ""}`, "svelte-12tdgqe")}${attr("aria-pressed", draft().mode === "plan")}${attr("aria-label", `Composer mode: ${draft().mode === "plan" ? "Plan" : "Build"}`)} data-testid="mode-toggle" title="⌘B build · ⌘P plan">`);
        push_element($$renderer3, "button", 1040, 12);
        $$renderer3.push(`<span${attr_class(`composer-mode__label ${draft().mode !== "plan" ? "composer-mode__label--active" : ""}`, "svelte-12tdgqe")}>`);
        push_element($$renderer3, "span", 1048, 14);
        $$renderer3.push(`Build</span>`);
        pop_element();
        $$renderer3.push(` <span class="composer-mode__track svelte-12tdgqe" aria-hidden="true">`);
        push_element($$renderer3, "span", 1049, 14);
        $$renderer3.push(`<span class="composer-mode__thumb svelte-12tdgqe">`);
        push_element($$renderer3, "span", 1049, 68);
        $$renderer3.push(`</span>`);
        pop_element();
        $$renderer3.push(`</span>`);
        pop_element();
        $$renderer3.push(` <span${attr_class(`composer-mode__label ${draft().mode === "plan" ? "composer-mode__label--active" : ""}`, "svelte-12tdgqe")}>`);
        push_element($$renderer3, "span", 1050, 14);
        $$renderer3.push(`Plan</span>`);
        pop_element();
        $$renderer3.push(`</button>`);
        pop_element();
        $$renderer3.push(`</span>`);
        pop_element();
        $$renderer3.push(` `);
        ModelSelector($$renderer3, {
          model: meta()?.model ?? null,
          models: sessionMetas.models,
          allModels: sessionMetas.allModels,
          onPick: pickModel,
          onRequestModels: () => sessionMetas.loadModels(thread.id),
          onRequestAllModels: () => sessionMetas.loadAllModels(thread.id),
          onToggleScoped: (provider, id2, scoped) => sessionMetas.setModelScoped(thread.id, provider, id2, scoped)
        });
        $$renderer3.push(`<!----> `);
        if (meta() && meta().availableThinkingLevels.length >= 1) {
          $$renderer3.push("<!--[0-->");
          ReasoningDial($$renderer3, {
            level: meta().thinkingLevel,
            available: meta().availableThinkingLevels,
            onCycle: cycleThinking
          });
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        QuickSlots($$renderer3, {
          commands: [...systemCommandList, ...commands],
          cavemanEnabled: caveman.enabled,
          onToggleCaveman: toggleCaveman,
          onInjectSkill: injectSkill,
          onRunCommand: (cmd) => runSlashCommand(cmd, ""),
          onRunSystem: (name) => runSystemCommand(name, ""),
          onRunRaw: runRawCommand,
          onRequestCommands: ensureCommands,
          onAutoDetect: (kind, name) => api.invoke("resources:inspectSlotCommand", thread.projectId, kind, name)
        });
        $$renderer3.push(`<!----></div>`);
        pop_element();
        $$renderer3.push(` <div class="composer__actions svelte-12tdgqe">`);
        push_element($$renderer3, "div", 1089, 8);
        if (running() && !draft().text.trim() && !compacting()) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<button class="send-dial send-dial--stop svelte-12tdgqe" data-testid="abort" title="Stop run" aria-label="Stop run">`);
          push_element($$renderer3, "button", 1091, 12);
          $$renderer3.push(`<svg viewBox="0 0 24 24" fill="currentColor" class="svelte-12tdgqe">`);
          push_element($$renderer3, "svg", 1098, 14);
          $$renderer3.push(`<rect x="7" y="7" width="10" height="10" rx="2" class="svelte-12tdgqe">`);
          push_element($$renderer3, "rect", 1098, 59);
          $$renderer3.push(`</rect>`);
          pop_element();
          $$renderer3.push(`</svg>`);
          pop_element();
          $$renderer3.push(`</button>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
          $$renderer3.push(`<button${attr_class(`send-dial ${""}`, "svelte-12tdgqe")} data-press="self"${attr("disabled", compacting(), true)}${attr("data-has-input", draft().text.trim() || draft().attachments.length > 0 ? "" : void 0)} data-testid="send"${attr("title", compacting() ? "Compacting…" : running() ? "Queue message" : "Send message")}${attr("aria-label", compacting() ? "Compacting" : running() ? "Queue message" : "Send message")}${attr("aria-busy", compacting() ? "true" : void 0)}>`);
          push_element($$renderer3, "button", 1101, 12);
          $$renderer3.push(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="svelte-12tdgqe">`);
          push_element($$renderer3, "svg", 1116, 14);
          $$renderer3.push(`<path d="M12 19V5M5 12l7-7 7 7" class="svelte-12tdgqe">`);
          push_element($$renderer3, "path", 1116, 139);
          $$renderer3.push(`</path>`);
          pop_element();
          $$renderer3.push(`</svg>`);
          pop_element();
          $$renderer3.push(`</button>`);
          pop_element();
        }
        $$renderer3.push(`<!--]--></div>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(` `);
        if (!centered) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<button class="btw-btn btw-btn--floating svelte-12tdgqe" data-press="self"${attr("data-has-input", sideChat.open && sideChat.threadId === thread.id && sideChat.draft.trim() && !sideChat.streaming ? "" : void 0)} data-testid="open-side-chat" title="Side conversation (/btw) — ask a quick question without touching this task" aria-label="Open side conversation">`);
          push_element($$renderer3, "button", 1128, 2);
          $$renderer3.push(`<span class="btw-btn__label svelte-12tdgqe">`);
          push_element($$renderer3, "span", 1155, 4);
          $$renderer3.push(`BTW</span>`);
          pop_element();
          $$renderer3.push(`</button>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        Model_scope_select($$renderer3, { floating: true });
        $$renderer3.push(`<!----></footer>`);
        pop_element();
      }
      do {
        $$settled = true;
        $$inner_renderer = $$renderer2.copy();
        $$render_inner($$inner_renderer);
      } while (!$$settled);
      $$renderer2.subsume($$inner_renderer);
    },
    Composer
  );
}
Composer.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
GitWidget[FILENAME] = "src/desktop-renderer/app/GitWidget.svelte";
function GitWidget($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { thread } = $$props;
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    },
    GitWidget
  );
}
GitWidget.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
DevTapWidget[FILENAME] = "src/desktop-renderer/app/DevTapWidget.svelte";
function DevTapWidget($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        thread,
        onSelectThread
        /** Navigate to the install thread once it's created. */
      } = $$props;
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    },
    DevTapWidget
  );
}
DevTapWidget.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Arrow_down_to_dot[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/arrow-down-to-dot.svelte";
function Arrow_down_to_dot($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["path", { "d": "M12 2v14" }],
        ["path", { "d": "m19 9-7 7-7-7" }],
        ["circle", { "cx": "12", "cy": "21", "r": "1" }]
      ];
      Icon($$renderer2, spread_props([{ name: "arrow-down-to-dot" }, props, { iconNode }]));
    },
    Arrow_down_to_dot
  );
}
Arrow_down_to_dot.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Folder_open[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/folder-open.svelte";
function Folder_open($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "folder-open" }, props, { iconNode }]));
    },
    Folder_open
  );
}
Folder_open.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Play[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/play.svelte";
function Play($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "play" }, props, { iconNode }]));
    },
    Play
  );
}
Play.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Git_pull_request[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/git-pull-request.svelte";
function Git_pull_request($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["circle", { "cx": "18", "cy": "18", "r": "3" }],
        ["circle", { "cx": "6", "cy": "6", "r": "3" }],
        ["path", { "d": "M13 6h3a2 2 0 0 1 2 2v7" }],
        ["line", { "x1": "6", "x2": "6", "y1": "9", "y2": "21" }]
      ];
      Icon($$renderer2, spread_props([{ name: "git-pull-request" }, props, { iconNode }]));
    },
    Git_pull_request
  );
}
Git_pull_request.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const SKILL_RE = /^<skill name="([^"]*)" location="([^"]*)">\n([\s\S]*?)\n<\/skill>/;
function parseSkillInvocation(text) {
  const m = SKILL_RE.exec(text);
  if (!m) return null;
  const [matched, name, location, inner] = m;
  let body = (inner ?? "").trim();
  const ref = /^References are relative to [^\n]*\n+/.exec(body);
  if (ref) body = body.slice(ref[0].length);
  return {
    name: name ?? "",
    location: location ?? "",
    body,
    args: text.slice(matched.length).trim()
  };
}
MessageBadges[FILENAME] = "src/desktop-renderer/app/MessageBadges.svelte";
function MessageBadges($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        text,
        variant = "rich",
        connLogos = /* @__PURE__ */ new Map(),
        children
        /** name → logoUrl (rich variant only). */
      } = $$props;
      const conn = derived(() => parseConnectionsHint(text));
      const sec = derived(() => parseSecretsHint(conn() ? conn().body : text));
      const body = derived(() => sec() ? sec().body : conn() ? conn().body : text);
      if (conn()) {
        $$renderer2.push("<!--[0-->");
        if (variant === "rich") {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="flex flex-wrap justify-end gap-1.5" data-testid="connection-badges">`);
          push_element($$renderer2, "div", 40, 4);
          $$renderer2.push(`<!--[-->`);
          const each_array = ensure_array_like(conn().connections);
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let c = each_array[$$index];
            $$renderer2.push(`<span class="inline-flex items-center gap-1.5 rounded-full border border-border-strong/50 bg-surface-2/80 py-0.5 pl-1 pr-2.5 text-[11.5px] font-medium text-fg-soft"${attr("title", `${c.kind === "custom" ? "Custom connection" : "Composio toolkit"}: ${c.name}`)}>`);
            push_element($$renderer2, "span", 42, 8);
            ConnectorIcon($$renderer2, {
              logoUrl: connLogos.get(c.name) ?? null,
              label: c.name,
              size: 16
            });
            $$renderer2.push(`<!----> <span>`);
            push_element($$renderer2, "span", 47, 10);
            $$renderer2.push(`@${escape_html(c.name)}</span>`);
            pop_element();
            $$renderer2.push(`</span>`);
            pop_element();
          }
          $$renderer2.push(`<!--]--></div>`);
          pop_element();
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<div class="msg-badges-row svelte-z9quyb">`);
          push_element($$renderer2, "div", 52, 4);
          $$renderer2.push(`<!--[-->`);
          const each_array_1 = ensure_array_like(conn().connections);
          for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
            let c = each_array_1[$$index_1];
            $$renderer2.push(`<span class="msg-badge svelte-z9quyb">`);
            push_element($$renderer2, "span", 53, 59);
            $$renderer2.push(`@${escape_html(c.name)}</span>`);
            pop_element();
          }
          $$renderer2.push(`<!--]--></div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (sec()) {
        $$renderer2.push("<!--[0-->");
        if (variant === "rich") {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<div class="flex flex-wrap justify-end gap-1.5" data-testid="secret-badges">`);
          push_element($$renderer2, "div", 59, 4);
          $$renderer2.push(`<!--[-->`);
          const each_array_2 = ensure_array_like(sec().secrets);
          for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
            let s = each_array_2[$$index_2];
            $$renderer2.push(`<span class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 py-0.5 pl-1 pr-2.5 text-[11.5px] font-medium text-amber-700"${attr("title", `BWS secret: ${s.name}`)}>`);
            push_element($$renderer2, "span", 61, 8);
            Key_round($$renderer2, { size: 14, class: "shrink-0" });
            $$renderer2.push(`<!----> <span class="font-mono">`);
            push_element($$renderer2, "span", 66, 10);
            $$renderer2.push(`@${escape_html(s.name)}</span>`);
            pop_element();
            $$renderer2.push(`</span>`);
            pop_element();
          }
          $$renderer2.push(`<!--]--></div>`);
          pop_element();
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<div class="msg-badges-row svelte-z9quyb">`);
          push_element($$renderer2, "div", 71, 4);
          $$renderer2.push(`<!--[-->`);
          const each_array_3 = ensure_array_like(sec().secrets);
          for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
            let s = each_array_3[$$index_3];
            $$renderer2.push(`<span class="msg-badge msg-badge--secret svelte-z9quyb">`);
            push_element($$renderer2, "span", 72, 37);
            $$renderer2.push(`@${escape_html(s.name)}</span>`);
            pop_element();
          }
          $$renderer2.push(`<!--]--></div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      children($$renderer2, { body: body() });
      $$renderer2.push(`<!---->`);
    },
    MessageBadges
  );
}
MessageBadges.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
StreamingText[FILENAME] = "src/desktop-renderer/app/StreamingText.svelte";
const revealMemory = /* @__PURE__ */ new Map();
function memoryFor(key) {
  let m = revealMemory.get(key);
  if (!m) {
    m = {
      times: /* @__PURE__ */ new Map(),
      prefixHtml: "",
      prefixUpTo: 0,
      occ: /* @__PURE__ */ new Map()
    };
    revealMemory.set(key, m);
  }
  return m;
}
function StreamingText($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        text,
        streaming = true,
        plain = false,
        cursor = false,
        revealKey
        /** Render a blinking caret inline at the end of the streamed text. */
      } = $$props;
      function escapeHtml(s) {
        return s.replace(/[&<>]/g, (c) => c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;");
      }
      const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const WAVE = {
        low: { minMs: 16, maxMs: 72, windowMs: 900 },
        medium: { minMs: 9, maxMs: 52, windowMs: 650 },
        high: { minMs: 5, maxMs: 34, windowMs: 420 }
      };
      const SETTLE_MS = 560 + 240;
      function resolveWave() {
        const raw = document.documentElement.getAttribute("data-stream-speed");
        return WAVE[raw ?? "medium"] ?? WAVE.medium;
      }
      function closeDanglingInlineCode(s) {
        const fences = s.match(/```/g);
        if (fences && fences.length % 2 === 1) return s;
        const ticks = (s.replace(/```/g, "").match(/`/g) ?? []).length;
        return ticks % 2 === 1 ? `${s}\`` : s;
      }
      function safeBlockBoundary(s, from) {
        if (plain) {
          let boundary2 = 0;
          for (let i2 = 0; i2 < from && i2 < s.length; i2 += 1) {
            if (s[i2] === "\n" && i2 + 1 <= from) boundary2 = i2 + 1;
          }
          return boundary2;
        }
        let boundary = 0;
        let inFence = false;
        let i = 0;
        while (i < from && i < s.length) {
          if (s.startsWith("```", i)) {
            inFence = !inFence;
            i += 3;
            continue;
          }
          if (!inFence && s[i] === "\n") {
            let j = i + 1;
            while (j < s.length && (s[j] === " " || s[j] === "	")) j += 1;
            if (j < s.length && s[j] === "\n") {
              const after = j + 1;
              if (after <= from) boundary = after;
            }
          }
          i += 1;
        }
        return boundary;
      }
      const mem = run(() => revealKey ? memoryFor(revealKey) : {
        times: /* @__PURE__ */ new Map(),
        prefixHtml: "",
        prefixUpTo: 0,
        occ: /* @__PURE__ */ new Map()
      });
      let revealed = run(() => text.length);
      resolveWave();
      let firstBuild = true;
      const revealTimes = mem.times;
      const revealHistory = [];
      let lastTail = null;
      let revealIdle = false;
      const displayed = derived(() => {
        const slice = text.slice(0, Math.min(revealed, text.length));
        return plain ? slice : closeDanglingInlineCode(slice);
      });
      function rawHtmlOf(slice) {
        return plain ? escapeHtml(slice) : DOMPurify.sanitize(marked.parse(slice, { async: false, breaks: true }));
      }
      function spanWrap(rawHtml, occ, forceStatic) {
        const doc = new DOMParser().parseFromString(rawHtml, "text/html");
        const now2 = performance.now();
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let n;
        while (n = walker.nextNode()) {
          const node = n;
          if (node.parentElement?.closest("code, pre")) continue;
          if (!node.nodeValue || !node.nodeValue.trim()) continue;
          textNodes.push(node);
        }
        for (const node of textNodes) {
          const parts = node.nodeValue.split(/(\s+)/).filter((p) => p.length > 0);
          const frag = doc.createDocumentFragment();
          for (const part of parts) {
            if (/^\s+$/.test(part)) {
              frag.appendChild(doc.createTextNode(part));
              continue;
            }
            const seen = occ.get(part) ?? 0;
            occ.set(part, seen + 1);
            const key = `${part}\0${seen}`;
            if (!revealTimes.has(key)) {
              revealTimes.set(key, forceStatic || firstBuild ? now2 - 1e6 : now2);
            }
            const span = doc.createElement("span");
            span.className = "sw";
            span.style.animationDelay = `${revealTimes.get(key) - now2}ms`;
            span.textContent = part;
            frag.appendChild(span);
          }
          node.replaceWith(frag);
        }
        return doc.body.innerHTML;
      }
      const html$1 = derived(() => {
        if (reduceMotion || !streaming) {
          return plain ? escapeHtml(displayed()) : DOMPurify.sanitize(marked.parse(displayed(), { async: false, breaks: true }));
        }
        try {
          const now2 = performance.now();
          const lookback = now2 - SETTLE_MS;
          let recent = 0;
          for (let i = revealHistory.length - 1; i >= 0; i--) {
            if (revealHistory[i].t <= lookback) {
              recent = revealHistory[i].idx;
              break;
            }
          }
          const boundary = recent > 0 ? safeBlockBoundary(displayed(), recent) : 0;
          if (boundary < mem.prefixUpTo) {
            mem.prefixUpTo = 0;
            mem.prefixHtml = "";
            mem.occ.clear();
          } else if (boundary > mem.prefixUpTo) {
            const grown = displayed().slice(mem.prefixUpTo, boundary);
            mem.prefixHtml += spanWrap(rawHtmlOf(grown), mem.occ, true);
            mem.prefixUpTo = boundary;
          }
          const tail = displayed().slice(mem.prefixUpTo);
          const caret = cursor && revealIdle;
          if (lastTail && lastTail.text === tail && lastTail.caret === caret) {
            firstBuild = false;
            return mem.prefixHtml + lastTail.html;
          }
          const tailHtml = spanWrap(rawHtmlOf(tail), new Map(mem.occ), false);
          lastTail = { text: tail, caret, html: tailHtml };
          firstBuild = false;
          return mem.prefixHtml + tailHtml;
        } catch {
          return spanWrap(
            plain ? escapeHtml(displayed()) : DOMPurify.sanitize(marked.parse(displayed(), { async: false, breaks: true })),
            /* @__PURE__ */ new Map(),
            false
          );
        }
      });
      $$renderer2.push(`<div${attr_class("message-streaming", void 0, { "md": !plain, "message-streaming--plain": plain })}>`);
      push_element($$renderer2, "div", 428, 0);
      $$renderer2.push(`${html(html$1())}</div>`);
      pop_element();
    },
    StreamingText
  );
}
StreamingText.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
ThinkingBlock[FILENAME] = "src/desktop-renderer/app/ThinkingBlock.svelte";
function ThinkingBlock($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      var $$store_subs;
      let { text, streaming = true, cursor = false, revealKey } = $$props;
      const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const rail = tweened(0, { duration: reduceMotion ? 0 : 110, easing: (t) => t });
      let glideActive = false;
      $$renderer2.push(`<div class="thinking-block svelte-jtw05h">`);
      push_element($$renderer2, "div", 212, 0);
      $$renderer2.push(`<div${attr_class("thinking-scroll svelte-jtw05h", void 0, {
        "glide-active": (
          // Arm the batched follow while pinned to the bottom. Tracks `text` so a
          // burst re-checks the buffer promptly (startFollow no-ops if already armed).
          // When streaming ends we do NOT stop here — followLoop runs a final settle
          // to the exact bottom and self-terminates.
          // Rail height = the visible box height (clientHeight), tweened. The rail is
          // decorative (a 2px side bar trailing the box) and the box already grows
          // visibly as reasoning streams, so continuous tween updates during streaming
          // are pure churn: ResizeObserver fires per layout step, each kick drives a
          // tweened reactive update + re-render of the rail span. Observe only while
          // NOT streaming — the box is static then, so the rail settles to final size.
          // During streaming the rail holds its last-set height; the visible box growth
          // carries the motion. Trailing by a few px is invisible against faint text.
          glideActive
        )
      })}>`);
      push_element($$renderer2, "div", 213, 2);
      StreamingText($$renderer2, { text, streaming, plain: true, cursor, revealKey });
      $$renderer2.push(`<!----></div>`);
      pop_element();
      $$renderer2.push(` <span class="thinking-rail svelte-jtw05h"${attr_style(`height:${stringify(store_get($$store_subs ??= {}, "$rail", rail))}px`)}>`);
      push_element($$renderer2, "span", 216, 2);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
      if ($$store_subs) unsubscribe_stores($$store_subs);
    },
    ThinkingBlock
  );
}
ThinkingBlock.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Copy[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/copy.svelte";
function Copy($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "rect",
          {
            "width": "14",
            "height": "14",
            "x": "8",
            "y": "8",
            "rx": "2",
            "ry": "2"
          }
        ],
        [
          "path",
          {
            "d": "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "copy" }, props, { iconNode }]));
    },
    Copy
  );
}
Copy.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
CopyButton[FILENAME] = "src/desktop-renderer/app/CopyButton.svelte";
function CopyButton($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { text, label = "Copy", class: klass = "" } = $$props;
      $$renderer2.push(`<button type="button"${attr_class(`copy-btn ${stringify(klass)}`)}${attr("title", label)}${attr("aria-label", label)}>`);
      push_element($$renderer2, "button", 27, 0);
      {
        $$renderer2.push("<!--[-1-->");
        Copy($$renderer2, { size: 13 });
        $$renderer2.push(`<!----> <span>`);
        push_element($$renderer2, "span", 39, 4);
        $$renderer2.push(`${escape_html(label)}</span>`);
        pop_element();
      }
      $$renderer2.push(`<!--]--></button>`);
      pop_element();
    },
    CopyButton
  );
}
CopyButton.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
RewindDialog[FILENAME] = "src/desktop-renderer/app/RewindDialog.svelte";
function RewindDialog($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let {
        open = false,
        revertFiles = true,
        canRevert,
        turnCount,
        promptPreview,
        onConfirm
        /** How many turns will drop out of the active conversation. */
        /** The prompt that returns to the composer after rewinding. */
      } = $$props;
      let $$settled = true;
      let $$inner_renderer;
      function $$render_inner($$renderer3) {
        if (Alert_dialog) {
          $$renderer3.push("<!--[-->");
          Alert_dialog($$renderer3, {
            get open() {
              return open;
            },
            set open($$value) {
              open = $$value;
              $$settled = false;
            },
            children: prevent_snippet_stringification(($$renderer4) => {
              if (Portal) {
                $$renderer4.push("<!--[-->");
                Portal($$renderer4, {
                  children: prevent_snippet_stringification(($$renderer5) => {
                    if (Dialog_overlay) {
                      $$renderer5.push("<!--[-->");
                      Dialog_overlay($$renderer5, { class: "fixed inset-0 z-50 bg-black/40" });
                      $$renderer5.push("<!--]-->");
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push("<!--]-->");
                    }
                    $$renderer5.push(` `);
                    if (Alert_dialog_content) {
                      $$renderer5.push("<!--[-->");
                      Alert_dialog_content($$renderer5, {
                        class: "fixed top-1/2 z-50 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-strong bg-surface p-5 shadow-2xl",
                        style: "left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)",
                        "data-testid": "rewind-dialog",
                        children: prevent_snippet_stringification(($$renderer6) => {
                          $$renderer6.push(`<div class="flex items-start gap-3">`);
                          push_element($$renderer6, "div", 32, 6);
                          $$renderer6.push(`<span class="mt-0.5 shrink-0 text-danger">`);
                          push_element($$renderer6, "span", 33, 8);
                          Undo_2($$renderer6, { size: 18 });
                          $$renderer6.push(`<!----></span>`);
                          pop_element();
                          $$renderer6.push(` <div class="min-w-0">`);
                          push_element($$renderer6, "div", 34, 8);
                          if (Dialog_title) {
                            $$renderer6.push("<!--[-->");
                            Dialog_title($$renderer6, {
                              class: "text-sm font-semibold text-fg",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(turnCount <= 1 ? "Rewind this turn?" : `Rewind the last ${turnCount} turns?`)}`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(` `);
                          if (Dialog_description) {
                            $$renderer6.push("<!--[-->");
                            Dialog_description($$renderer6, {
                              class: "mt-1.5 text-[13px] leading-relaxed text-fg-soft",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->This removes ${escape_html(turnCount <= 1 ? "this turn" : `these ${turnCount} turns`)} from the active
            conversation. pi keeps the full history, but you can't fast-forward back to
            ${escape_html(turnCount <= 1 ? "it" : "them")} afterwards.`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(`</div>`);
                          pop_element();
                          $$renderer6.push(`</div>`);
                          pop_element();
                          $$renderer6.push(` `);
                          if (promptPreview) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<div class="mt-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2">`);
                            push_element($$renderer6, "div", 47, 8);
                            $$renderer6.push(`<p class="text-[10px] font-medium uppercase tracking-wide text-fainter">`);
                            push_element($$renderer6, "p", 48, 10);
                            $$renderer6.push(`Returns to composer</p>`);
                            pop_element();
                            $$renderer6.push(` <p class="mt-0.5 line-clamp-3 text-[13px] text-fg-soft whitespace-pre-wrap">`);
                            push_element($$renderer6, "p", 49, 10);
                            $$renderer6.push(`${escape_html(promptPreview)}</p>`);
                            pop_element();
                            $$renderer6.push(`</div>`);
                            pop_element();
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--> `);
                          if (canRevert) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<label class="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-danger-border/40 bg-danger-surface/20 px-3 py-2">`);
                            push_element($$renderer6, "label", 54, 8);
                            $$renderer6.push(`<input type="checkbox" class="mt-0.5 accent-danger"${attr("checked", revertFiles, true)} data-testid="rewind-revert"/>`);
                            push_element($$renderer6, "input", 57, 10);
                            pop_element();
                            $$renderer6.push(` <span class="text-[13px] text-fg-soft">`);
                            push_element($$renderer6, "span", 58, 10);
                            $$renderer6.push(`<span class="font-medium text-fg">`);
                            push_element($$renderer6, "span", 59, 12);
                            $$renderer6.push(`Revert file changes</span>`);
                            pop_element();
                            $$renderer6.push(` made during
            ${escape_html(turnCount <= 1 ? "this turn" : "these turns")}. <span class="text-faint">`);
                            push_element($$renderer6, "span", 61, 12);
                            $$renderer6.push(`Restores the working tree to its earlier state and permanently
            discards later changes, including new files — this can't be undone.</span>`);
                            pop_element();
                            $$renderer6.push(`</span>`);
                            pop_element();
                            $$renderer6.push(`</label>`);
                            pop_element();
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--> <div class="mt-4 flex justify-end gap-2">`);
                          push_element($$renderer6, "div", 67, 6);
                          if (Alert_dialog_cancel) {
                            $$renderer6.push("<!--[-->");
                            Alert_dialog_cancel($$renderer6, {
                              class: "rounded-lg border border-border px-3 py-1.5 text-[13px] text-fg-soft hover:bg-surface-2",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->Cancel`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(` `);
                          if (Alert_dialog_action) {
                            $$renderer6.push("<!--[-->");
                            Alert_dialog_action($$renderer6, {
                              onclick: onConfirm,
                              "data-testid": "rewind-confirm",
                              class: "rounded-lg border border-danger-border/60 bg-danger-surface/50 px-3 py-1.5 text-[13px] font-medium text-danger hover:bg-danger-surface/80",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(canRevert && revertFiles ? "Rewind & revert files" : "Rewind")}`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(`</div>`);
                          pop_element();
                        }),
                        $$slots: { default: true }
                      });
                      $$renderer5.push("<!--]-->");
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push("<!--]-->");
                    }
                  })
                });
                $$renderer4.push("<!--]-->");
              } else {
                $$renderer4.push("<!--[!-->");
                $$renderer4.push("<!--]-->");
              }
            }),
            $$slots: { default: true }
          });
          $$renderer3.push("<!--]-->");
        } else {
          $$renderer3.push("<!--[!-->");
          $$renderer3.push("<!--]-->");
        }
      }
      do {
        $$settled = true;
        $$inner_renderer = $$renderer2.copy();
        $$render_inner($$inner_renderer);
      } while (!$$settled);
      $$renderer2.subsume($$inner_renderer);
      bind_props($$props, { open, revertFiles });
    },
    RewindDialog
  );
}
RewindDialog.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
ForkPickerDialog[FILENAME] = "src/desktop-renderer/app/ForkPickerDialog.svelte";
function ForkPickerDialog($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { open = false, turns, onPick } = $$props;
      let selected = null;
      const selectedIndex = derived(() => -1);
      const inRange = (i) => selectedIndex() >= 0 && i <= selectedIndex();
      function confirm() {
        return;
      }
      let $$settled = true;
      let $$inner_renderer;
      function $$render_inner($$renderer3) {
        if (Alert_dialog) {
          $$renderer3.push("<!--[-->");
          Alert_dialog($$renderer3, {
            get open() {
              return open;
            },
            set open($$value) {
              open = $$value;
              $$settled = false;
            },
            children: prevent_snippet_stringification(($$renderer4) => {
              if (Portal) {
                $$renderer4.push("<!--[-->");
                Portal($$renderer4, {
                  children: prevent_snippet_stringification(($$renderer5) => {
                    if (Dialog_overlay) {
                      $$renderer5.push("<!--[-->");
                      Dialog_overlay($$renderer5, { class: "fixed inset-0 z-50 bg-black/40" });
                      $$renderer5.push("<!--]-->");
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push("<!--]-->");
                    }
                    $$renderer5.push(` `);
                    if (Alert_dialog_content) {
                      $$renderer5.push("<!--[-->");
                      Alert_dialog_content($$renderer5, {
                        class: "fixed top-1/2 z-50 flex max-h-[70vh] w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-strong bg-surface p-5 shadow-2xl",
                        style: "left: calc(var(--content-left, 0px) + (100vw - var(--content-left, 0px)) / 2)",
                        "data-testid": "fork-picker",
                        children: prevent_snippet_stringification(($$renderer6) => {
                          $$renderer6.push(`<div class="flex items-start gap-3">`);
                          push_element($$renderer6, "div", 54, 6);
                          $$renderer6.push(`<span class="mt-0.5 shrink-0 text-accent">`);
                          push_element($$renderer6, "span", 55, 8);
                          Git_branch($$renderer6, { size: 18 });
                          $$renderer6.push(`<!----></span>`);
                          pop_element();
                          $$renderer6.push(` <div class="min-w-0">`);
                          push_element($$renderer6, "div", 56, 8);
                          if (Dialog_title) {
                            $$renderer6.push("<!--[-->");
                            Dialog_title($$renderer6, {
                              class: "text-sm font-semibold text-fg",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->Fork into a new thread`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(` `);
                          if (Dialog_description) {
                            $$renderer6.push("<!--[-->");
                            Dialog_description($$renderer6, {
                              class: "mt-1 text-[13px] leading-relaxed text-fg-soft",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->Pick how far back to fork. Everything up to and including the marked turn
            becomes the new thread's starting context; its prompt is copied to the
            composer so you can rework it before sending.`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(`</div>`);
                          pop_element();
                          $$renderer6.push(`</div>`);
                          pop_element();
                          $$renderer6.push(` <div class="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface-2/30">`);
                          push_element($$renderer6, "div", 68, 6);
                          if (turns.length === 0) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<p class="px-3 py-6 text-center text-[13px] text-faint">`);
                            push_element($$renderer6, "p", 70, 10);
                            $$renderer6.push(`No turns to fork from yet.</p>`);
                            pop_element();
                          } else {
                            $$renderer6.push("<!--[-1-->");
                            $$renderer6.push(`<ul class="divide-y divide-border/60">`);
                            push_element($$renderer6, "ul", 74, 10);
                            $$renderer6.push(`<!--[-->`);
                            const each_array = ensure_array_like(turns);
                            for (let i = 0, $$length = each_array.length; i < $$length; i++) {
                              let turn = each_array[i];
                              $$renderer6.push(`<li>`);
                              push_element($$renderer6, "li", 76, 14);
                              $$renderer6.push(`<button type="button"${attr_class("fork-row flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-2/60 svelte-wf4mk2", void 0, {
                                "in-range": inRange(i),
                                "fork-head": selected === turn.entryId
                              })} data-testid="fork-picker-turn">`);
                              push_element($$renderer6, "button", 77, 16);
                              $$renderer6.push(`<span${attr_class(`mt-1 h-3 w-3 shrink-0 rounded-full border border-border-strong ${inRange(i) ? "bg-accent border-accent" : "bg-transparent"}`)}>`);
                              push_element($$renderer6, "span", 85, 18);
                              $$renderer6.push(`</span>`);
                              pop_element();
                              $$renderer6.push(` <span${attr_class(`min-w-0 line-clamp-2 text-[13px] ${inRange(i) ? "text-fg" : "text-fg-soft"} whitespace-pre-wrap break-words`)}>`);
                              push_element($$renderer6, "span", 90, 18);
                              $$renderer6.push(`${escape_html(turn.text || "(empty)")}</span>`);
                              pop_element();
                              $$renderer6.push(`</button>`);
                              pop_element();
                              $$renderer6.push(`</li>`);
                              pop_element();
                            }
                            $$renderer6.push(`<!--]--></ul>`);
                            pop_element();
                          }
                          $$renderer6.push(`<!--]--></div>`);
                          pop_element();
                          $$renderer6.push(` <div class="mt-4 flex justify-end gap-2">`);
                          push_element($$renderer6, "div", 100, 6);
                          if (Alert_dialog_cancel) {
                            $$renderer6.push("<!--[-->");
                            Alert_dialog_cancel($$renderer6, {
                              class: "rounded-lg border border-border px-3 py-1.5 text-[13px] text-fg-soft hover:bg-surface-2",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->Cancel`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(` `);
                          if (Alert_dialog_action) {
                            $$renderer6.push("<!--[-->");
                            Alert_dialog_action($$renderer6, {
                              onclick: confirm,
                              disabled: !selected,
                              "data-testid": "fork-picker-confirm",
                              class: "rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent/20 disabled:opacity-40 disabled:hover:bg-accent/10",
                              children: prevent_snippet_stringification(($$renderer7) => {
                                $$renderer7.push(`<!---->Fork here`);
                              }),
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(`</div>`);
                          pop_element();
                        }),
                        $$slots: { default: true }
                      });
                      $$renderer5.push("<!--]-->");
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push("<!--]-->");
                    }
                  })
                });
                $$renderer4.push("<!--]-->");
              } else {
                $$renderer4.push("<!--[!-->");
                $$renderer4.push("<!--]-->");
              }
            }),
            $$slots: { default: true }
          });
          $$renderer3.push("<!--]-->");
        } else {
          $$renderer3.push("<!--[!-->");
          $$renderer3.push("<!--]-->");
        }
      }
      do {
        $$settled = true;
        $$inner_renderer = $$renderer2.copy();
        $$render_inner($$inner_renderer);
      } while (!$$settled);
      $$renderer2.subsume($$inner_renderer);
      bind_props($$props, { open });
    },
    ForkPickerDialog
  );
}
ForkPickerDialog.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
WorkingLabel[FILENAME] = "src/desktop-renderer/app/WorkingLabel.svelte";
function WorkingLabel($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { label } = $$props;
      $$renderer2.push(`<span class="working-label">`);
      push_element($$renderer2, "span", 9, 0);
      BrailleSpinner($$renderer2, { class: "working-label__spinner" });
      $$renderer2.push(`<!----> <span class="working-label__text">`);
      push_element($$renderer2, "span", 11, 2);
      $$renderer2.push(`${escape_html(label)}</span>`);
      pop_element();
      $$renderer2.push(`</span>`);
      pop_element();
    },
    WorkingLabel
  );
}
WorkingLabel.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Compass[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/compass.svelte";
function Compass($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        ["circle", { "cx": "12", "cy": "12", "r": "10" }],
        [
          "path",
          {
            "d": "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"
          }
        ]
      ];
      Icon($$renderer2, spread_props([{ name: "compass" }, props, { iconNode }]));
    },
    Compass
  );
}
Compass.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Shield_check[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/shield-check.svelte";
function Shield_check($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
          }
        ],
        ["path", { "d": "m9 12 2 2 4-4" }]
      ];
      Icon($$renderer2, spread_props([{ name: "shield-check" }, props, { iconNode }]));
    },
    Shield_check
  );
}
Shield_check.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Telescope[FILENAME] = "/Users/admin/Documents/2. coding projects.nosync/peach-pi/node_modules/@lucide/svelte/dist/icons/telescope.svelte";
function Telescope($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { $$slots, $$events, ...props } = $$props;
      const iconNode = [
        [
          "path",
          {
            "d": "m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44"
          }
        ],
        ["path", { "d": "m13.56 11.747 4.332-.924" }],
        ["path", { "d": "m16 21-3.105-6.21" }],
        [
          "path",
          {
            "d": "M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z"
          }
        ],
        ["path", { "d": "m6.158 8.633 1.114 4.456" }],
        ["path", { "d": "m8 21 3.105-6.21" }],
        ["circle", { "cx": "12", "cy": "13", "r": "2" }]
      ];
      Icon($$renderer2, spread_props([{ name: "telescope" }, props, { iconNode }]));
    },
    Telescope
  );
}
Telescope.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
function collectAgents(items) {
  const entities = /* @__PURE__ */ new Map();
  const primaryNamesByCall = /* @__PURE__ */ new Map();
  for (const item of items) {
    if (item.kind !== "subagent") continue;
    const sub = item;
    const verb = sub.verb === "resume" ? "Resume" : "Spawn";
    for (const row of sub.rows) {
      const event = { ...row, callId: sub.id, createdAt: sub.createdAt, verb };
      let entity = entities.get(row.name);
      if (!entity) {
        entity = {
          name: row.name,
          agent: row.agent,
          primaryCallId: sub.id,
          events: []
        };
        entities.set(row.name, entity);
        const names = primaryNamesByCall.get(sub.id) ?? [];
        names.push(row.name);
        primaryNamesByCall.set(sub.id, names);
      }
      if (!entity.agent && row.agent) entity.agent = row.agent;
      entity.events.push(event);
    }
  }
  return { entities, primaryNamesByCall };
}
class ActivityLog {
  byName = new SvelteMap();
  /** Append `activity` for `name` if it differs from the last recorded one. */
  record(name, activity) {
    if (!activity) return;
    const log = this.byName.get(name) ?? [];
    if (log[log.length - 1]?.activity === activity) return;
    this.byName.set(name, [...log, { activity, at: Date.now() }]);
  }
  logFor(name) {
    return this.byName.get(name) ?? [];
  }
}
const activityLog = new ActivityLog();
function formatRelativeTime(value) {
  if (!value) return "";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 6e4));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
function eventTime(ev, seq) {
  const t = Date.parse(ev.createdAt);
  return Number.isNaN(t) ? seq : t;
}
function relAt(t) {
  const rel = formatRelativeTime(new Date(t).toISOString());
  return rel === "now" ? "Now" : rel === "" ? "" : `${rel} ago`;
}
function shortenTitle(raw) {
  return raw.trim().replace(/\s+/g, " ").replace(/[…\.\s]+$/u, "");
}
function isGruntActivity(raw) {
  const s = raw.trim();
  return /^(?:running|reading)\s+\S+(?:\s+\S+)*\s+\d+\s+files?\b/i.test(s);
}
function attachAsSubtitle(nodes, subtitle) {
  const n = nodes[nodes.length - 1];
  if (!n) return false;
  if (n.tone === "failed" || n.tone === "cancelled" || n.tone === "blocked") return false;
  nodes[nodes.length - 1] = { ...n, subtitle };
  return true;
}
function buildNodes(entity, log, isLive, liveActivity) {
  const merged = [];
  entity.events.forEach((ev, i) => merged.push({ t: eventTime(ev, i), kind: "event", ev }));
  log.forEach((a) => merged.push({ t: a.at, kind: "activity", a }));
  merged.sort((x, y) => x.t - y.t);
  const nodes = [];
  let eventSeen = 0;
  let prevCompleted = false;
  let lastActivityIdx = -1;
  let pendingShimmerIdx = -1;
  for (const u of merged) {
    if (u.kind === "event") {
      eventSeen += 1;
      const ev = u.ev;
      if (eventSeen > 1 && !prevCompleted) {
        nodes.push({
          id: `${ev.callId}-block`,
          tone: "blocked",
          title: "Paused — awaiting input",
          at: relAt(u.t)
        });
      }
      const first = eventSeen === 1;
      if (first && ev.verb === "Spawn" && isLive) {
        pendingShimmerIdx = nodes.length;
        nodes.push({
          id: `${ev.callId}-pending`,
          tone: "pending",
          title: "",
          at: relAt(u.t)
        });
        prevCompleted = ev.status === "completed";
        continue;
      }
      const title = ev.verb === "Resume" ? "Resumed by user" : first ? "Spawned" : "Relaunched";
      const subtitle = ev.verb === "Resume" ? ev.task ? `“${ev.task}”` : void 0 : first ? ev.task : ev.summary ?? ev.task;
      nodes.push({
        id: `${ev.callId}-${eventSeen}`,
        tone: "done",
        title,
        subtitle,
        at: relAt(u.t)
      });
      prevCompleted = ev.status === "completed";
    } else {
      const raw = u.a.activity;
      if (/^(?:thinking|working)[.……]$/i.test(raw)) continue;
      if (pendingShimmerIdx >= 0) {
        nodes[pendingShimmerIdx] = {
          id: `act-${u.t}`,
          tone: "done",
          title: shortenTitle(raw),
          fullTitle: raw,
          at: relAt(u.t)
        };
        lastActivityIdx = pendingShimmerIdx;
        pendingShimmerIdx = -1;
      } else if (isGruntActivity(raw) && attachAsSubtitle(nodes, raw)) {
        lastActivityIdx = nodes.length - 1;
      } else {
        lastActivityIdx = nodes.length;
        nodes.push({
          id: `act-${u.t}`,
          tone: "done",
          title: shortenTitle(raw),
          fullTitle: raw,
          at: relAt(u.t)
        });
      }
    }
  }
  if (isLive) {
    if (pendingShimmerIdx >= 0) {
      const cur = nodes[pendingShimmerIdx];
      nodes[pendingShimmerIdx] = { ...cur, tone: "pending", at: "Now" };
      return nodes;
    }
    const raw = liveActivity ?? "Working…";
    const current = /^(?:thinking|working)/i.test(raw) ? "Working…" : shortenTitle(raw);
    if (lastActivityIdx >= 0 && nodes[lastActivityIdx].title === current) {
      const n = nodes[lastActivityIdx];
      nodes[lastActivityIdx] = {
        ...n,
        tone: "active",
        at: "Now",
        title: current,
        fullTitle: n.fullTitle ?? n.title
      };
    } else {
      nodes.push({
        id: "act-now",
        tone: "active",
        title: current,
        fullTitle: raw,
        at: "Now"
      });
    }
  } else {
    const last = entity.events[entity.events.length - 1];
    if (last && (last.status === "failed" || last.status === "cancelled")) {
      nodes.push({
        id: `${last.callId}-term`,
        tone: last.status,
        title: last.status === "failed" ? "Failed" : "Cancelled",
        subtitle: last.summary,
        at: relAt(eventTime(last, entity.events.length))
      });
    } else if (last?.status === "completed") {
      nodes.push({
        id: `${last.callId}-done`,
        tone: "done",
        title: "Completed",
        subtitle: last.summary,
        at: relAt(eventTime(last, entity.events.length))
      });
    }
  }
  return nodes;
}
function isEntityLive(entity, live) {
  const latest = entity.events[entity.events.length - 1];
  return (latest.status === "running" || latest.status === "started") && live !== void 0;
}
function headState(entity, isLive) {
  if (isLive) return "running";
  const status = entity.events[entity.events.length - 1]?.status;
  if (status === "failed" || status === "cancelled" || status === "completed") return status;
  return "idle";
}
SubagentCard[FILENAME] = "src/desktop-renderer/app/SubagentCard.svelte";
function SubagentCard($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let { entity, live } = $$props;
      const AGENT_KINDS = {
        scout: {
          kind: "scout",
          label: "Scout",
          accent: "#7c5cff",
          Icon: Compass
        },
        verifier: {
          kind: "verifier",
          label: "Verifier",
          accent: "#18a058",
          Icon: Shield_check
        },
        implementer: {
          kind: "implementer",
          label: "Implementer",
          accent: "#f08c2e",
          Icon: Wrench
        },
        researcher: {
          kind: "researcher",
          label: "Researcher",
          accent: "#06b6d4",
          Icon: Telescope
        }
      };
      function agentKind(agent) {
        const key = agent?.trim().toLowerCase();
        if (key && AGENT_KINDS[key]) return AGENT_KINDS[key];
        const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : "Agent";
        return {
          kind: "default",
          label,
          accent: "var(--color-accent)",
          Icon: Sparkles
        };
      }
      let showInstructions = false;
      const kindInfo = derived(() => agentKind(entity.agent));
      const live_ = derived(() => isEntityLive(entity, live));
      const nodes = derived(() => buildNodes(entity, activityLog.logFor(entity.name), live_(), live?.activity));
      const state = derived(() => headState(entity, live_()));
      const stateLabel = derived(() => state() === "running" ? "Active" : state() === "completed" ? "Completed" : state() === "failed" ? "Failed" : state() === "cancelled" ? "Cancelled" : "Idle");
      const stats = derived(() => live_() ? live?.stats ?? [] : []);
      const latest = derived(() => entity.events[entity.events.length - 1]);
      const task = derived(() => latest().task ?? entity.events[0].task);
      let $$settled = true;
      let $$inner_renderer;
      function $$render_inner($$renderer3) {
        $$renderer3.push(`<article class="agent-entity svelte-1tyxolf"${attr("data-agent-kind", kindInfo().kind)}${attr_style(`--ae-accent: ${stringify(kindInfo().accent)}`)} data-testid="subagent-card">`);
        push_element($$renderer3, "article", 88, 0);
        $$renderer3.push(`<header class="agent-entity__header svelte-1tyxolf">`);
        push_element($$renderer3, "header", 89, 2);
        $$renderer3.push(`<span class="agent-entity__badge svelte-1tyxolf" aria-hidden="true">`);
        push_element($$renderer3, "span", 90, 4);
        if (kindInfo().Icon) {
          $$renderer3.push("<!--[-->");
          kindInfo().Icon($$renderer3, { size: 19 });
          $$renderer3.push("<!--]-->");
        } else {
          $$renderer3.push("<!--[!-->");
          $$renderer3.push("<!--]-->");
        }
        $$renderer3.push(`</span>`);
        pop_element();
        $$renderer3.push(` <div class="agent-entity__id svelte-1tyxolf">`);
        push_element($$renderer3, "div", 93, 4);
        $$renderer3.push(`<div class="agent-entity__title-line svelte-1tyxolf">`);
        push_element($$renderer3, "div", 94, 6);
        $$renderer3.push(`<span class="agent-entity__type svelte-1tyxolf">`);
        push_element($$renderer3, "span", 95, 8);
        $$renderer3.push(`${escape_html(kindInfo().label)}</span>`);
        pop_element();
        $$renderer3.push(` <span class="agent-entity__name svelte-1tyxolf">`);
        push_element($$renderer3, "span", 96, 8);
        $$renderer3.push(`${escape_html(entity.name)}</span>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(` <div class="agent-entity__sub svelte-1tyxolf">`);
        push_element($$renderer3, "div", 98, 6);
        $$renderer3.push(`<span${attr_class(`agent-entity__state agent-entity__state--${stringify(state())}`, "svelte-1tyxolf")}>`);
        push_element($$renderer3, "span", 99, 8);
        $$renderer3.push(`${escape_html(stateLabel())}</span>`);
        pop_element();
        $$renderer3.push(` `);
        if (stats().length > 0) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<span class="agent-entity__stats svelte-1tyxolf">`);
          push_element($$renderer3, "span", 102, 30);
          $$renderer3.push(`${escape_html(stats().join(" · "))}</span>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--></div>`);
        pop_element();
        $$renderer3.push(`</div>`);
        pop_element();
        $$renderer3.push(` `);
        if (task()) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<button class="agent-entity__action agent-entity__action--top svelte-1tyxolf" type="button"${attr("aria-expanded", showInstructions)}>`);
          push_element($$renderer3, "button", 106, 6);
          File_text($$renderer3, { size: 14 });
          $$renderer3.push(`<!----> View instructions</button>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--></header>`);
        pop_element();
        $$renderer3.push(` <ol class="agent-entity__journey svelte-1tyxolf">`);
        push_element($$renderer3, "ol", 113, 2);
        $$renderer3.push(`<!--[-->`);
        const each_array = ensure_array_like(nodes());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let node = each_array[$$index];
          $$renderer3.push(`<!---->`);
          {
            $$renderer3.push(`<li${attr_class(`agent-entity__node agent-entity__node--${stringify(node.tone)}`, "svelte-1tyxolf")}>`);
            push_element($$renderer3, "li", 116, 6);
            $$renderer3.push(`<span${attr_class(`agent-entity__marker agent-entity__marker--${stringify(node.tone)}`, "svelte-1tyxolf")} aria-hidden="true">`);
            push_element($$renderer3, "span", 121, 8);
            if (node.tone === "active") {
              $$renderer3.push("<!--[0-->");
              BrailleSpinner($$renderer3, { class: "agent-entity__node-spinner", shape: "triangle" });
            } else if (node.tone === "pending") {
              $$renderer3.push("<!--[1-->");
              $$renderer3.push(`<span class="agent-entity__shimmer-dot svelte-1tyxolf" aria-hidden="true">`);
              push_element($$renderer3, "span", 122, 142);
              $$renderer3.push(`</span>`);
              pop_element();
            } else if (node.tone === "failed" || node.tone === "cancelled") {
              $$renderer3.push("<!--[2-->");
              X($$renderer3, { size: 11 });
            } else if (node.tone === "blocked") {
              $$renderer3.push("<!--[3-->");
              $$renderer3.push(`<span class="agent-entity__node-bang svelte-1tyxolf" aria-hidden="true">`);
              push_element($$renderer3, "span", 122, 319);
              $$renderer3.push(`!</span>`);
              pop_element();
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--></span>`);
            pop_element();
            $$renderer3.push(` <div class="agent-entity__body svelte-1tyxolf">`);
            push_element($$renderer3, "div", 124, 8);
            if (node.tone === "pending") {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<span class="agent-entity__shimmer svelte-1tyxolf" aria-label="Waiting for first activity">`);
              push_element($$renderer3, "span", 126, 12);
              $$renderer3.push(`Spawned</span>`);
              pop_element();
            } else {
              $$renderer3.push("<!--[-1-->");
              $$renderer3.push(`<span class="agent-entity__node-title svelte-1tyxolf"${attr("title", node.fullTitle ?? node.title)}>`);
              push_element($$renderer3, "span", 128, 12);
              $$renderer3.push(`${escape_html(node.title)}</span>`);
              pop_element();
            }
            $$renderer3.push(`<!--]--> `);
            if (node.subtitle) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<p class="agent-entity__node-sub svelte-1tyxolf"${attr("title", node.subtitle)}>`);
              push_element($$renderer3, "p", 130, 29);
              $$renderer3.push(`${escape_html(node.subtitle)}</p>`);
              pop_element();
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--></div>`);
            pop_element();
            $$renderer3.push(`</li>`);
            pop_element();
          }
          $$renderer3.push(`<!---->`);
        }
        $$renderer3.push(`<!--]--></ol>`);
        pop_element();
        $$renderer3.push(` `);
        {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--></article>`);
        pop_element();
      }
      do {
        $$settled = true;
        $$inner_renderer = $$renderer2.copy();
        $$render_inner($$inner_renderer);
      } while (!$$settled);
      $$renderer2.subsume($$inner_renderer);
    },
    SubagentCard
  );
}
SubagentCard.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
class RecordingStore {
  state = {
    status: "idle",
    recordingId: null,
    startedAt: null,
    eventCount: 0,
    message: null,
    skillPath: null
  };
  /** Seconds since startedAt; updated by a 1s interval while recording. */
  elapsed = 0;
  timer = null;
  constructor() {
    void api.invoke("recording:status").then((s) => this.set(s));
    api.on("event:recordingState", (s) => this.set(s));
  }
  set(s) {
    this.state = s;
    if (s.status === "recording" && s.startedAt) {
      this.startTimer(s.startedAt);
    } else {
      this.stopTimer();
      this.elapsed = 0;
    }
  }
  startTimer(startedAt) {
    this.elapsed = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1e3));
    if (this.timer) return;
    this.timer = setInterval(
      () => {
        this.elapsed++;
      },
      1e3
    );
  }
  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  start(threadId) {
    void api.invoke("recording:start", threadId);
  }
  async stop() {
    const r = await api.invoke("recording:stop");
    return { skillPath: r.skillPath, digest: r.digest };
  }
  cancel() {
    void api.invoke("recording:cancel");
  }
  revealSkill(path) {
    void api.invoke("recording:revealSkill", path);
  }
  get isActive() {
    return this.state.status === "recording";
  }
}
new RecordingStore();
class TerminalStore {
  visible = false;
  toggle() {
    this.visible = !this.visible;
  }
  hide() {
    this.visible = false;
  }
}
const terminal = new TerminalStore();
ThreadView[FILENAME] = "src/desktop-renderer/app/ThreadView.svelte";
function ThreadView($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      function groupSummary(items2) {
        const tools = items2.filter((it) => it.kind === "tool");
        const hasThinking = items2.some((it) => it.kind === "assistant");
        if (hasThinking) return tools.length ? `Reasoning · ${tools.length} tool calls` : "Reasoning";
        if (tools.length === 1) return tools[0].toolName || tools[0].argsSummary || "tool";
        return toolBreakdown(tools);
      }
      function groupPrepRuns(all) {
        const out = [];
        let group = [];
        const flush = () => {
          if (group.length === 0) return;
          if (group.length === 1) {
            out.push({ type: "item", item: group[0] });
          } else {
            out.push({
              type: "group",
              id: `group-${group[0].id}`,
              items: group,
              hasThinking: group.some((it) => it.kind === "assistant")
            });
          }
          group = [];
        };
        for (const it of all) {
          const foldable = it.kind === "tool" && it.status === "done" || it.kind === "assistant" && !it.text.trim() && !it.error && !!it.thinking;
          if (foldable) group.push(it);
          else {
            flush();
            out.push({ type: "item", item: it });
          }
        }
        flush();
        return out;
      }
      let connLogos = /* @__PURE__ */ new Map();
      let {
        thread,
        onSetEnvironment,
        onSelectThread,
        onNewThread,
        onCloneThread,
        onForkThread,
        pendingFind,
        onFindConsumed
        /** Flip a brand-new (unsent) thread between its project dir and a worktree. */
        /** Navigate to a thread (used by the DevTap install action). */
        /** Start a new thread in the current project (`/new` system command). */
        /** Clone the current thread's whole active branch into a new thread
         *  (pi `/clone`). */
        /** Fork the current thread up to (excluding) a user-message entry (pi
         *  `/fork`). Pre-fills the new thread's composer with the prompt. */
        /** Set when the search overlay passes a body-match query through. ThreadView
         *  opens its FindBar pre-filled and calls `onFindConsumed` once applied. */
      } = $$props;
      const isWorktree = derived(() => thread.worktreeDir != null);
      let findIndex = 0;
      let devRunning = false;
      function fmtTokens(n) {
        return n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;
      }
      function itemText(it) {
        const i = it;
        return [i.text, i.thinking, i.output, i.summary, i.argsSummary].filter((v) => typeof v === "string").join(" ").toLowerCase();
      }
      const STEER_RE = /^Sub-agent ".+?" completed/;
      function isSteerMessage(item) {
        return typeof item.text === "string" && STEER_RE.test(item.text);
      }
      const findMatches = derived(() => {
        return [];
      });
      const currentMatchId = derived(() => findMatches()[findIndex] ?? null);
      const HL = "thread-find";
      const HL_CUR = "thread-find-current";
      function clearHighlights() {
        const reg = CSS.highlights;
        reg?.delete(HL);
        reg?.delete(HL_CUR);
      }
      onDestroy(clearHighlights);
      const items = derived(() => transcripts.itemsFor(thread.id));
      const isEmpty = derived(() => items().length === 0 && isNewThread(thread.title));
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const agentTimeline = derived(() => collectAgents(items()));
      const fleet = derived(() => {
        const w = extensionUi.widgetsFor(thread.id).find((x) => x.key === FLEET_WIDGET_KEY);
        const parsed = w ? parseFleet(w.lines) : null;
        const map = /* @__PURE__ */ new Map();
        for (const a of parsed?.agents ?? []) map.set(a.name, a);
        return map;
      });
      const rows = derived(() => groupPrepRuns(items()));
      let turns = [];
      let rewound = null;
      let revertFiles = true;
      const canRevert = derived(() => thread.worktreeDir != null || thread.projectId != null);
      let compactionDialogItem = null;
      let rewindDialogOpen = false;
      let pendingRewind = null;
      let forkPickerOpen = false;
      function openForkPicker() {
        if (turns.length === 0) return;
        forkPickerOpen = true;
      }
      function pickFork(entryId) {
        void onForkThread?.(entryId);
      }
      async function doClone() {
        await onCloneThread?.();
      }
      const turnMap = derived(() => mapTurns(items(), turns));
      function openRewindDialog(entryId) {
        const turnIndex = turns.findIndex((t) => t.entryId === entryId);
        if (turnIndex < 0) return;
        pendingRewind = {
          entryId,
          promptPreview: turns[turnIndex].text,
          turnCount: turns.length - turnIndex
        };
        rewindDialogOpen = true;
      }
      function confirmRewind() {
        const p = pendingRewind;
        if (!p) return;
        pendingRewind = null;
        rewindDialogOpen = false;
        void doRewind(p.entryId, canRevert() && revertFiles);
      }
      async function doRewind(entryId, revert) {
        const before = items().slice();
        try {
          const { editorText } = await api.invoke("threads:rewind", thread.id, entryId, revert);
          rewound = {
            threadId: thread.id,
            before,
            beforeLen: before.length,
            settledLen: null
          };
          if (editorText) drafts.update(thread.id, { text: editorText });
        } catch (err) {
          console.error("rewind failed", err);
        }
      }
      function rewindFromEnd(n) {
        if (turns.length === 0) return;
        const target = turns[Math.max(0, turns.length - Math.max(1, n))];
        const keepCount = target ? turnMap().keepByEntry.get(target.entryId) : void 0;
        if (target && keepCount != null) openRewindDialog(target.entryId);
      }
      function toolBreakdown(group) {
        const counts = /* @__PURE__ */ new Map();
        for (const it of group) {
          const name = it.toolName || it.argsSummary || "tool";
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        return [...counts].map(([n, c]) => c > 1 ? `${n} ×${c}` : n).join(" · ");
      }
      let $$settled = true;
      let $$inner_renderer;
      function $$render_inner($$renderer3) {
        $$renderer3.push(`<div class="flex h-full flex-1 flex-col">`);
        push_element($$renderer3, "div", 831, 0);
        $$renderer3.push(`<header class="titlebar-drag flex h-12 shrink-0 items-center gap-2 px-4">`);
        push_element($$renderer3, "header", 832, 2);
        if (isEmpty()) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<span class="truncate text-sm font-medium text-fg-soft">`);
          push_element($$renderer3, "span", 834, 6);
          $$renderer3.push(`${escape_html(thread.title)}</span>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
          $$renderer3.push(`<button type="button" class="truncate text-sm font-medium text-fg-soft cursor-pointer hover:text-accent transition-colors"${attr("title", thread.piSessionFile ? "Click to copy session ID and path" : thread.title)}>`);
          push_element($$renderer3, "button", 836, 4);
          $$renderer3.push(`${escape_html(thread.title)}</button>`);
          pop_element();
          $$renderer3.push(` `);
          {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> <!--[-->`);
          const each_array = ensure_array_like(extensionUi.statusesFor(thread.id));
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let status = each_array[$$index];
            $$renderer3.push(`<span class="shrink-0 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] text-muted">`);
            push_element($$renderer3, "span", 850, 6);
            $$renderer3.push(`${escape_html(status)}</span>`);
            pop_element();
          }
          $$renderer3.push(`<!--]--> `);
          if (thread.remoteHostId) {
            $$renderer3.push("<!--[0-->");
            const inControl = !!remoteClient.id && thread.remoteControllerId === remoteClient.id;
            const controllerName = thread.remoteControllerName ?? "another client";
            $$renderer3.push(`<span${attr_class(`shrink-0 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] ${inControl ? "text-accent" : "text-muted"}`)}${attr("title", inControl ? `You're steering on ${thread.remoteHostName ?? "another machine"}` : `Steered by ${controllerName} on ${thread.remoteHostName ?? "another machine"}`)}>`);
            push_element($$renderer3, "span", 857, 6);
            $$renderer3.push(`⦿ ${escape_html(thread.remoteHostName ?? "remote")} · ${escape_html(inControl ? "in control" : controllerName)}</span>`);
            pop_element();
            $$renderer3.push(` `);
            if (thread.remoteThreadId) {
              $$renderer3.push("<!--[0-->");
              Tooltip($$renderer3, {
                text: inControl ? "Hand back control" : "Take control",
                children: prevent_snippet_stringification(($$renderer4) => {
                  $$renderer4.push(`<button class="rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft" data-testid="control-toggle">`);
                  push_element($$renderer4, "button", 867, 10);
                  $$renderer4.push(`${escape_html(inControl ? "Hand back" : "Take control")}</button>`);
                  pop_element();
                })
              });
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]-->`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> <div class="ml-auto flex items-center gap-1">`);
          push_element($$renderer3, "div", 881, 4);
          if (!thread.remoteHostId) {
            $$renderer3.push("<!--[0-->");
            GitWidget($$renderer3, { thread });
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (thread.projectId) {
            $$renderer3.push("<!--[0-->");
            DevTapWidget($$renderer3, { thread, onSelectThread });
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (!thread.remoteHostId) {
            $$renderer3.push("<!--[0-->");
            Tooltip($$renderer3, {
              text: "Open in Finder",
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<button class="rounded px-2 py-0.5 text-faint hover:bg-surface hover:text-fg-soft" data-testid="open-folder">`);
                push_element($$renderer4, "button", 890, 10);
                Folder_open($$renderer4, { size: 14 });
                $$renderer4.push(`<!----></button>`);
                pop_element();
              })
            });
            $$renderer3.push(`<!----> `);
            Tooltip($$renderer3, {
              text: "Fork thread (new thread from a past turn)",
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<button class="rounded px-2 py-0.5 text-faint hover:bg-surface hover:text-fg-soft disabled:opacity-50"${attr("disabled", !thread.piSessionFile || thread.status === "running" || turns.length === 0, true)} data-testid="fork-thread">`);
                push_element($$renderer4, "button", 898, 10);
                Git_branch($$renderer4, { size: 14 });
                $$renderer4.push(`<!----></button>`);
                pop_element();
              })
            });
            $$renderer3.push(`<!----> `);
            Tooltip($$renderer3, {
              text: "Terminal (⌃`)",
              children: prevent_snippet_stringification(($$renderer4) => {
                $$renderer4.push(`<button${attr_class(`rounded px-2 py-0.5 font-mono text-[11px] ${terminal.visible ? "bg-surface-2 text-fg" : "text-faint hover:bg-surface hover:text-fg-soft"}`)} data-testid="terminal-toggle">`);
                push_element($$renderer4, "button", 907, 10);
                $$renderer4.push(`>_</button>`);
                pop_element();
              })
            });
            $$renderer3.push(`<!----> `);
            if (thread.worktreeId) {
              $$renderer3.push("<!--[0-->");
              Tooltip($$renderer3, {
                text: "Run dev server in this worktree",
                children: prevent_snippet_stringification(($$renderer4) => {
                  $$renderer4.push(`<button class="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft disabled:opacity-50"${attr("disabled", devRunning, true)} data-testid="run-dev-server">`);
                  push_element($$renderer4, "button", 917, 12);
                  Play($$renderer4, { size: 13 });
                  $$renderer4.push(`<!----> ${escape_html("Dev")}</button>`);
                  pop_element();
                })
              });
              $$renderer3.push(`<!----> `);
              Tooltip($$renderer3, {
                text: "Merge this worktree's PR (squash + delete branch)",
                children: prevent_snippet_stringification(($$renderer4) => {
                  $$renderer4.push(`<button class="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft disabled:opacity-50"${attr("disabled", thread.status === "running", true)} data-testid="merge-pr">`);
                  push_element($$renderer4, "button", 926, 12);
                  Git_pull_request($$renderer4, { size: 13 });
                  $$renderer4.push(`<!----> ${escape_html("Merge PR")}</button>`);
                  pop_element();
                })
              });
              $$renderer3.push(`<!---->`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> `);
            {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]-->`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
        }
        $$renderer3.push(`<!--]--></header>`);
        pop_element();
        $$renderer3.push(` `);
        if (!isEmpty()) {
          let toolRow = function($$renderer4, item) {
            validate_snippet_args($$renderer4);
            $$renderer4.push(`<details${attr_class("collapse-anim tool-enter group text-xs", void 0, { "thread-find-hit": item.id === currentMatchId() })}${attr("data-item-id", item.id)}>`);
            push_element($$renderer4, "details", 971, 8);
            $$renderer4.push(`<summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors select-none hover:bg-surface">`);
            push_element($$renderer4, "summary", 972, 10);
            $$renderer4.push(`<span${attr_class(`w-3.5 shrink-0 text-center ${item.status === "error" ? "text-danger" : "text-fainter"}`)}>`);
            push_element($$renderer4, "span", 973, 12);
            $$renderer4.push(`${escape_html(item.status === "error" ? "✕" : item.status !== "running" ? "✓" : "")}</span>`);
            pop_element();
            $$renderer4.push(` <span${attr_class(`font-mono font-medium ${item.status === "running" ? "tool-name--running" : "text-muted"} ${item.toolName ? "shrink-0" : "min-w-0 shrink truncate"}`)}>`);
            push_element($$renderer4, "span", 974, 12);
            $$renderer4.push(`${escape_html(item.toolName || item.argsSummary || "tool")}</span>`);
            pop_element();
            $$renderer4.push(` `);
            if (item.toolName) {
              $$renderer4.push("<!--[0-->");
              $$renderer4.push(`<span class="truncate font-mono text-fainter">`);
              push_element($$renderer4, "span", 978, 14);
              $$renderer4.push(`${escape_html(item.argsSummary)}</span>`);
              pop_element();
            } else {
              $$renderer4.push("<!--[-1-->");
            }
            $$renderer4.push(`<!--]--> <span class="ml-auto shrink-0 text-fainter transition-transform duration-200 ease-out group-open:rotate-90">`);
            push_element($$renderer4, "span", 980, 12);
            $$renderer4.push(`›</span>`);
            pop_element();
            $$renderer4.push(`</summary>`);
            pop_element();
            $$renderer4.push(` `);
            if (item.output) {
              $$renderer4.push("<!--[0-->");
              $$renderer4.push(`<pre class="mx-2 mt-1 max-h-64 overflow-auto rounded-lg border border-border/80 bg-surface/60 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted select-text">`);
              push_element($$renderer4, "pre", 983, 12);
              $$renderer4.push(`${escape_html(item.output)}</pre>`);
              pop_element();
            } else {
              $$renderer4.push("<!--[-1-->");
            }
            $$renderer4.push(`<!--]--></details>`);
            pop_element();
          }, renderRow = function($$renderer4, row) {
            validate_snippet_args($$renderer4);
            if (row.type === "group") {
              $$renderer4.push("<!--[0-->");
              const live = row.items.some((it) => it.kind === "assistant" && it.streaming || it.kind === "tool" && it.status === "running");
              $$renderer4.push(`<details class="collapse-anim tool-enter group/tools -mb-1.5 mt-2 text-xs"${attr("data-item-id", row.id)}${attr("open", live && thread.status === "running", true)}>`);
              push_element($$renderer4, "details", 990, 10);
              $$renderer4.push(`<summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors select-none hover:bg-surface">`);
              push_element($$renderer4, "summary", 991, 12);
              $$renderer4.push(`<span class="shrink-0 text-fainter">`);
              push_element($$renderer4, "span", 992, 14);
              $$renderer4.push(`✓</span>`);
              pop_element();
              $$renderer4.push(` <span class="shrink-0 font-mono font-medium text-muted">`);
              push_element($$renderer4, "span", 993, 14);
              $$renderer4.push(`${escape_html(row.hasThinking ? "Reasoning" : `${row.items.length} tool calls`)}</span>`);
              pop_element();
              $$renderer4.push(` <span class="truncate font-mono text-fainter">`);
              push_element($$renderer4, "span", 994, 14);
              $$renderer4.push(`${escape_html(groupSummary(row.items))}</span>`);
              pop_element();
              $$renderer4.push(` <span class="ml-auto shrink-0 text-fainter transition-transform duration-200 ease-out group-open/tools:rotate-90">`);
              push_element($$renderer4, "span", 995, 14);
              $$renderer4.push(`›</span>`);
              pop_element();
              $$renderer4.push(`</summary>`);
              pop_element();
              $$renderer4.push(` <div class="mt-1 flex flex-col gap-1 border-l-2 border-border pl-1.5">`);
              push_element($$renderer4, "div", 997, 12);
              $$renderer4.push(`<!--[-->`);
              const each_array_1 = ensure_array_like(row.items);
              for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
                let it = each_array_1[$$index_1];
                if (it.kind === "assistant") {
                  $$renderer4.push("<!--[0-->");
                  $$renderer4.push(`<div class="item-enter assistant-message group/assistant text-[13.5px] leading-relaxed text-fg">`);
                  push_element($$renderer4, "div", 1e3, 18);
                  if (it.thinking) {
                    $$renderer4.push("<!--[0-->");
                    $$renderer4.push(`<details class="collapse-anim group mb-1 text-xs text-faint">`);
                    push_element($$renderer4, "details", 1002, 22);
                    $$renderer4.push(`<summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-fg-soft">`);
                    push_element($$renderer4, "summary", 1003, 24);
                    $$renderer4.push(`<span class="mr-1 inline-block transition-transform group-open:rotate-90">`);
                    push_element($$renderer4, "span", 1004, 26);
                    $$renderer4.push(`›</span>`);
                    pop_element();
                    $$renderer4.push(`Thinking</summary>`);
                    pop_element();
                    $$renderer4.push(` `);
                    ThinkingBlock($$renderer4, {
                      text: it.thinking,
                      streaming: false,
                      revealKey: `${it.id}:thinking`
                    });
                    $$renderer4.push(`<!----></details>`);
                    pop_element();
                  } else {
                    $$renderer4.push("<!--[-1-->");
                  }
                  $$renderer4.push(`<!--]--></div>`);
                  pop_element();
                } else if (it.kind === "tool") {
                  $$renderer4.push("<!--[1-->");
                  toolRow($$renderer4, it);
                } else {
                  $$renderer4.push("<!--[-1-->");
                }
                $$renderer4.push(`<!--]-->`);
              }
              $$renderer4.push(`<!--]--></div>`);
              pop_element();
              $$renderer4.push(`</details>`);
              pop_element();
            } else {
              $$renderer4.push("<!--[-1-->");
              const item = row.item;
              if (item.kind === "user") {
                $$renderer4.push("<!--[0-->");
                $$renderer4.push(`<div${attr_class("item-enter flex max-w-[85%] flex-col gap-2 self-end", void 0, { "thread-find-hit": item.id === currentMatchId() })}${attr("data-item-id", item.id)}>`);
                push_element($$renderer4, "div", 1019, 10);
                if (item.images && item.images.length > 0) {
                  $$renderer4.push("<!--[0-->");
                  $$renderer4.push(`<div class="flex flex-wrap justify-end gap-2">`);
                  push_element($$renderer4, "div", 1021, 14);
                  $$renderer4.push(`<!--[-->`);
                  const each_array_2 = ensure_array_like(item.images);
                  for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
                    let img = each_array_2[i];
                    $$renderer4.push(`<button type="button" class="block cursor-zoom-in" title="Click to enlarge">`);
                    push_element($$renderer4, "button", 1023, 18);
                    $$renderer4.push(`<img${attr("src", `data:${img.mimeType};base64,${img.data}`)} alt="Attached image" class="h-28 w-28 rounded-lg border border-border-strong/40 object-cover"/>`);
                    push_element($$renderer4, "img", 1029, 20);
                    pop_element();
                    $$renderer4.push(`</button>`);
                    pop_element();
                  }
                  $$renderer4.push(`<!--]--></div>`);
                  pop_element();
                } else {
                  $$renderer4.push("<!--[-1-->");
                }
                $$renderer4.push(`<!--]--> `);
                if (item.text) {
                  $$renderer4.push("<!--[0-->");
                  {
                    let children = function($$renderer5, { body }) {
                      validate_snippet_args($$renderer5);
                      const skill = parseSkillInvocation(body);
                      if (skill) {
                        $$renderer5.push("<!--[0-->");
                        $$renderer5.push(`<button type="button" class="skill-chip self-end" title="View skill" data-testid="skill-chip">`);
                        push_element($$renderer5, "button", 1043, 20);
                        Book_open($$renderer5, { size: 12 });
                        $$renderer5.push(`<!----> <span>`);
                        push_element($$renderer5, "span", 1051, 22);
                        $$renderer5.push(`${escape_html(skill.name)}</span>`);
                        pop_element();
                        $$renderer5.push(`</button>`);
                        pop_element();
                        $$renderer5.push(` `);
                        if (skill.args) {
                          $$renderer5.push("<!--[0-->");
                          $$renderer5.push(`<div class="rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg select-text">`);
                          push_element($$renderer5, "div", 1054, 22);
                          $$renderer5.push(`${escape_html(skill.args)}</div>`);
                          pop_element();
                        } else {
                          $$renderer5.push("<!--[-1-->");
                        }
                        $$renderer5.push(`<!--]-->`);
                      } else if (body) {
                        $$renderer5.push("<!--[1-->");
                        $$renderer5.push(`<div class="rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg select-text">`);
                        push_element($$renderer5, "div", 1059, 20);
                        $$renderer5.push(`${escape_html(body)}</div>`);
                        pop_element();
                      } else {
                        $$renderer5.push("<!--[-1-->");
                      }
                      $$renderer5.push(`<!--]-->`);
                    };
                    prevent_snippet_stringification(children);
                    MessageBadges($$renderer4, {
                      text: item.text,
                      connLogos,
                      children
                    });
                  }
                } else {
                  $$renderer4.push("<!--[-1-->");
                }
                $$renderer4.push(`<!--]--></div>`);
                pop_element();
              } else if (item.kind === "assistant" && !isSteerMessage(item)) {
                $$renderer4.push("<!--[1-->");
                const isStreaming = item.streaming && thread.status === "running";
                const inThinking = isStreaming && !!item.thinking && !item.text;
                $$renderer4.push(`<div${attr_class("item-enter assistant-message group/assistant text-[13.5px] leading-relaxed text-fg select-text", void 0, { "thread-find-hit": item.id === currentMatchId() })}${attr("data-item-id", item.id)}>`);
                push_element($$renderer4, "div", 1078, 10);
                if (item.thinking) {
                  $$renderer4.push("<!--[0-->");
                  $$renderer4.push(`<details class="collapse-anim group mb-1 text-xs text-faint"${attr("open", isStreaming && !item.text, true)}>`);
                  push_element($$renderer4, "details", 1080, 14);
                  $$renderer4.push(`<summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-fg-soft">`);
                  push_element($$renderer4, "summary", 1081, 16);
                  $$renderer4.push(`<span class="mr-1 inline-block transition-transform group-open:rotate-90">`);
                  push_element($$renderer4, "span", 1082, 18);
                  $$renderer4.push(`›</span>`);
                  pop_element();
                  $$renderer4.push(`Thinking</summary>`);
                  pop_element();
                  $$renderer4.push(` `);
                  ThinkingBlock($$renderer4, {
                    text: item.thinking,
                    streaming: isStreaming,
                    cursor: inThinking,
                    revealKey: `${item.id}:thinking`
                  });
                  $$renderer4.push(`<!----></details>`);
                  pop_element();
                } else {
                  $$renderer4.push("<!--[-1-->");
                }
                $$renderer4.push(`<!--]--> `);
                StreamingText($$renderer4, {
                  text: item.text,
                  streaming: isStreaming,
                  cursor: isStreaming && !inThinking,
                  revealKey: `${item.id}:text`
                });
                $$renderer4.push(`<!----> `);
                if (item.error) {
                  $$renderer4.push("<!--[0-->");
                  $$renderer4.push(`<p class="mt-2 rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-1.5 text-xs text-danger">`);
                  push_element($$renderer4, "p", 1089, 14);
                  $$renderer4.push(`${escape_html(item.error)}</p>`);
                  pop_element();
                } else {
                  $$renderer4.push("<!--[-1-->");
                }
                $$renderer4.push(`<!--]--> `);
                if (!isStreaming && item.text) {
                  $$renderer4.push("<!--[0-->");
                  $$renderer4.push(`<div class="assistant-actions">`);
                  push_element($$renderer4, "div", 1092, 14);
                  CopyButton($$renderer4, { text: item.text });
                  $$renderer4.push(`<!----> `);
                  if (thread.status !== "running" && turnMap().endById.has(item.id) && !thread.remoteHostId) {
                    $$renderer4.push("<!--[0-->");
                    turnMap().endById.get(item.id);
                    $$renderer4.push(`<button type="button" class="copy-btn" title="Rewind the conversation to before this turn" data-testid="rewind-turn">`);
                    push_element($$renderer4, "button", 1096, 18);
                    Undo_2($$renderer4, { size: 13 });
                    $$renderer4.push(`<!----> <span>`);
                    push_element($$renderer4, "span", 1103, 40);
                    $$renderer4.push(`Rewind</span>`);
                    pop_element();
                    $$renderer4.push(`</button>`);
                    pop_element();
                    $$renderer4.push(` <button type="button" class="copy-btn" title="Fork into a new thread at this point" data-testid="fork-turn">`);
                    push_element($$renderer4, "button", 1105, 18);
                    Git_branch($$renderer4, { size: 13 });
                    $$renderer4.push(`<!----> <span>`);
                    push_element($$renderer4, "span", 1112, 44);
                    $$renderer4.push(`Fork</span>`);
                    pop_element();
                    $$renderer4.push(`</button>`);
                    pop_element();
                  } else {
                    $$renderer4.push("<!--[-1-->");
                  }
                  $$renderer4.push(`<!--]--></div>`);
                  pop_element();
                } else {
                  $$renderer4.push("<!--[-1-->");
                }
                $$renderer4.push(`<!--]--></div>`);
                pop_element();
              } else if (item.kind === "tool") {
                $$renderer4.push("<!--[2-->");
                toolRow($$renderer4, item);
              } else if (item.kind === "subagent") {
                $$renderer4.push("<!--[3-->");
                $$renderer4.push(`<!--[-->`);
                const each_array_3 = ensure_array_like(agentTimeline().primaryNamesByCall.get(item.id) ?? []);
                for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
                  let name = each_array_3[$$index_3];
                  const entity = agentTimeline().entities.get(name);
                  if (entity) {
                    $$renderer4.push("<!--[0-->");
                    $$renderer4.push(`<div${attr_class("item-enter", void 0, { "thread-find-hit": item.id === currentMatchId() })}${attr("data-item-id", item.id)}>`);
                    push_element($$renderer4, "div", 1124, 14);
                    SubagentCard($$renderer4, { entity, live: fleet().get(name) });
                    $$renderer4.push(`<!----></div>`);
                    pop_element();
                  } else {
                    $$renderer4.push("<!--[-1-->");
                  }
                  $$renderer4.push(`<!--]-->`);
                }
                $$renderer4.push(`<!--]-->`);
              } else if (item.kind === "compaction") {
                $$renderer4.push("<!--[4-->");
                if (item.running) {
                  $$renderer4.push("<!--[0-->");
                  $$renderer4.push(`<div${attr_class("item-enter w-full rounded-lg border border-border-strong/40 bg-surface-2/40 px-4 py-3", void 0, { "thread-find-hit": item.id === currentMatchId() })}${attr("data-item-id", item.id)}>`);
                  push_element($$renderer4, "div", 1131, 12);
                  $$renderer4.push(`<div class="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">`);
                  push_element($$renderer4, "div", 1132, 14);
                  BrailleSpinner($$renderer4, { class: "working-label__spinner shrink-0" });
                  $$renderer4.push(`<!----> ${escape_html(item.reason === "manual" ? "Compacting…" : "Auto-compacting…")}</div>`);
                  pop_element();
                  $$renderer4.push(` <p class="mt-1 text-xs text-faint italic">`);
                  push_element($$renderer4, "p", 1136, 14);
                  $$renderer4.push(`Summarising the conversation to free up context…</p>`);
                  pop_element();
                  $$renderer4.push(`</div>`);
                  pop_element();
                } else {
                  $$renderer4.push("<!--[-1-->");
                  const compacted = !item.error && !item.aborted;
                  $$renderer4.push(`<button type="button"${attr_class(`item-enter flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-surface/60 px-3 py-2 text-xs font-semibold text-muted transition-colors select-none hover:bg-surface ${compacted ? "" : "border-border-strong/30"}`, void 0, { "thread-find-hit": item.id === currentMatchId() })}${attr_style(compacted ? "border-color: oklch(0.6 0.16 52 / 0.45)" : "")}${attr("data-item-id", item.id)} data-testid="compaction-card">`);
                  push_element($$renderer4, "button", 1140, 12);
                  $$renderer4.push(`<span class="shrink-0 opacity-70"${attr_style(compacted ? "color: oklch(0.6 0.16 52)" : "")}>`);
                  push_element($$renderer4, "span", 1151, 14);
                  $$renderer4.push(`⌘</span>`);
                  pop_element();
                  $$renderer4.push(` <span${attr_class(`font-semibold ${item.error ? "text-danger" : ""}`)}${attr_style(compacted ? "color: oklch(0.6 0.16 52)" : "")}>`);
                  push_element($$renderer4, "span", 1152, 14);
                  $$renderer4.push(`${escape_html(item.aborted ? "Compaction aborted" : item.error ? "Compaction failed" : item.reason === "manual" ? "Context compacted" : "Context compacted automatically")}</span>`);
                  pop_element();
                  $$renderer4.push(` `);
                  if (item.tokensBefore && item.tokensAfter) {
                    $$renderer4.push("<!--[0-->");
                    $$renderer4.push(`<span class="font-medium text-faint">`);
                    push_element($$renderer4, "span", 1165, 16);
                    $$renderer4.push(`· ${escape_html(fmtTokens(item.tokensBefore))} → ${escape_html(fmtTokens(item.tokensAfter))} tokens</span>`);
                    pop_element();
                  } else if (item.tokensBefore) {
                    $$renderer4.push("<!--[1-->");
                    $$renderer4.push(`<span class="font-medium text-faint">`);
                    push_element($$renderer4, "span", 1167, 16);
                    $$renderer4.push(`· ${escape_html(fmtTokens(item.tokensBefore))} summarised</span>`);
                    pop_element();
                  } else {
                    $$renderer4.push("<!--[-1-->");
                  }
                  $$renderer4.push(`<!--]--> `);
                  if (item.summary || item.error) {
                    $$renderer4.push("<!--[0-->");
                    $$renderer4.push(`<span class="ml-auto shrink-0 text-fainter">`);
                    push_element($$renderer4, "span", 1170, 16);
                    $$renderer4.push(`⤢</span>`);
                    pop_element();
                  } else {
                    $$renderer4.push("<!--[-1-->");
                  }
                  $$renderer4.push(`<!--]--></button>`);
                  pop_element();
                }
                $$renderer4.push(`<!--]-->`);
              } else if (item.kind === "retry") {
                $$renderer4.push("<!--[5-->");
                $$renderer4.push(`<div${attr_class(`item-enter flex w-full items-center gap-2 rounded-lg border bg-surface/60 px-3 py-2 text-xs font-semibold text-muted transition-colors select-none ${item.running ? "border-border-strong/30" : "border-danger-border/40"}`, void 0, { "thread-find-hit": item.id === currentMatchId() })}${attr("data-item-id", item.id)} data-testid="retry-card">`);
                push_element($$renderer4, "div", 1175, 12);
                if (item.running) {
                  $$renderer4.push("<!--[0-->");
                  BrailleSpinner($$renderer4, {
                    class: "working-label__spinner shrink-0",
                    shape: "triangle",
                    size: 16,
                    dotSize: 2.5
                  });
                  $$renderer4.push(`<!----> <span class="font-semibold text-danger">`);
                  push_element($$renderer4, "span", 1183, 16);
                  $$renderer4.push(`Connection failed</span>`);
                  pop_element();
                  $$renderer4.push(` <span class="font-medium text-faint">`);
                  push_element($$renderer4, "span", 1184, 16);
                  $$renderer4.push(`· attempt ${escape_html(item.attempt)}/${escape_html(item.maxAttempts)} — retrying…</span>`);
                  pop_element();
                } else {
                  $$renderer4.push("<!--[-1-->");
                  $$renderer4.push(`<span class="shrink-0 text-danger" aria-hidden="true">`);
                  push_element($$renderer4, "span", 1186, 16);
                  $$renderer4.push(`⚠</span>`);
                  pop_element();
                  $$renderer4.push(` <span class="font-semibold text-danger">`);
                  push_element($$renderer4, "span", 1187, 16);
                  $$renderer4.push(`Connection failed</span>`);
                  pop_element();
                  $$renderer4.push(` <span class="font-medium text-faint">`);
                  push_element($$renderer4, "span", 1188, 16);
                  $$renderer4.push(`· attempt ${escape_html(item.attempt)}/${escape_html(item.maxAttempts)} — gave up</span>`);
                  pop_element();
                }
                $$renderer4.push(`<!--]--> <span class="ml-auto shrink-0 text-fainter truncate max-w-[60%]"${attr("title", item.error)}>`);
                push_element($$renderer4, "span", 1190, 14);
                $$renderer4.push(`${escape_html(item.error)}</span>`);
                pop_element();
                $$renderer4.push(`</div>`);
                pop_element();
              } else if (isSteerMessage(item)) {
                $$renderer4.push("<!--[6-->");
              } else {
                $$renderer4.push("<!--[-1-->");
                $$renderer4.push(`<p${attr_class("item-enter text-center text-xs text-faint italic", void 0, { "thread-find-hit": item.id === currentMatchId() })}${attr("data-item-id", item.id)}>`);
                push_element($$renderer4, "p", 1195, 12);
                $$renderer4.push(`${escape_html(item.text)}</p>`);
                pop_element();
              }
              $$renderer4.push(`<!--]-->`);
            }
            $$renderer4.push(`<!--]-->`);
          };
          $$renderer3.push("<!--[0-->");
          prevent_snippet_stringification(toolRow);
          prevent_snippet_stringification(renderRow);
          $$renderer3.push(`<div class="relative flex min-h-0 flex-1 flex-col">`);
          push_element($$renderer3, "div", 944, 2);
          {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> <div class="transcript-scroll flex flex-1 flex-col overflow-y-auto px-6 pt-5 pb-26 svelte-17w65lb" data-testid="transcript">`);
          push_element($$renderer3, "div", 956, 4);
          $$renderer3.push(`<div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3">`);
          push_element($$renderer3, "div", 963, 4);
          if (items().length === 0) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<div class="flex flex-1 flex-col items-center justify-center gap-1 text-center">`);
            push_element($$renderer3, "div", 965, 8);
            $$renderer3.push(`<p class="text-[15px] font-medium text-muted">`);
            push_element($$renderer3, "p", 966, 10);
            $$renderer3.push(`What are we building?</p>`);
            pop_element();
            $$renderer3.push(` <p class="text-xs text-fainter">`);
            push_element($$renderer3, "p", 967, 10);
            $$renderer3.push(`Enter to send · / for commands · ⌘P plan mode · ⌃\` terminal</p>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]-->  <!--[-->`);
          const each_array_4 = ensure_array_like(rows());
          for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
            let row = each_array_4[$$index_4];
            renderRow($$renderer3, row);
          }
          $$renderer3.push(`<!--]--> `);
          if (rewound && rewound.settledLen !== null && rewound.threadId === thread.id) {
            $$renderer3.push("<!--[0-->");
            const tail = rewound.before.slice(rewound.settledLen);
            if (tail.length > 0) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<div class="rewound-divider svelte-17w65lb">`);
              push_element($$renderer3, "div", 1205, 10);
              $$renderer3.push(`<span>`);
              push_element($$renderer3, "span", 1205, 39);
              $$renderer3.push(`Rewound · ${escape_html(tail.length)} item${escape_html(tail.length === 1 ? "" : "s")} dropped from context</span>`);
              pop_element();
              $$renderer3.push(`</div>`);
              pop_element();
              $$renderer3.push(` <div class="rewound-tail svelte-17w65lb" aria-hidden="true">`);
              push_element($$renderer3, "div", 1206, 10);
              $$renderer3.push(`<!--[-->`);
              const each_array_5 = ensure_array_like(tail);
              for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
                let it = each_array_5[$$index_5];
                $$renderer3.push(`<div class="rewound-item svelte-17w65lb">`);
                push_element($$renderer3, "div", 1208, 14);
                $$renderer3.push(`${escape_html(itemText(it).slice(0, 280) || "(…)")}</div>`);
                pop_element();
              }
              $$renderer3.push(`<!--]--></div>`);
              pop_element();
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]-->`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (thread.status === "running" && !items().some((i) => i.kind === "assistant" && i.streaming) && !items().some((i) => i.kind === "tool" && i.status === "running") && !items().some((i) => i.kind === "compaction" && i.running)) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<div class="item-enter text-xs">`);
            push_element($$renderer3, "div", 1214, 8);
            WorkingLabel($$renderer3, { label: "Working…" });
            $$renderer3.push(`<!----></div>`);
            pop_element();
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> <!--[-->`);
          const each_array_6 = ensure_array_like(queues.for(thread.id).steering);
          for (let i = 0, $$length = each_array_6.length; i < $$length; i++) {
            let steerText = each_array_6[i];
            $$renderer3.push(`<div class="item-enter flex max-w-[85%] flex-col gap-2 self-end" data-testid="pending-steer">`);
            push_element($$renderer3, "div", 1219, 8);
            $$renderer3.push(`<div class="group/steer relative rounded-2xl rounded-br-md border border-dashed border-border-strong/60 bg-surface-2/40 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg-soft select-text">`);
            push_element($$renderer3, "div", 1220, 10);
            $$renderer3.push(`${escape_html(steerText)} <button type="button" class="absolute -top-2 -right-2 hidden size-5 items-center justify-center rounded-full border border-border-strong bg-surface text-muted group-hover/steer:flex hover:bg-danger hover:text-fg" title="Cancel this steer" aria-label="Cancel steering message" data-testid="cancel-pending-steer">`);
            push_element($$renderer3, "button", 1222, 12);
            X($$renderer3, { size: 11 });
            $$renderer3.push(`<!----></button>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
          $$renderer3.push(`</div>`);
          pop_element();
          $$renderer3.push(` `);
          {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--></div>`);
          pop_element();
          $$renderer3.push(` <!--[-->`);
          const each_array_7 = ensure_array_like(extensionUi.widgetsFor(thread.id).filter((w) => w.key !== FLEET_WIDGET_KEY));
          for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
            let widget = each_array_7[$$index_7];
            $$renderer3.push(`<div class="mx-6 mb-1 shrink-0 rounded-lg border border-border bg-surface/60 px-3 py-2" data-testid="extension-widget">`);
            push_element($$renderer3, "div", 1251, 4);
            $$renderer3.push(`<pre class="overflow-x-auto font-mono text-[10px] leading-relaxed text-muted">`);
            push_element($$renderer3, "pre", 1252, 6);
            $$renderer3.push(`${escape_html(widget.lines.join("\n"))}</pre>`);
            pop_element();
            $$renderer3.push(`</div>`);
            pop_element();
          }
          $$renderer3.push(`<!--]-->`);
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> <div${attr_class("composer-dock svelte-17w65lb", void 0, { "composer-dock--centered": isEmpty() })}>`);
        push_element($$renderer3, "div", 1257, 2);
        if (isEmpty() && thread.projectId) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="composer-device new-thread__bar svelte-17w65lb">`);
          push_element($$renderer3, "div", 1259, 6);
          $$renderer3.push(`<button type="button" class="new-thread__environment"${attr("aria-pressed", isWorktree())} data-testid="environment-toggle"${attr("title", isWorktree() ? "Working in an isolated git worktree" : "Working in the project directory")}>`);
          push_element($$renderer3, "button", 1260, 8);
          $$renderer3.push(`${escape_html(isWorktree() ? "⎇ Worktree" : "◈ Local")}</button>`);
          pop_element();
          $$renderer3.push(` <button type="button" class="new-thread__record svelte-17w65lb" data-testid="start-recording" title="Record a desktop task → synthesize a skill in this chat" aria-label="Start recording">`);
          push_element($$renderer3, "button", 1273, 8);
          Circle($$renderer3, { size: 11, class: "fill-red-500 text-red-500" });
          $$renderer3.push(`<!----> <span>`);
          push_element($$renderer3, "span", 1282, 10);
          $$renderer3.push(`Record</span>`);
          pop_element();
          $$renderer3.push(`</button>`);
          pop_element();
          $$renderer3.push(`</div>`);
          pop_element();
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        Composer($$renderer3, {
          thread,
          onRewind: rewindFromEnd,
          onNewThread,
          onCloneThread: doClone,
          onForkPicker: openForkPicker,
          centered: isEmpty()
        });
        $$renderer3.push(`<!----></div>`);
        pop_element();
        $$renderer3.push(` `);
        RewindDialog($$renderer3, {
          canRevert: canRevert(),
          turnCount: pendingRewind?.turnCount ?? 1,
          promptPreview: pendingRewind?.promptPreview ?? "",
          onConfirm: confirmRewind,
          get open() {
            return rewindDialogOpen;
          },
          set open($$value) {
            rewindDialogOpen = $$value;
            $$settled = false;
          },
          get revertFiles() {
            return revertFiles;
          },
          set revertFiles($$value) {
            revertFiles = $$value;
            $$settled = false;
          }
        });
        $$renderer3.push(`<!----> `);
        ForkPickerDialog($$renderer3, {
          turns,
          onPick: pickFork,
          get open() {
            return forkPickerOpen;
          },
          set open($$value) {
            forkPickerOpen = $$value;
            $$settled = false;
          }
        });
        $$renderer3.push(`<!----> `);
        CompactionDialog($$renderer3, {
          threadId: thread.id,
          onRetry: () => api.invoke("threads:retryCompact", thread.id).catch(console.error),
          get item() {
            return compactionDialogItem;
          },
          set item($$value) {
            compactionDialogItem = $$value;
            $$settled = false;
          }
        });
        $$renderer3.push(`<!----></div>`);
        pop_element();
      }
      do {
        $$settled = true;
        $$inner_renderer = $$renderer2.copy();
        $$render_inner($$inner_renderer);
      } while (!$$settled);
      $$renderer2.subsume($$inner_renderer);
    },
    ThreadView
  );
}
ThreadView.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
_page[FILENAME] = "src/routes/+page.svelte";
function _page($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      let booted = derived(() => snapshot.current !== null);
      let selectedThreadId = derived(() => snapshot.current?.ui.selectedThreadId ?? null);
      let selectedThread = derived(() => snapshot.current?.threads.find((t) => t.id === selectedThreadId()) ?? null);
      let canPrompt = derived(() => !!selectedThreadId() && selectedThread()?.status === "idle" && transcripts.itemsFor(selectedThreadId()).length === 0);
      function selectThread(id2) {
        void api.invoke("app:setSelectedThread", id2);
        if (snapshot.current) {
          snapshot.current = {
            ...snapshot.current,
            ui: { ...snapshot.current.ui, selectedThreadId: id2 }
          };
        }
      }
      head("1uha8ag", $$renderer2, ($$renderer3) => {
        $$renderer3.title(($$renderer4) => {
          $$renderer4.push(`<title>Peach Pi — live demo</title>`);
        });
        $$renderer3.push(`<meta name="description" content="The Peach Pi agent UI running in your browser. A canned replay shows how assistant streaming, tool calls, and reasoning feel."/>`);
        push_element($$renderer3, "meta", 51, 2);
        pop_element();
      });
      $$renderer2.push(`<div class="demo-shell svelte-1uha8ag">`);
      push_element($$renderer2, "div", 57, 0);
      $$renderer2.push(`<div class="laptop svelte-1uha8ag">`);
      push_element($$renderer2, "div", 59, 2);
      $$renderer2.push(`<div class="laptop__lid svelte-1uha8ag">`);
      push_element($$renderer2, "div", 60, 4);
      $$renderer2.push(`<div class="laptop__notch svelte-1uha8ag">`);
      push_element($$renderer2, "div", 61, 6);
      $$renderer2.push(`<span class="svelte-1uha8ag">`);
      push_element($$renderer2, "span", 61, 33);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(` <div class="laptop__bar svelte-1uha8ag">`);
      push_element($$renderer2, "div", 62, 6);
      $$renderer2.push(`<span class="light light--close svelte-1uha8ag">`);
      push_element($$renderer2, "span", 63, 8);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="light light--min svelte-1uha8ag">`);
      push_element($$renderer2, "span", 64, 8);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="light light--max svelte-1uha8ag">`);
      push_element($$renderer2, "span", 65, 8);
      $$renderer2.push(`</span>`);
      pop_element();
      $$renderer2.push(` <span class="laptop__bar-title svelte-1uha8ag">`);
      push_element($$renderer2, "span", 66, 8);
      $$renderer2.push(`peach-pi — demo</span>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(` <div class="laptop__screen svelte-1uha8ag">`);
      push_element($$renderer2, "div", 69, 6);
      if (booted() && snapshot.current) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="app-shell sidebar-device svelte-1uha8ag">`);
        push_element($$renderer2, "div", 71, 10);
        Sidebar($$renderer2, {
          width: snapshot.current.ui.sidebarWidth,
          projects: snapshot.current.projects,
          worktrees: snapshot.current.worktrees,
          threads: snapshot.current.threads,
          automationCount: snapshot.current.automations.length,
          collapsedProjects: snapshot.current.ui.collapsedProjects,
          selectedThreadId: selectedThreadId(),
          activeView: "thread",
          onSelect: selectThread,
          onNewChat: () => {
          },
          onOpenView: () => {
          },
          onOpenTesting: () => {
          },
          onOpenWorkQueue: () => {
          },
          onNewThread: () => {
          },
          onNewWorktree: () => {
          },
          onOpenSearch: () => {
          },
          onReloadAll: () => void api.invoke("threads:reloadAll"),
          onGoBack: () => {
          },
          onGoForward: () => {
          },
          canGoBack: false,
          canGoForward: false,
          remoteFirst: false
        });
        $$renderer2.push(`<!----> <div class="app-shell__content svelte-1uha8ag">`);
        push_element($$renderer2, "div", 96, 12);
        if (selectedThread()) {
          $$renderer2.push("<!--[0-->");
          ThreadView($$renderer2, {
            thread: selectedThread(),
            onSelectThread: selectThread,
            onSetEnvironment: () => {
            },
            onNewThread: () => {
            },
            onCloneThread: () => {
            },
            onForkThread: () => {
            }
          });
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`<div class="empty-state svelte-1uha8ag">`);
          push_element($$renderer2, "div", 100, 16);
          $$renderer2.push(`Select a thread to start.</div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--></div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="booting svelte-1uha8ag">`);
        push_element($$renderer2, "div", 105, 10);
        $$renderer2.push(`Booting Peach Pi…</div>`);
        pop_element();
      }
      $$renderer2.push(`<!--]--></div>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(` <div class="laptop__base svelte-1uha8ag">`);
      push_element($$renderer2, "div", 109, 4);
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(` `);
      if (canPrompt()) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<button class="try-cta svelte-1uha8ag" type="button">`);
        push_element($$renderer2, "button", 113, 4);
        Arrow_down_to_dot($$renderer2, { size: 14 });
        $$renderer2.push(`<!----> <span class="try-cta__label svelte-1uha8ag">`);
        push_element($$renderer2, "span", 115, 6);
        $$renderer2.push(`Try the canned prompt:</span>`);
        pop_element();
        $$renderer2.push(` <span class="try-cta__prompt svelte-1uha8ag">`);
        push_element($$renderer2, "span", 116, 6);
        $$renderer2.push(`"Can you add input validation to the login form?"</span>`);
        pop_element();
        $$renderer2.push(` <span class="try-cta__arrow svelte-1uha8ag">`);
        push_element($$renderer2, "span", 117, 6);
        $$renderer2.push(`→</span>`);
        pop_element();
        $$renderer2.push(`</button>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <div class="demo-footer svelte-1uha8ag">`);
      push_element($$renderer2, "div", 121, 2);
      $$renderer2.push(`<a class="demo-link svelte-1uha8ag" href="https://peachpi.vercel.app/" target="_blank" rel="noopener">`);
      push_element($$renderer2, "a", 122, 4);
      $$renderer2.push(`↧ Download for macOS</a>`);
      pop_element();
      $$renderer2.push(` <a class="demo-link svelte-1uha8ag" href="https://github.com/earendil-works/pi-coding-agent" target="_blank" rel="noopener">`);
      push_element($$renderer2, "a", 125, 4);
      $$renderer2.push(`⟨/⟩ pi agent on GitHub</a>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(` <p class="demo-disclaimer svelte-1uha8ag">`);
      push_element($$renderer2, "p", 129, 2);
      $$renderer2.push(`Canned replay only — no model is invoked. Assistant tokens, tool calls, and reasoning shown here were scripted for demo purposes.</p>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
    },
    _page
  );
}
_page.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
export {
  _page as default
};
