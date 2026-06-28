import { c as attributes, d as clsx, m as attr_class, a as attr_style, e as ensure_array_like, t as bind_props, i as derived, F as FILENAME, j as spread_props } from "./index.js";
import clsx$1 from "clsx";
import { p as push_element, a as pop_element } from "./dev.js";
function applyTranscriptOps(items, ops) {
  let next = items;
  for (const op of ops) {
    if (op.op === "reset") {
      next = [...op.items];
    } else if (op.op === "upsert") {
      const idx = next.findIndex((i) => i.id === op.item.id);
      next = idx === -1 ? [...next, op.item] : next.with(idx, op.item);
    } else if (op.op === "delete") {
      next = next.filter((i) => i.id !== op.id);
    } else {
      const idx = next.findIndex((i) => i.id === op.id);
      if (idx === -1) continue;
      const item = next[idx];
      if (op.field in item) {
        next = next.with(idx, {
          ...item,
          [op.field]: item[op.field] + op.delta
        });
      }
    }
  }
  return next;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _n = 0;
const uid = (p = "i") => `${p}-${Date.now().toString(36)}-${(_n++).toString(36)}`;
const NOW = Date.now();
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();
const mockProjects = [
  {
    id: "proj-peach-pi",
    name: "peach-pi",
    path: "~/code/peach-pi",
    kind: "repo",
    order: 0,
    createdAt: iso(-1e3 * 60 * 60 * 24 * 14),
    mergeWorkflow: "pr"
  },
  {
    id: "proj-dayjob",
    name: "dayjob",
    path: "~/code/dayjob",
    kind: "repo",
    order: 1,
    createdAt: iso(-1e3 * 60 * 60 * 24 * 60),
    mergeWorkflow: "pr"
  }
];
const mockThreads = [
  {
    id: "thread-build-validation",
    projectId: "proj-peach-pi",
    piSessionFile: null,
    title: "Add input validation to login form",
    tag: "feature",
    status: "idle",
    createdAt: iso(-1e3 * 60 * 14),
    lastActivityAt: iso(-1e3 * 60 * 2)
  },
  {
    id: "thread-fix-api-cors",
    projectId: "proj-peach-pi",
    piSessionFile: null,
    title: "Fix CORS error on /api/threads",
    tag: "bugfix",
    status: "completed",
    createdAt: iso(-1e3 * 60 * 60 * 3),
    lastActivityAt: iso(-1e3 * 60 * 38)
  },
  {
    id: "thread-doc-telemetry",
    projectId: "proj-dayjob",
    piSessionFile: null,
    title: "Document the telemetry consent flow",
    tag: "docs",
    status: "completed",
    createdAt: iso(-1e3 * 60 * 60 * 26),
    lastActivityAt: iso(-1e3 * 60 * 60 * 22)
  }
];
const mockSnapshot = {
  projects: mockProjects,
  worktrees: [],
  threads: mockThreads,
  automations: [],
  ui: {
    sidebarWidth: 232,
    sidebarCollapsed: false,
    activeView: "thread",
    selectedThreadId: "thread-build-validation",
    collapsedProjects: [],
    hudThreadId: null,
    hudPosition: null,
    hudAutoRevealOnFinish: false,
    archiveThreadWorktreeWarningDismissed: false
  }
};
const seedTranscripts = {
  "thread-fix-api-cors": [
    {
      id: "c1",
      kind: "user",
      text: "Getting a CORS error when /api/threads is hit from localhost:5173. Can you fix it?"
    },
    {
      id: "c2",
      kind: "assistant",
      text: "Done — added `localhost:5173` to the CORS allowlist in `apps/desktop/electron/main.ts` (line 84, inside the `session.defaultSession.webRequest.onHeadersReceived` filter). The dev server origin is now whitelisted only in development via `import.meta.env.DEV` so production stays locked down.",
      thinking: "User reports CORS on /api/threads. Looking at the main process, the onHeadersReceived handler sets Access-Control-Allow-Origin to the app origin only — localhost is different. Need to allow the dev origin during dev builds.",
      streaming: false
    }
  ],
  "thread-doc-telemetry": [
    {
      id: "d1",
      kind: "user",
      text: "Document the telemetry consent flow on the privacy policy page."
    },
    {
      id: "d2",
      kind: "assistant",
      text: "Updated `docs/privacy-policy.md` with a new **Consent flow** section that walks through when the dialog appears, what is sent once accepted, and how to revoke. Sketch of what got added:\n\n```md\n## Consent flow\n\nOn first launch, Peach Pi opens a consent dialog covering both crash reporting (Sentry) and product analytics (PostHog). Until the user opts in, no telemetry is sent.\n\nRevoke anytime via Settings → Privacy.\n```\n\nLet me know if you'd like it formatted differently.",
      thinking: "Privacy policy update. The consent dialog fires on first boot; revocation is via Settings. Map that out plainly.",
      streaming: false
    }
  ]
};
const MODELS = [
  {
    provider: "anthropic",
    id: "claude-opus-4-8",
    name: "Claude Opus 4.8",
    thinking: ["off", "minimal", "low", "medium", "high", "xhigh"]
  },
  {
    provider: "anthropic",
    id: "claude-sonnet-4-8",
    name: "Claude Sonnet 4.8",
    thinking: ["off", "minimal", "low", "medium", "high"]
  },
  {
    provider: "openai",
    id: "gpt-5.6",
    name: "GPT-5.6",
    thinking: ["off", "low", "medium", "high"]
  },
  {
    provider: "openai",
    id: "gpt-5.6-mini",
    name: "GPT-5.6 mini",
    thinking: ["off", "medium"]
  },
  {
    provider: "xiaomi",
    id: "glm-5.2",
    name: "GLM 5.2",
    thinking: ["off", "medium", "high"]
  },
  {
    provider: "google",
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    thinking: ["off", "low", "medium", "high"]
  }
];
const DEFAULT_MODEL = MODELS[0];
function buildMeta(threadId, model = DEFAULT_MODEL, level = "medium") {
  return {
    threadId,
    model: { provider: model.provider, id: model.id, name: model.name },
    thinkingLevel: level,
    availableThinkingLevels: [...model.thinking],
    contextTokens: 18420,
    contextWindow: 2e5,
    contextPercent: 9.21
  };
}
class MockPeachPi {
  listeners = /* @__PURE__ */ new Map();
  transcripts = new Map(
    Object.entries(seedTranscripts).map(([id, items]) => [id, { items, seq: items.length }])
  );
  snapshot = structuredClone(mockSnapshot);
  runningReplays = /* @__PURE__ */ new Set();
  /** Per-thread session meta (model + reasoning level). Seeded for every
   *  mock thread so the Composer's ModelSelector + ReasoningDial render. */
  metas = new Map(
    mockThreads.map((t) => [t.id, buildMeta(t.id)])
  );
  /** Broadcast an event to all subscribers of `channel`. */
  dispatch(channel, payload) {
    const set = this.listeners.get(channel);
    if (set) for (const fn of set) fn(payload);
  }
  emitOps(threadId, ops) {
    const entry = this.transcripts.get(threadId) ?? { items: [], seq: 0 };
    entry.seq += 1;
    entry.items = applyTranscriptOps(entry.items, ops);
    this.transcripts.set(threadId, entry);
    const delta = { threadId, ops, seq: entry.seq };
    this.dispatch("event:transcript", delta);
  }
  setStatus(threadId, status) {
    const idx = this.snapshot.threads.findIndex((t) => t.id === threadId);
    if (idx === -1) return;
    const next = [...this.snapshot.threads];
    next[idx] = { ...next[idx], status, lastActivityAt: (/* @__PURE__ */ new Date()).toISOString() };
    this.snapshot = { ...this.snapshot, threads: next };
    this.dispatch("event:snapshot", structuredClone(this.snapshot));
  }
  /** Kick off the canned replay for a thread (the user message drop + the
   *  assistant response are emitted as event:transcript deltas so the
   *  transcripts store folds them in like a real backend). */
  async runReplay(threadId, userText) {
    if (this.runningReplays.has(threadId)) return;
    this.runningReplays.add(threadId);
    const emit = (ops) => this.emitOps(threadId, Array.isArray(ops) ? ops : [ops]);
    try {
      this.setStatus(threadId, "running");
      await sleep(280);
      const aid = uid("a");
      emit({ op: "upsert", item: { id: aid, kind: "assistant", text: "", thinking: "", streaming: true } });
      const think1 = "The user wants input validation on the login form. First I'll find the existing form + auth handler, then add field-level validation (email format, password length) and surface errors inline. Let me look at the codebase.";
      await streamInto(emit, aid, think1, "thinking", 18, 44);
      const t1id = uid("t");
      emit({
        op: "upsert",
        item: {
          id: t1id,
          kind: "tool",
          toolName: "bash",
          argsSummary: "rg 'loginForm|handleSubmit' apps/desktop/src --type ts",
          output: "",
          status: "running"
        }
      });
      await sleep(420);
      const rgOut = `apps/desktop/src/app/Login.svelte
  52:  function handleSubmit(e: SubmitEvent) {
  60:    await api.invoke("auth:login", email, password)
apps/desktop/src/lib/auth.ts
  18:export interface LoginPayload { email: string; password: string }
  22:export function buildLoginPayload(form: HTMLFormElement): LoginPayload`;
      await streamInto(emit, t1id, rgOut, "output", 8, 24);
      emit({
        op: "upsert",
        item: { id: t1id, kind: "tool", toolName: "bash", argsSummary: "rg 'loginForm|handleSubmit' apps/desktop/src --type ts", output: rgOut, status: "done" }
      });
      await sleep(220);
      const t2id = uid("t");
      emit({
        op: "upsert",
        item: {
          id: t2id,
          kind: "tool",
          toolName: "read",
          argsSummary: "apps/desktop/src/app/Login.svelte L40–75",
          output: "",
          status: "running"
        }
      });
      await sleep(280);
      const fileOut = `<form on:submit={handleSubmit}>
  <input name="email" type="text" />
  <input name="password" type="password" />
  <button type="submit">Sign in</button>
</form>`;
      await streamInto(emit, t2id, fileOut, "output", 8, 22);
      emit({
        op: "upsert",
        item: { id: t2id, kind: "tool", toolName: "read", argsSummary: "apps/desktop/src/app/Login.svelte L40–75", output: fileOut, status: "done" }
      });
      await sleep(420);
      const think2 = "Form is raw HTML with no client-side validation; auth:login fires immediately. I'll add a `validate` step in `handleSubmit` (email regex + password length ≥ 8) and inline error spans bound to a Svelte state. Keep it minimal — skip it for now if the form is already validated server-side, but it isn't, so add it.";
      await streamInto(emit, aid, think2, "thinking", 14, 32);
      const reply = `Added client-side validation to the login form. Here's what landed:

**1. New \`validateLogin()\` helper** in \`apps/desktop/src/lib/auth.ts\`:

\`\`\`ts
const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

export function validateLogin(input: LoginPayload): Partial<Record<keyof LoginPayload, string>> {
  const errors: Partial<Record<keyof LoginPayload, string>> = {};
  if (!EMAIL_RE.test(input.email)) errors.email = "Enter a valid email address.";
  if (input.password.length < 8) errors.password = "Password must be at least 8 characters.";
  return errors;
}
\`\`\`

**2. Wired it into \`Login.svelte\`** — \`handleSubmit\` now short-circuits when \`validateLogin()\` returns errors and binds each error to its field via a \`$state\` \`errors\` map.

- ✅ submissions with a malformed email never leave the renderer
- ✅ password <8 chars surfaces an inline hint
- ✅ real submit path unchanged (only adds a guard before \`api.invoke("auth:login", ...)\`)

Want me to also add the same validation rule to the sign-up flow, or keep this scoped to login for now?`;
      await streamInto(emit, aid, reply, "text", 8, 22);
      emit({
        op: "upsert",
        item: { id: aid, kind: "assistant", text: reply, thinking: think1 + think2, streaming: false }
      });
      this.setStatus(threadId, "completed");
    } catch (e) {
      console.error("[mock-peach-pi] replay failed:", e);
      this.setStatus(threadId, "failed");
    } finally {
      this.runningReplays.delete(threadId);
    }
  }
  // ─── PeachPiApi surface ───────────────────────────────────────────────────
  // The desktop bridge's `invoke` is typed by channel; we keep the same
  // signature shape but route everything through a permissive handler map.
  invoke = ((channel, ...args) => {
    switch (channel) {
      case "app:getSnapshot":
        return Promise.resolve(structuredClone(this.snapshot));
      case "threads:getTranscript": {
        const threadId = args[0];
        const entry = this.transcripts.get(threadId);
        return Promise.resolve({ items: entry?.items ?? [], seq: entry?.seq ?? 0 });
      }
      case "threads:prompt": {
        const threadId = args[0];
        const body = args[1];
        let text;
        if (typeof body === "string") {
          text = body;
        } else if (body && typeof body === "object" && "text" in body && typeof body.text === "string") {
          text = body.text;
        } else {
          text = "(prompt)";
        }
        const userId = `u-${Date.now().toString(36)}`;
        this.emitOps(threadId, [{ op: "upsert", item: { id: userId, kind: "user", text } }]);
        void this.runReplay(threadId, text);
        return Promise.resolve();
      }
      case "threads:abort":
        return Promise.resolve();
      case "threads:getMeta": {
        const threadId = args[0];
        return Promise.resolve(this.metas.get(threadId) ?? buildMeta(threadId));
      }
      case "threads:listModels":
      case "threads:listAllModels":
        return Promise.resolve(MODELS.map(({ thinking: _t, ...m }) => m));
      case "threads:setModel": {
        const threadId = args[0];
        const provider = args[1];
        const id = args[2];
        const picked = MODELS.find((m) => m.provider === provider && m.id === id) ?? DEFAULT_MODEL;
        const supported = picked.thinking.includes("medium") ? "medium" : picked.thinking[picked.thinking.length - 1];
        const next = buildMeta(threadId, picked, supported);
        this.metas.set(threadId, next);
        this.dispatch("event:sessionMeta", next);
        return Promise.resolve(next);
      }
      case "threads:setThinking": {
        const threadId = args[0];
        const level = args[1];
        const cur = this.metas.get(threadId) ?? buildMeta(threadId);
        const next = { ...cur, thinkingLevel: level };
        this.metas.set(threadId, next);
        this.dispatch("event:sessionMeta", next);
        return Promise.resolve(next);
      }
      case "threads:setModelScoped":
        return Promise.resolve(MODELS.map(({ thinking: _t, ...m }) => m));
      // ─── BWS / Secrets Manager ────────────────────────────────────────────
      // Return a not-configured status so BwsView renders its "enter token"
      // empty state instead of throwing on `status.error`.
      case "bws:status":
        return Promise.resolve({
          installed: true,
          version: "2.0.0",
          hasToken: false,
          tokenSource: null,
          authenticated: false,
          projectId: null,
          project: null,
          projects: [],
          error: null
        });
      case "bws:listSecrets":
        return Promise.resolve([]);
      case "bws:setAccessToken":
      case "bws:clearAuth":
      case "bws:setProject":
        return Promise.resolve({
          installed: true,
          version: "2.0.0",
          hasToken: false,
          tokenSource: null,
          authenticated: false,
          projectId: null,
          project: null,
          projects: [],
          error: null
        });
      case "bws:install":
        return Promise.resolve({ ok: true });
      case "bws:createSecret":
      case "bws:editSecret":
      case "bws:deleteSecret":
        return Promise.resolve(void 0);
      // ─── Remote ───────────────────────────────────────────────────────────
      case "remote:hostStatus":
        return Promise.resolve({ enabled: false, serveAll: false, servedProjects: [], token: null });
      case "remote:listHosts":
        return Promise.resolve([]);
      case "remote:connectInfo":
        return Promise.resolve(null);
      case "remote:listTailnetPeers":
        return Promise.resolve([]);
      case "remote:setHostEnabled":
      case "remote:setProjectServed":
      case "remote:setServeAll":
      case "remote:regenerateToken":
        return Promise.resolve({ enabled: false, serveAll: false, servedProjects: [], token: null });
      case "remote:addHost":
      case "remote:abort":
      case "remote:attach":
        return Promise.resolve(void 0);
      // ─── Connectors ──────────────────────────────────────────────────────
      case "connectors:list":
      case "connectors:catalogue":
      case "customConnections:list":
      case "mcp:list":
        return Promise.resolve([]);
      // ─── App-level channels used by SettingsView onMount + prefs stores ────
      case "app:ping":
        return Promise.resolve({ version: "0.1.0", healthy: true });
      case "app:listModels":
        return Promise.resolve(MODELS.map(({ thinking: _t, ...m }) => m));
      case "app:getUtilityModel":
        return Promise.resolve(null);
      case "app:getCavemanState":
        return Promise.resolve({ enabled: false, level: "medium" });
      case "app:getVisionProxyConfig":
        return Promise.resolve({ mode: "off", provider: "anthropic", modelId: "claude-sonnet-4-5", installed: false });
      case "app:getVisionProxyInstallState":
        return Promise.resolve({ installed: false });
      case "agentBrowser:state":
        return Promise.resolve({ installed: false });
      case "cuaDriver:status":
        return Promise.resolve({ running: false, available: false });
      case "hud:setAutoReveal":
      case "app:updateExtensions":
      case "app:setUtilityModel":
        return Promise.resolve(void 0);
      // ─── Resources (skills + extensions + prompts inspection) ──────────────
      // Views (SkillsView, ExtensionsView) read `.skills`/`.extensions` off
      // the result; return empty arrays so they render their "none found" state.
      case "resources:inspect":
      case "resources:inspectSlotCommand":
        return Promise.resolve({ skills: [], extensions: [], prompts: [] });
      // ─── Skills / Extensions / Automations mutations ─────────────────────
      case "skills:save":
      case "skills:delete":
      case "skills:setInvocation":
      case "extensions:setEnabled":
      case "extensions:remove":
      case "extensions:deleteLocal":
        return Promise.resolve(void 0);
      case "automations:runs":
        return Promise.resolve([]);
      case "ui:setSidebarWidth":
      case "ui:setSidebarCollapsed":
      case "app:setSelectedThread":
      case "threads:reloadAll":
      case "threads:archive":
      case "threads:unarchive":
      case "threads:snooze":
      case "threads:unsnooze":
      case "threads:delete":
      case "threads:clone":
      case "threads:create":
      case "threads:compact":
      case "threads:rewind":
      case "threads:steer":
      case "threads:reload":
      case "projects:pick":
      case "projects:remove":
      case "projects:reorder":
      case "worktrees:archive":
      case "worktrees:create":
      case "remote:message":
        return Promise.resolve(void 0);
      default:
        return Promise.resolve(void 0);
    }
  });
  on = ((channel, listener) => {
    let set = this.listeners.get(channel);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  });
  getPathForFile = () => "";
}
async function streamInto(emit, id, text, field, minMs, maxMs) {
  let i = 0;
  while (i < text.length) {
    const n = 4 + Math.floor(Math.random() * 4);
    const chunk = text.slice(i, i + n);
    emit({ op: "append", id, field, delta: chunk });
    i += chunk.length;
    await sleep(minMs + Math.random() * (maxMs - minMs));
  }
}
function installMockPeachPi() {
  if (typeof window === "undefined") return;
  if (window.peachPi) return;
  window.peachPi = new MockPeachPi();
}
installMockPeachPi();
const MATRIX_SIZE = 5;
const MATRIX_CENTER = Math.floor(MATRIX_SIZE / 2);
const RANGE = Array.from({ length: MATRIX_SIZE }, (_, index) => index);
const GRID_SIDE = MATRIX_SIZE;
const CELL_COUNT = GRID_SIDE * GRID_SIDE;
const MAX_TOP_RIGHT_BOTTOM_LEFT = (GRID_SIDE - 1) * 2;
function rowMajorIndex(row, col) {
  return row * MATRIX_SIZE + col;
}
function indexToCoord(index) {
  return {
    row: Math.floor(index / MATRIX_SIZE),
    col: index % MATRIX_SIZE
  };
}
function trBlPathNormFromIndex(index) {
  const { row, col } = indexToCoord(index);
  return (row + (GRID_SIDE - 1 - col)) / MAX_TOP_RIGHT_BOTTOM_LEFT;
}
function buildSnakeOrderToIndexMap() {
  const pathOrder = new Array(CELL_COUNT);
  let step = 0;
  for (let row = 0; row < GRID_SIDE; row += 1) {
    if (row % 2 === 0) {
      for (let col = 0; col < GRID_SIDE; col += 1) {
        pathOrder[rowMajorIndex(row, col)] = step;
        step += 1;
      }
    } else {
      for (let col = GRID_SIDE - 1; col >= 0; col -= 1) {
        pathOrder[rowMajorIndex(row, col)] = step;
        step += 1;
      }
    }
  }
  return pathOrder;
}
buildSnakeOrderToIndexMap();
function buildSpiralInwardOrderToIndexMap() {
  const order = new Array(CELL_COUNT);
  let top = 0;
  let bottom = GRID_SIDE - 1;
  let left = 0;
  let right = GRID_SIDE - 1;
  let step = 0;
  while (top <= bottom && left <= right) {
    for (let col = left; col <= right; col += 1) {
      order[rowMajorIndex(top, col)] = step;
      step += 1;
    }
    for (let row = top + 1; row <= bottom; row += 1) {
      order[rowMajorIndex(row, right)] = step;
      step += 1;
    }
    if (top < bottom) {
      for (let col = right - 1; col >= left; col -= 1) {
        order[rowMajorIndex(bottom, col)] = step;
        step += 1;
      }
    }
    if (left < right) {
      for (let row = bottom - 1; row > top; row -= 1) {
        order[rowMajorIndex(row, left)] = step;
        step += 1;
      }
    }
    top += 1;
    bottom -= 1;
    left += 1;
    right -= 1;
  }
  return order;
}
const SPIRAL_INWARD_ORDER = buildSpiralInwardOrderToIndexMap();
function spiralInwardNormFromIndex(index) {
  return SPIRAL_INWARD_ORDER[index] / (CELL_COUNT - 1);
}
function spiralInwardOrderValue(index) {
  return SPIRAL_INWARD_ORDER[index];
}
function buildOuterRingClockwiseOrderToIndexMap() {
  const order = new Array(CELL_COUNT).fill(-1);
  const coords = [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [4, 3],
    [4, 2],
    [4, 1],
    [4, 0],
    [3, 0],
    [2, 0],
    [1, 0]
  ];
  for (let step = 0; step < coords.length; step += 1) {
    const [row, col] = coords[step];
    order[rowMajorIndex(row, col)] = step;
  }
  return order;
}
function buildMiddleRingAntiClockwiseOrderToIndexMap() {
  const order = new Array(CELL_COUNT).fill(-1);
  const coords = [
    [1, 1],
    [2, 1],
    [3, 1],
    [3, 2],
    [3, 3],
    [2, 3],
    [1, 3],
    [1, 2]
  ];
  for (let step = 0; step < coords.length; step += 1) {
    const [row, col] = coords[step];
    order[rowMajorIndex(row, col)] = step;
  }
  return order;
}
const OUTER_RING_CLOCKWISE_ORDER = buildOuterRingClockwiseOrderToIndexMap();
const MIDDLE_RING_ANTI_CLOCKWISE_ORDER = buildMiddleRingAntiClockwiseOrderToIndexMap();
function outerRingClockwiseOrderValue(index) {
  return OUTER_RING_CLOCKWISE_ORDER[index];
}
function outerRingClockwiseNormFromIndex(index) {
  const order = outerRingClockwiseOrderValue(index);
  return order >= 0 ? order / 15 : 0;
}
function middleRingAntiClockwiseOrderValue(index) {
  return MIDDLE_RING_ANTI_CLOCKWISE_ORDER[index];
}
function middleRingAntiClockwiseNormFromIndex(index) {
  const order = middleRingAntiClockwiseOrderValue(index);
  return order >= 0 ? order / 7 : 0;
}
function buildDiagonalSnakeOrderToIndexMap() {
  const order = new Array(CELL_COUNT);
  let step = 0;
  for (let diagonal = 0; diagonal <= (GRID_SIDE - 1) * 2; diagonal += 1) {
    const rowStart = Math.max(0, diagonal - (GRID_SIDE - 1));
    const rowEnd = Math.min(GRID_SIDE - 1, diagonal);
    if (diagonal % 2 === 0) {
      for (let row = rowEnd; row >= rowStart; row -= 1) {
        const col = diagonal - row;
        order[rowMajorIndex(row, col)] = step;
        step += 1;
      }
    } else {
      for (let row = rowStart; row <= rowEnd; row += 1) {
        const col = diagonal - row;
        order[rowMajorIndex(row, col)] = step;
        step += 1;
      }
    }
  }
  return order;
}
const DIAGONAL_SNAKE_ORDER = buildDiagonalSnakeOrderToIndexMap();
function diagonalSnakeOrderValue(index) {
  return DIAGONAL_SNAKE_ORDER[index];
}
function diagonalSnakeNormFromIndex(index) {
  return DIAGONAL_SNAKE_ORDER[index] / (CELL_COUNT - 1);
}
function buildRowWaveSnakeOrderToIndexMap() {
  const order = new Array(CELL_COUNT);
  const route = [
    { col: 0, dir: "up" },
    { col: 2, dir: "down" },
    { col: 1, dir: "up" },
    { col: 3, dir: "down" },
    { col: 2, dir: "up" },
    { col: 4, dir: "down" }
  ];
  let step = 0;
  for (const routeStep of route) {
    if (routeStep.dir === "up") {
      for (let row = GRID_SIDE - 1; row >= 0; row -= 1) {
        order[rowMajorIndex(row, routeStep.col)] = step;
        step += 1;
      }
    } else {
      for (let row = 0; row < GRID_SIDE; row += 1) {
        order[rowMajorIndex(row, routeStep.col)] = step;
        step += 1;
      }
    }
  }
  return order;
}
const ROW_WAVE_SNAKE_ORDER = buildRowWaveSnakeOrderToIndexMap();
Math.max(...ROW_WAVE_SNAKE_ORDER);
const GRID_RANGE = RANGE;
function stylePx(value) {
  return `${value}px`;
}
function styleOpacity(opacity) {
  return Math.round(opacity * 1e6) / 1e6;
}
function styleEntriesToString(entries) {
  const tokens = [];
  for (const key in entries) {
    const value = entries[key];
    if (value === void 0 || value === null || value === "") continue;
    tokens.push(`${key}: ${typeof value === "number" ? styleOpacity(value) : value}`);
  }
  return tokens.length > 0 ? tokens.join("; ") : void 0;
}
function getMatrixLayout(size, dotSize, cellPadding, gridSize = MATRIX_SIZE) {
  if (cellPadding != null) {
    const gap2 = Math.max(0, cellPadding);
    const matrixSpan = dotSize * gridSize + gap2 * (gridSize - 1);
    return { gap: gap2, matrixSpan };
  }
  const gap = Math.max(1, Math.floor((size - dotSize * gridSize) / (gridSize - 1)));
  return { gap, matrixSpan: size };
}
function resolveBoxLayout(options) {
  const boxSize = options?.boxSize;
  const hasBoxSize = boxSize != null && boxSize > 0 && Number.isFinite(boxSize);
  if (!hasBoxSize) {
    return { outerDim: 0, useWrapper: false };
  }
  const minSize = options?.minSize;
  if (minSize != null && minSize > 0 && Number.isFinite(minSize)) {
    return { outerDim: Math.max(boxSize, minSize), useWrapper: true };
  }
  return { outerDim: boxSize, useWrapper: true };
}
const SOURCE_BASE_OPACITY = 0.08;
const SOURCE_MID_OPACITY = 0.34;
const SOURCE_PEAK_OPACITY = 0.94;
const DOT_MATRIX_BLOOM_OPACITY_MIN = 0.6;
function lerp(start, end, progress) {
  return start + (end - start) * progress;
}
function normalizeProgress(value, start, end) {
  const span = end - start;
  if (Math.abs(span) < Number.EPSILON) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - start) / span));
}
function coerceOpacity(value) {
  if (value == null || !Number.isFinite(value)) {
    return void 0;
  }
  return Math.min(1, Math.max(0, value));
}
function clampUnitInterval(value) {
  if (value == null || !Number.isFinite(value)) {
    return void 0;
  }
  return Math.min(1, Math.max(0, value));
}
function remapOpacityToTriplet(opacity, opacityBase, opacityMid, opacityPeak) {
  if (!Number.isFinite(opacity)) {
    return opacity;
  }
  const hasOverrides = opacityBase !== void 0 || opacityMid !== void 0 || opacityPeak !== void 0;
  const safeOpacity = Math.min(1, Math.max(0, opacity));
  if (!hasOverrides) {
    return safeOpacity;
  }
  const targetBase = coerceOpacity(opacityBase) ?? SOURCE_BASE_OPACITY;
  const targetMid = coerceOpacity(opacityMid) ?? SOURCE_MID_OPACITY;
  const targetPeak = coerceOpacity(opacityPeak) ?? SOURCE_PEAK_OPACITY;
  if (safeOpacity <= SOURCE_BASE_OPACITY) {
    const progress2 = normalizeProgress(safeOpacity, 0, SOURCE_BASE_OPACITY);
    return Math.min(1, Math.max(0, lerp(0, targetBase, progress2)));
  }
  if (safeOpacity <= SOURCE_MID_OPACITY) {
    const progress2 = normalizeProgress(safeOpacity, SOURCE_BASE_OPACITY, SOURCE_MID_OPACITY);
    return Math.min(1, Math.max(0, lerp(targetBase, targetMid, progress2)));
  }
  if (safeOpacity <= SOURCE_PEAK_OPACITY) {
    const progress2 = normalizeProgress(safeOpacity, SOURCE_MID_OPACITY, SOURCE_PEAK_OPACITY);
    return Math.min(1, Math.max(0, lerp(targetMid, targetPeak, progress2)));
  }
  const progress = normalizeProgress(safeOpacity, SOURCE_PEAK_OPACITY, 1);
  return Math.min(1, Math.max(0, lerp(targetPeak, 1, progress)));
}
function opacityToBloomLevel(remappedOpacity) {
  return Math.max(
    0,
    Math.min(
      1,
      (remappedOpacity - DOT_MATRIX_BLOOM_OPACITY_MIN) / (1 - DOT_MATRIX_BLOOM_OPACITY_MIN)
    )
  );
}
function qualifiesForBloom(remappedOpacity) {
  return remappedOpacity >= DOT_MATRIX_BLOOM_OPACITY_MIN;
}
function clampHalo(value) {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
function isBloomRootActive(bloom, halo) {
  return bloom || clampHalo(halo) > 0;
}
function getBloomHaloSpreadClass(halo) {
  return clampHalo(halo) > 0 ? "dmx-bloom-halo" : void 0;
}
function getDotBloomParts(isActive, curveOpacity, bloom, halo, opacityBase, opacityMid, opacityPeak) {
  const haloLevel = clampHalo(halo);
  const remappedOpacity = remapOpacityToTriplet(
    curveOpacity,
    opacityBase,
    opacityMid,
    opacityPeak
  );
  const bloomLevel = bloom ? opacityToBloomLevel(remappedOpacity) : 0;
  return {
    level: Math.max(haloLevel, bloomLevel),
    bloomDot: haloLevel > 0 || bloom && qualifiesForBloom(remappedOpacity)
  };
}
const FULL_INDEXES = GRID_RANGE.flatMap(
  (row) => GRID_RANGE.map((col) => rowMajorIndex(row, col))
);
const DIAMOND_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  return Math.abs(row - MATRIX_CENTER) + Math.abs(col - MATRIX_CENTER) <= 2;
});
const OUTLINE_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  return row === 0 || row === MATRIX_SIZE - 1 || col === 0 || col === MATRIX_SIZE - 1;
});
const CROSS_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  return row === MATRIX_CENTER || col === MATRIX_CENTER;
});
const RINGS_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  const radius = Math.hypot(row - MATRIX_CENTER, col - MATRIX_CENTER);
  return Math.round(radius) === 1 || Math.round(radius) === 2;
});
const ROSE_INDEXES = FULL_INDEXES.filter((index) => {
  const { row, col } = indexToCoord(index);
  const dx = col - MATRIX_CENTER;
  const dy = row - MATRIX_CENTER;
  const angle = Math.atan2(dy, dx);
  const radius = Math.hypot(dx, dy);
  const rose = Math.abs(Math.sin(3 * angle));
  return rose > 0.6 && radius >= 1;
});
const PATTERN_INDEXES = {
  diamond: DIAMOND_INDEXES,
  full: FULL_INDEXES,
  outline: OUTLINE_INDEXES,
  rose: ROSE_INDEXES,
  cross: CROSS_INDEXES,
  rings: RINGS_INDEXES
};
function getPatternIndexes(pattern = "diamond") {
  return PATTERN_INDEXES[pattern];
}
Dot_matrix_base[FILENAME] = "src/desktop-renderer/lib/components/dot-matrix/dot-matrix-base.svelte";
function Dot_matrix_base($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      function cn(...tokens) {
        return clsx$1(tokens);
      }
      function mergeStyles(...styles) {
        const tokens = styles.filter(Boolean);
        return tokens.length > 0 ? tokens.join("; ") : void 0;
      }
      function normalizeStyle(style) {
        return style ?? void 0;
      }
      function indexToCoord2(index, gridSize2) {
        return { row: Math.floor(index / gridSize2), col: index % gridSize2 };
      }
      function distanceFromCenter(row, col, center) {
        return Math.hypot(row - center, col - center);
      }
      function polarAngle(row, col, center) {
        return Math.atan2(row - center, col - center);
      }
      function normalizedRadius(distance, center) {
        const maxRadius = Math.hypot(center, center);
        return maxRadius > 0 ? distance / maxRadius : 0;
      }
      function manhattanDistance(row, col, center) {
        return Math.abs(row - center) + Math.abs(col - center);
      }
      let {
        ref = null,
        class: className,
        style: userStyle,
        role = "status",
        "aria-live": ariaLive = "polite",
        "aria-label": ariaLabel = "Loading",
        onmouseenter,
        onmouseleave,
        size = 24,
        dotSize = 3,
        color = "currentColor",
        speed = 1,
        pattern = "diamond",
        gridSize = MATRIX_SIZE,
        activeIndexes = void 0,
        muted = false,
        bloom = false,
        halo = 0,
        dotClass = void 0,
        opacityBase = void 0,
        opacityMid = void 0,
        opacityPeak = void 0,
        cellPadding = void 0,
        boxSize = void 0,
        minSize = void 0,
        phase = "idle",
        reducedMotion = false,
        animationResolver = void 0,
        animated = void 0,
        hoverAnimated = void 0,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const safeSpeed = derived(() => speed > 0 ? speed : 1);
      const speedScale = derived(() => 1 / safeSpeed());
      const safeGridSize = derived(() => Math.max(1, Math.floor(gridSize)));
      const gridCenter = derived(() => Math.floor(safeGridSize() / 2));
      const totalCells = derived(() => safeGridSize() * safeGridSize());
      const patternIndexes = derived(() => new Set(activeIndexes ? Array.from(activeIndexes) : getPatternIndexes(pattern)));
      const matrixLayout = derived(() => getMatrixLayout(size, dotSize, cellPadding, safeGridSize()));
      const boxLayout = derived(() => resolveBoxLayout({ boxSize, minSize }));
      const scale = derived(() => boxLayout().useWrapper && matrixLayout().matrixSpan > 0 ? boxLayout().outerDim / matrixLayout().matrixSpan : 1);
      const baseOpacity = derived(() => clampUnitInterval(opacityBase));
      const midOpacity = derived(() => clampUnitInterval(opacityMid));
      const peakOpacity = derived(() => clampUnitInterval(opacityPeak));
      const unit = derived(() => dotSize + matrixLayout().gap);
      const matrixClass = derived(() => cn("dmx-root", muted && "dmx-muted", isBloomRootActive(bloom, halo) && "dmx-bloom", getBloomHaloSpreadClass(halo), !boxLayout().useWrapper && className));
      const rootStyle = derived(() => mergeStyles(
        styleEntriesToString({
          width: stylePx(matrixLayout().matrixSpan),
          height: stylePx(matrixLayout().matrixSpan),
          "--dmx-speed": speedScale(),
          "--dmx-dot-size": stylePx(dotSize),
          // Only emit color when explicitly overridden; otherwise let it
          // inherit from the element's class (e.g. .working-label__spinner
          // sets the theme accent). Emitting `color: currentColor` here
          // would override the class color with the inherited parent color.
          ...color !== "currentColor" ? { color } : {},
          ...baseOpacity() !== void 0 && { "--dmx-opacity-base": baseOpacity() },
          ...midOpacity() !== void 0 && { "--dmx-opacity-mid": midOpacity() },
          ...peakOpacity() !== void 0 && { "--dmx-opacity-peak": peakOpacity() },
          ...boxLayout().useWrapper ? {
            transform: `scale(${scale()})`,
            "transform-origin": "center center"
          } : {
            "min-width": minSize != null ? stylePx(minSize) : void 0,
            "min-height": minSize != null ? stylePx(minSize) : void 0
          }
        }),
        !boxLayout().useWrapper ? normalizeStyle(userStyle) : void 0
      ));
      const wrapperStyle = derived(() => mergeStyles(
        styleEntriesToString({
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          width: stylePx(boxLayout().outerDim),
          height: stylePx(boxLayout().outerDim),
          "min-width": minSize != null ? stylePx(minSize) : void 0,
          "min-height": minSize != null ? stylePx(minSize) : void 0,
          overflow: "hidden"
        }),
        boxLayout().useWrapper ? normalizeStyle(userStyle) : void 0
      ));
      const gridStyle = derived(() => styleEntriesToString({
        gap: stylePx(matrixLayout().gap),
        "grid-template-columns": `repeat(${safeGridSize()}, minmax(0, 1fr))`,
        "grid-template-rows": `repeat(${safeGridSize()}, minmax(0, 1fr))`
      }));
      const dots = derived(() => {
        const items = [];
        for (let index = 0; index < totalCells(); index += 1) {
          const { row, col } = indexToCoord2(index, safeGridSize());
          const isActive = patternIndexes().has(index);
          const distance = distanceFromCenter(row, col, gridCenter());
          const angle = polarAngle(row, col, gridCenter());
          const radius = normalizedRadius(distance, gridCenter());
          const manhattan = manhattanDistance(row, col, gridCenter());
          const deltaX = (col - gridCenter()) * unit();
          const deltaY = (row - gridCenter()) * unit();
          const animationState = animationResolver ? animationResolver({
            index,
            row,
            col,
            distanceFromCenter: distance,
            angleFromCenter: angle,
            radiusNormalized: radius,
            manhattanDistance: manhattan,
            phase,
            isActive,
            reducedMotion
          }) : {};
          const stylePatch = animationState.style ? { ...animationState.style } : {};
          let isBloomDot = false;
          if (isActive) {
            const rawOpacity = typeof stylePatch.opacity === "number" ? stylePatch.opacity : void 0;
            if (rawOpacity !== void 0) {
              stylePatch.opacity = remapOpacityToTriplet(rawOpacity, baseOpacity(), midOpacity(), peakOpacity());
              const bloomParts = getDotBloomParts(true, rawOpacity, bloom, halo, baseOpacity(), midOpacity(), peakOpacity());
              stylePatch["--dmx-bloom-level"] = bloomParts.level;
              isBloomDot = bloomParts.bloomDot;
            } else {
              const bloomParts = getDotBloomParts(true, 0, bloom, halo, baseOpacity(), midOpacity(), peakOpacity());
              if (bloomParts.level > 0) {
                stylePatch["--dmx-bloom-level"] = bloomParts.level;
              }
              isBloomDot = bloomParts.bloomDot;
            }
          }
          const dotStyle = styleEntriesToString({
            width: stylePx(dotSize),
            height: stylePx(dotSize),
            "--dmx-distance": distance,
            "--dmx-row": row,
            "--dmx-col": col,
            "--dmx-x": stylePx(deltaX),
            "--dmx-y": stylePx(deltaY),
            "--dmx-angle": angle,
            "--dmx-radius": radius,
            "--dmx-manhattan": manhattan,
            ...stylePatch,
            ...!isActive ? {
              opacity: 0,
              visibility: "hidden",
              "pointer-events": "none",
              animation: "none"
            } : {}
          });
          items.push({
            index,
            className: cn("dmx-dot", !isActive && "dmx-inactive", isBloomDot && "dmx-bloom-dot", dotClass, animationState.className),
            style: dotStyle
          });
        }
        return items;
      });
      if (boxLayout().useWrapper) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div${attributes({
          role,
          "aria-live": ariaLive,
          "aria-label": ariaLabel,
          class: clsx(className),
          style: wrapperStyle(),
          ...restProps
        })}>`);
        push_element($$renderer2, "div", 293, 1);
        $$renderer2.push(`<div${attr_class(clsx(matrixClass()))}${attr_style(rootStyle())}>`);
        push_element($$renderer2, "div", 304, 2);
        $$renderer2.push(`<div class="dmx-grid"${attr_style(gridStyle())}>`);
        push_element($$renderer2, "div", 305, 3);
        $$renderer2.push(`<!--[-->`);
        const each_array = ensure_array_like(dots());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let dot = each_array[$$index];
          $$renderer2.push(`<span aria-hidden="true"${attr_class(clsx(dot.className))}${attr_style(dot.style)}>`);
          push_element($$renderer2, "span", 307, 5);
          $$renderer2.push(`</span>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--></div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div${attributes({
          role,
          "aria-live": ariaLive,
          "aria-label": ariaLabel,
          class: clsx(matrixClass()),
          style: rootStyle(),
          ...restProps
        })}>`);
        push_element($$renderer2, "div", 313, 1);
        $$renderer2.push(`<div class="dmx-grid"${attr_style(gridStyle())}>`);
        push_element($$renderer2, "div", 324, 2);
        $$renderer2.push(`<!--[-->`);
        const each_array_1 = ensure_array_like(dots());
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let dot = each_array_1[$$index_1];
          $$renderer2.push(`<span aria-hidden="true"${attr_class(clsx(dot.className))}${attr_style(dot.style)}>`);
          push_element($$renderer2, "span", 326, 4);
          $$renderer2.push(`</span>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--></div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Dot_matrix_base
  );
}
Dot_matrix_base.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
function resolveSafeSpeed(speed) {
  return speed != null && speed > 0 ? speed : 1;
}
function createCycleProgress({ active, cycleMsBase, speed = () => 1 }) {
  let current = 0;
  return {
    get current() {
      return current;
    }
  };
}
function createDotMatrixPhaseController({ animated, hoverAnimated, speed = () => 1 }) {
  let hoverPhase = "idle";
  let timeouts = [];
  let hoverGeneration = 0;
  const autoRun = derived(() => Boolean(animated() && !hoverAnimated()));
  function clearTimers() {
    for (const timeout of timeouts) {
      window.clearTimeout(timeout);
    }
    timeouts = [];
  }
  const onMouseEnter = () => {
    if (!hoverAnimated() || autoRun()) {
      return;
    }
    clearTimers();
    const generation = ++hoverGeneration;
    hoverPhase = "collapse";
    const collapseMs = Math.max(1, Math.round(300 / resolveSafeSpeed(speed())));
    const timeout = window.setTimeout(
      () => {
        if (hoverGeneration !== generation) {
          return;
        }
        hoverPhase = "hoverRipple";
      },
      collapseMs
    );
    timeouts.push(timeout);
  };
  const onMouseLeave = () => {
    if (!hoverAnimated() || autoRun()) {
      return;
    }
    hoverGeneration += 1;
    clearTimers();
    hoverPhase = "idle";
  };
  const phase = derived(() => autoRun() ? "loadingRipple" : hoverAnimated() ? hoverPhase : "idle");
  return {
    get phase() {
      return phase();
    },
    onMouseEnter,
    onMouseLeave
  };
}
const SvelteSet = globalThis.Set;
const SvelteMap = globalThis.Map;
class MediaQuery {
  current;
  /**
   * @param {string} query
   * @param {boolean} [matches]
   */
  constructor(query, matches = false) {
    this.current = matches;
  }
}
function createSubscriber(_) {
  return () => {
  };
}
function createReducedMotionQuery(fallback = false) {
  return new MediaQuery("(prefers-reduced-motion: reduce)", fallback);
}
function createSteppedCycle({
  active,
  cycleMsBase,
  steps,
  speed = () => 1,
  idleStep = () => 0
}) {
  let current = 0;
  return {
    get current() {
      return current;
    }
  };
}
Square_1[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-1.svelte";
function Square_1($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const animationResolver = ({ isActive, index, row, col, reducedMotion: reducedMotion2, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }
        const path = trBlPathNormFromIndex(index);
        const slice = row + (4 - col);
        const parity = slice % 2;
        const style = { "--dmx-path": path, "--dmx-diagonal-parity": parity };
        if (reducedMotion2 || phase === "idle") {
          return { style: { ...style, opacity: parity === 0 ? 0.88 : 0.14 } };
        }
        return { className: "dmx-diagonal-alt-sweep", style };
      };
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver,
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_1
  );
}
Square_1.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_2[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-2.svelte";
function Square_2($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const CELL_COUNT2 = MATRIX_SIZE * MATRIX_SIZE;
      const SNAKE_TAIL = [1, 0.82, 0.68, 0.54, 0.42, 0.31, 0.22, 0.14];
      const BASE_OPACITY = 0.08;
      const EMPTY_VISITS = [];
      function buildRowCyclePath() {
        const path = [];
        const push = (row, col) => path.push(rowMajorIndex(row, col));
        for (let row = 4; row >= 0; row -= 1) push(row, 0);
        push(0, 1);
        push(0, 2);
        for (let row = 1; row <= 4; row += 1) push(row, 2);
        push(4, 1);
        for (let row = 3; row >= 0; row -= 1) push(row, 1);
        push(0, 2);
        push(0, 3);
        for (let row = 1; row <= 4; row += 1) push(row, 3);
        push(4, 2);
        for (let row = 3; row >= 0; row -= 1) push(row, 2);
        push(0, 3);
        push(0, 4);
        for (let row = 1; row <= 4; row += 1) push(row, 4);
        return path;
      }
      function buildVisitsByIndex(route) {
        const visits = Array.from({ length: CELL_COUNT2 }, () => []);
        for (let step = 0; step < route.length; step += 1) {
          visits[route[step]].push(step);
        }
        return visits;
      }
      const ROW_CYCLE_PATH = buildRowCyclePath();
      const ROW_CYCLE_LENGTH = ROW_CYCLE_PATH.length;
      const ROW_CYCLE_VISITS = buildVisitsByIndex(ROW_CYCLE_PATH);
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const headCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle" && ROW_CYCLE_LENGTH > 0,
        cycleMsBase: () => 1500,
        steps: () => ROW_CYCLE_LENGTH,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const head = headCycle.current;
        return ({ isActive, index }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          if (ROW_CYCLE_LENGTH <= 0) {
            return { style: { opacity: BASE_OPACITY } };
          }
          const visits = ROW_CYCLE_VISITS[index] ?? EMPTY_VISITS;
          let opacity = BASE_OPACITY;
          for (const stepIndex of visits) {
            const distance = (head - stepIndex + ROW_CYCLE_LENGTH) % ROW_CYCLE_LENGTH;
            if (distance >= 0 && distance < SNAKE_TAIL.length) {
              opacity = Math.max(opacity, SNAKE_TAIL[distance]);
            }
          }
          return { style: { opacity } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_2
  );
}
Square_2.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_3[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-3.svelte";
function Square_3($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const animationResolver = ({ isActive, index, reducedMotion: reducedMotion2, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }
        const order = spiralInwardOrderValue(index);
        const pathNorm = spiralInwardNormFromIndex(index);
        const style = { "--dmx-spiral-order": order };
        if (reducedMotion2 || phase === "idle") {
          return { style: { ...style, opacity: 0.16 + pathNorm * 0.78 } };
        }
        return { className: "dmx-spiral-snake", style };
      };
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver,
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_3
  );
}
Square_3.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_4[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-4.svelte";
function Square_4($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const animationResolver = ({ isActive, index, row, col, reducedMotion: reducedMotion2, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }
        const isCenter = row === 2 && col === 2;
        if (isCenter) {
          return { className: "dmx-inactive" };
        }
        const outerOrder = outerRingClockwiseOrderValue(index);
        if (outerOrder >= 0) {
          const outerNorm = outerRingClockwiseNormFromIndex(index);
          const style2 = { "--dmx-outer-order": outerOrder };
          if (reducedMotion2 || phase === "idle") {
            return { style: { ...style2, opacity: 0.2 + outerNorm * 0.72 } };
          }
          return { className: "dmx-outer-snake", style: style2 };
        }
        const middleOrder = middleRingAntiClockwiseOrderValue(index);
        const middleNorm = middleRingAntiClockwiseNormFromIndex(index);
        const style = { "--dmx-middle-order": middleOrder };
        if (reducedMotion2 || phase === "idle") {
          return { style: { ...style, opacity: 0.2 + middleNorm * 0.72 } };
        }
        return { className: "dmx-middle-snake", style };
      };
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver,
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_4
  );
}
Square_4.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_5[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-5.svelte";
function Square_5($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const animationResolver = ({ isActive, index, reducedMotion: reducedMotion2, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }
        const order = diagonalSnakeOrderValue(index);
        const pathNorm = diagonalSnakeNormFromIndex(index);
        const style = { "--dmx-diagonal-snake-order": order };
        if (reducedMotion2 || phase === "idle") {
          return { style: { ...style, opacity: 0.16 + pathNorm * 0.78 } };
        }
        return { className: "dmx-diagonal-snake", style };
      };
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver,
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_5
  );
}
Square_5.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_6[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-6.svelte";
function Square_6($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const COLUMN_HEIGHT = 5;
      const animationResolver = ({ isActive, row, col, reducedMotion: reducedMotion2, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }
        const goesUp = col % 2 === 0;
        const position = goesUp ? COLUMN_HEIGHT - 1 - row : row;
        if (reducedMotion2 || phase === "idle") {
          return {
            style: { opacity: 0.22 + position / (COLUMN_HEIGHT - 1) * 0.66 }
          };
        }
        return {
          className: "dmx-square6-col-snake",
          style: { "--dmx-col-pos": position }
        };
      };
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver,
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_6
  );
}
Square_6.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_7[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-7.svelte";
function Square_7($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const SETTLED_OPACITY = 0.42;
      const ACTIVE_OPACITY = 1;
      const CLEAR_OPACITY = 0.88;
      const IDLE_STEP = 10;
      const FRAME_MASKS = [
        "....................ooooo",
        "...............oooooooooo",
        "..........ooooooooooooooo",
        ".....oooooooooooooooooooo",
        "ooooooooooooooooooooooooo",
        "ccccccccccccccccccccccccc",
        ".........................",
        "ccccccccccccccccccccccccc",
        ".........................",
        "........................."
      ];
      const FRAME_SEQUENCE = [0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 9];
      function maskCell(mask, row, col) {
        return mask[rowMajorIndex(row, col)] ?? ".";
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.35,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const sequenceLength = FRAME_SEQUENCE.length;
      const stepCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle" && sequenceLength > 0,
        cycleMsBase: () => 1900,
        steps: () => sequenceLength,
        speed: () => speed,
        idleStep: () => Math.min(IDLE_STEP, sequenceLength - 1)
      });
      const frame = derived(() => FRAME_SEQUENCE[stepCycle.current]);
      const animationResolver = derived(() => {
        const currentMask = FRAME_MASKS[frame()] ?? FRAME_MASKS[0] ?? "";
        return ({ isActive, row, col }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const cell = maskCell(currentMask, row, col);
          if (cell === "x") {
            return { style: { opacity: ACTIVE_OPACITY } };
          }
          if (cell === "o") {
            return { style: { opacity: SETTLED_OPACITY } };
          }
          if (cell === "c") {
            return { style: { opacity: CLEAR_OPACITY } };
          }
          return { style: { opacity: BASE_OPACITY } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_7
  );
}
Square_7.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_8[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-8.svelte";
function Square_8($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const ROWS = MATRIX_SIZE;
      const COLS = MATRIX_SIZE;
      const FILL_LAST = ROWS + COLS - 1;
      const BLINK_STEPS = 4;
      const DRAIN_LAST = FILL_LAST;
      const SEQUENCE_LEN = FILL_LAST + 1 + BLINK_STEPS + DRAIN_LAST + 1;
      const BASE_OPACITY = 0.08;
      const SETTLED_OPACITY = 0.52;
      const CAP_OPACITY = 1;
      function fillHeight(col, fillTick) {
        return Math.max(0, Math.min(ROWS, fillTick - col));
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.4,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const stepCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle" && SEQUENCE_LEN > 0,
        cycleMsBase: () => 2e3,
        steps: () => SEQUENCE_LEN,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const step = stepCycle.current;
        const motionDisabled = reducedMotion();
        return ({ isActive, row, col, phase }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          if (motionDisabled || phase === "idle") {
            return { style: { opacity: BASE_OPACITY } };
          }
          let height = 0;
          {
            height = fillHeight(col, step);
          }
          const bottomRow = ROWS - 1;
          const topLitRow = ROWS - height;
          const isLit = height > 0 && row >= topLitRow && row <= bottomRow;
          if (!isLit) {
            return { style: { opacity: BASE_OPACITY } };
          }
          const isCap = row === topLitRow && height > 0 && height < ROWS;
          return { style: { opacity: isCap ? CAP_OPACITY : SETTLED_OPACITY } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_8
  );
}
Square_8.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_9[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-9.svelte";
function Square_9($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const D1 = 1;
      const D2 = 2;
      const D3 = 4;
      const D4 = 8;
      const D5 = 16;
      const D6 = 32;
      const CHECK_A = D1 | D3 | D5;
      const BASE_OPACITY = 0.08;
      const MID_OPACITY = 0.26;
      const GAP_OPACITY = 0.12;
      const CELL_ROW_START = 1;
      const LEFT_COL = 0;
      const RIGHT_CELL_COL = 3;
      function brailleBitForCell(row, col, cellColStart) {
        if (row < CELL_ROW_START || row > CELL_ROW_START + 2) {
          return null;
        }
        const deltaRow = row - CELL_ROW_START;
        if (col === cellColStart) {
          return D1 << deltaRow;
        }
        if (col === cellColStart + 1) {
          return D4 << deltaRow;
        }
        return null;
      }
      function resolveBraille(row, col) {
        const left = brailleBitForCell(row, col, LEFT_COL);
        if (left !== null) {
          return { bit: left };
        }
        const right = brailleBitForCell(row, col, RIGHT_CELL_COL);
        if (right !== null) {
          return { bit: right };
        }
        return null;
      }
      const animationResolver = ({ isActive, row, col, reducedMotion: reducedMotion2, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }
        const braille = resolveBraille(row, col);
        const isGapColumn = row >= CELL_ROW_START && row <= CELL_ROW_START + 2 && col === 2;
        if (reducedMotion2 || phase === "idle") {
          if (braille) {
            const isOn = (CHECK_A & braille.bit) !== 0;
            return { style: { opacity: isOn ? MID_OPACITY : BASE_OPACITY } };
          }
          if (isGapColumn) {
            return { style: { opacity: GAP_OPACITY } };
          }
          return { style: { opacity: BASE_OPACITY } };
        }
        if (isGapColumn) {
          return { style: { opacity: GAP_OPACITY } };
        }
        if (!braille) {
          return { style: { opacity: BASE_OPACITY } };
        }
        let bitClass = "dmx-square9-d1";
        if (braille.bit === D2) {
          bitClass = "dmx-square9-d2";
        } else if (braille.bit === D3) {
          bitClass = "dmx-square9-d3";
        } else if (braille.bit === D4) {
          bitClass = "dmx-square9-d4";
        } else if (braille.bit === D5) {
          bitClass = "dmx-square9-d5";
        } else if (braille.bit === D6) {
          bitClass = "dmx-square9-d6";
        }
        return { className: `dmx-square9-bit ${bitClass}` };
      };
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.5,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver,
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_9
  );
}
Square_9.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_10[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-10.svelte";
function Square_10($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const ROWS = MATRIX_SIZE;
      const BASE_OPACITY = 0.08;
      const PEAK_OPACITY = 1;
      const DECAY = 0.72;
      const COL_WARP = 0.07;
      let {
        onmouseenter,
        onmouseleave,
        speed = 2.5,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const scanRowCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1500,
        steps: () => ROWS,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const scanRow = scanRowCycle.current;
        const motionDisabled = reducedMotion();
        return ({ isActive, row, col, phase }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          if (motionDisabled || phase === "idle") {
            const falloff = (ROWS - 1 - row) / Math.max(1, ROWS - 1);
            return { style: { opacity: BASE_OPACITY + falloff * 0.38 } };
          }
          const colGain = 1 + COL_WARP * Math.sin(col * 1.72 + scanRow * 0.61);
          if (row > scanRow) {
            return { style: { opacity: BASE_OPACITY } };
          }
          const age = scanRow - row;
          const trail = Math.exp(-age * DECAY);
          const opacity = BASE_OPACITY + (PEAK_OPACITY - BASE_OPACITY) * trail * colGain;
          return { style: { opacity: Math.min(PEAK_OPACITY, opacity) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_10
  );
}
Square_10.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_11[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-11.svelte";
function Square_11($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const animationResolver = ({ isActive, manhattanDistance, reducedMotion: reducedMotion2, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }
        const ring = Math.max(0, Math.min(4, manhattanDistance));
        const style = { "--dmx-ripple-ring": ring, "--dmx-ripple-parity": ring % 2 };
        if (reducedMotion2 || phase === "idle") {
          return { style: { ...style, opacity: 0.2 + (1 - ring / 4) * 0.72 } };
        }
        return { className: "dmx-ripple-echo", style };
      };
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.25,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver,
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_11
  );
}
Square_11.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_12[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-12.svelte";
function Square_12($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const ORIGIN_ROW = 1;
      const ORIGIN_COL = 1;
      const MAX_MANHATTAN = 6;
      const animationResolver = ({ isActive, row, col, reducedMotion: reducedMotion2, phase }) => {
        if (!isActive) {
          return { className: "dmx-inactive" };
        }
        const ring = Math.max(0, Math.min(MAX_MANHATTAN, Math.abs(row - ORIGIN_ROW) + Math.abs(col - ORIGIN_COL)));
        const style = { "--dmx-center-ripple-ring": ring };
        if (reducedMotion2 || phase === "idle") {
          return {
            style: { ...style, opacity: 0.2 + (1 - ring / MAX_MANHATTAN) * 0.75 }
          };
        }
        return { className: "dmx-center-origin-ripple", style };
      };
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.35,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver,
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_12
  );
}
Square_12.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_13[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-13.svelte";
function Square_13($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const ON_OPACITY = 0.56;
      const PEAK_OPACITY = 1;
      const FRAME_MASKS = [
        "..x....x....o............",
        "....x...x...o............",
        "............oxx..........",
        "............o.....x.....x",
        "............o....x....x..",
        "............o...x...x....",
        "..........xxo............",
        "x.....x.....o............"
      ];
      const FRAME_SEQUENCE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7];
      function maskCell(mask, row, col) {
        return mask[rowMajorIndex(row, col)] ?? ".";
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.85,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const sequenceLength = FRAME_SEQUENCE.length;
      const stepCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle" && sequenceLength > 0,
        cycleMsBase: () => 1550,
        steps: () => sequenceLength,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const frameIndex = FRAME_SEQUENCE[stepCycle.current];
        const mask = FRAME_MASKS[frameIndex];
        return ({ isActive, row, col }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const cell = maskCell(mask, row, col);
          if (cell === "x") {
            return { style: { opacity: PEAK_OPACITY } };
          }
          if (cell === "o") {
            return { style: { opacity: ON_OPACITY } };
          }
          return { style: { opacity: BASE_OPACITY } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_13
  );
}
Square_13.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_14[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-14.svelte";
function Square_14($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const MID_OPACITY = 0.52;
      const PEAK_OPACITY = 1;
      const SMOOTH_TRANSITION = "opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)";
      const FRAME_MASKS = [
        "x...x.x.x...o...x.x.x...x",
        "..x...oxo.xooox.oxo...x..",
        ".x.x.x.o.x..o..x.o.x.x.x.",
        "x.x.x.o.o.x.o.x.o.o.x.x.x"
      ];
      const FRAME_SEQUENCE = [0, 1, 2, 3, 2, 1];
      function maskCell(mask, row, col) {
        return mask[rowMajorIndex(row, col)] ?? ".";
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.25,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const sequenceLength = FRAME_SEQUENCE.length;
      const stepCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle" && sequenceLength > 0,
        cycleMsBase: () => 1700,
        steps: () => sequenceLength,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const frameIndex = FRAME_SEQUENCE[stepCycle.current];
        const mask = FRAME_MASKS[frameIndex];
        return ({ isActive, row, col }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const cell = maskCell(mask, row, col);
          if (cell === "x") {
            return {
              style: { opacity: PEAK_OPACITY, transition: SMOOTH_TRANSITION }
            };
          }
          if (cell === "o") {
            return {
              style: { opacity: MID_OPACITY, transition: SMOOTH_TRANSITION }
            };
          }
          return {
            style: { opacity: BASE_OPACITY, transition: SMOOTH_TRANSITION }
          };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_14
  );
}
Square_14.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_15[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-15.svelte";
function Square_15($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const STRAND_OPACITY = 1;
      const BRIDGE_OPACITY = 0.58;
      const NEAR_STRAND_OPACITY = 0.24;
      const STRAND_LOOPS = 2;
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.25,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1600,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const animPhase = cycleProgress.current;
        const motionDisabled = reducedMotion();
        return ({ isActive, row, col, phase }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const progress = motionDisabled || phase === "idle" ? 0 : animPhase;
          const rowPhase = progress * STRAND_LOOPS * 2 * Math.PI + row * 1.24;
          const left = Math.round(1 + Math.sin(rowPhase));
          const right = 4 - left;
          const bridgeOn = Math.cos(rowPhase * 2) > 0.82;
          if (col === left || col === right) {
            return { style: { opacity: STRAND_OPACITY } };
          }
          if (bridgeOn && col > left && col < right) {
            return { style: { opacity: BRIDGE_OPACITY } };
          }
          if (Math.abs(col - left) === 1 || Math.abs(col - right) === 1) {
            return { style: { opacity: NEAR_STRAND_OPACITY } };
          }
          return { style: { opacity: BASE_OPACITY } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_15
  );
}
Square_15.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_16[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-16.svelte";
function Square_16($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const STRAND_OPACITY = 1;
      const BRIDGE_OPACITY = 0.58;
      const NEAR_STRAND_OPACITY = 0.24;
      const STEP_COUNT = 20;
      const HELIX_LOOP_RADIANS = Math.PI * 2 / (STEP_COUNT - 1);
      let {
        onmouseenter,
        onmouseleave,
        speed = 2.5,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1400,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const animPhase = cycleProgress.current;
        const motionDisabled = reducedMotion();
        return ({ isActive, row, col, phase }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const progress = motionDisabled || phase === "idle" ? 0 : animPhase * STEP_COUNT;
          const rowPhase = progress * HELIX_LOOP_RADIANS + row * 1.24;
          const left = Math.round(1.5 + 0.5 * Math.sin(rowPhase));
          const right = 4 - left;
          const bridgeOn = Math.cos(rowPhase * 2) > 0.82;
          if (col === left || col === right) {
            return { style: { opacity: STRAND_OPACITY } };
          }
          if (bridgeOn && col > left && col < right) {
            return { style: { opacity: BRIDGE_OPACITY } };
          }
          if (Math.abs(col - left) === 1 || Math.abs(col - right) === 1) {
            return { style: { opacity: NEAR_STRAND_OPACITY } };
          }
          return { style: { opacity: BASE_OPACITY } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_16
  );
}
Square_16.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_17[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-17.svelte";
function Square_17($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const STRAND_OPACITY = 1;
      const NEAR_STRAND_OPACITY = 0.24;
      const STEP_COUNT = 20;
      const HELIX_LOOP_RADIANS = Math.PI * 2 / (STEP_COUNT - 1);
      let {
        onmouseenter,
        onmouseleave,
        speed = 2.5,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1600,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const animPhase = cycleProgress.current;
        const motionDisabled = reducedMotion();
        return ({ isActive, row, col, phase }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const progress = motionDisabled || phase === "idle" ? 0 : animPhase * STEP_COUNT;
          const rowPhase = progress * HELIX_LOOP_RADIANS + row * 1.24;
          const strandCol = Math.round(2 + 2 * Math.sin(rowPhase));
          if (col === strandCol) {
            return { style: { opacity: STRAND_OPACITY } };
          }
          if (Math.abs(col - strandCol) === 1) {
            return { style: { opacity: NEAR_STRAND_OPACITY } };
          }
          return { style: { opacity: BASE_OPACITY } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_17
  );
}
Square_17.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_18[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-18.svelte";
function Square_18($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const LIT_OPACITY = 0.94;
      const CAP_OPACITY = 1;
      const STEP_COUNT = 24;
      const MAX_LEVEL = 5;
      function clampLevel(value) {
        return Math.max(1, Math.min(MAX_LEVEL, Math.round(value)));
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.35,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1750,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const animPhase = cycleProgress.current;
        const motionDisabled = reducedMotion();
        return ({ isActive, row, col, phase }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const progress = motionDisabled || phase === "idle" ? 0 : animPhase * STEP_COUNT;
          const colPhase = progress * 0.52 + col * 1.15;
          const level = clampLevel(1 + (Math.sin(colPhase) + 1) / 2 * (MAX_LEVEL - 1));
          const topLitRow = MAX_LEVEL - level;
          if (row > topLitRow) {
            return { style: { opacity: LIT_OPACITY } };
          }
          if (row === topLitRow) {
            return { style: { opacity: CAP_OPACITY } };
          }
          return { style: { opacity: BASE_OPACITY } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_18
  );
}
Square_18.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_19[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-19.svelte";
function Square_19($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const STEP_COUNT = 48;
      const BASE_OPACITY = 0.08;
      const SECONDARY_TRAIL_OPACITY = 0.32;
      const PRIMARY_TRAIL_OPACITY = 0.62;
      const PEAK_OPACITY = 1;
      const CURVE_OPACITY = 0.2;
      const CURVE_SAMPLES = Array.from({ length: 96 }, (_, index) => {
        const t = index / 96 * Math.PI * 2;
        return { x: Math.sin(t), y: 0.58 * Math.sin(2 * t) };
      });
      function gridPoint(row, col) {
        return { x: (col - 2) / 2, y: (2 - row) / 2 };
      }
      function loopPoint(step) {
        const t = step % STEP_COUNT / STEP_COUNT * Math.PI * 2;
        return { x: Math.sin(t), y: 0.58 * Math.sin(2 * t) };
      }
      function squaredDistance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
      }
      function minCurveDistanceSq(point) {
        let min = Number.POSITIVE_INFINITY;
        for (const sample of CURVE_SAMPLES) {
          min = Math.min(min, squaredDistance(point, sample));
        }
        return min;
      }
      function headInfluence(dot, head) {
        const distSq = squaredDistance(dot, head);
        return Math.exp(-distSq / 0.19);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const stepCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1700,
        steps: () => STEP_COUNT,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const step = stepCycle.current;
        const motionDisabled = reducedMotion();
        return ({ isActive, row, col, phase }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const dot = gridPoint(row, col);
          if (motionDisabled || phase === "idle") {
            const curveGlow = Math.exp(-minCurveDistanceSq(dot) / 0.2);
            const centerBoost = Math.exp(-(dot.x * dot.x + dot.y * dot.y) / 0.06);
            return {
              style: {
                opacity: Math.min(PEAK_OPACITY, BASE_OPACITY + curveGlow * CURVE_OPACITY + centerBoost * 0.18)
              }
            };
          }
          const headA = loopPoint(step);
          const headB = loopPoint(step + STEP_COUNT / 2);
          const trailA = loopPoint(step - 4);
          const trailB = loopPoint(step + STEP_COUNT / 2 - 4);
          const lead = Math.max(headInfluence(dot, headA), headInfluence(dot, headB));
          const trail = Math.max(headInfluence(dot, trailA), headInfluence(dot, trailB));
          const centerPulse = Math.exp(-(dot.x * dot.x + dot.y * dot.y) / 0.05) * (0.45 + 0.55 * lead);
          const opacity = BASE_OPACITY + SECONDARY_TRAIL_OPACITY * trail + PRIMARY_TRAIL_OPACITY * lead + 0.16 * centerPulse;
          return { style: { opacity: Math.min(PEAK_OPACITY, opacity) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_19
  );
}
Square_19.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Square_20[FILENAME] = "src/desktop-renderer/lib/components/loaders/square/square-20.svelte";
function Square_20($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const PERIMETER_PATH = [
        rowMajorIndex(0, 0),
        rowMajorIndex(0, 1),
        rowMajorIndex(0, 2),
        rowMajorIndex(0, 3),
        rowMajorIndex(0, 4),
        rowMajorIndex(1, 4),
        rowMajorIndex(2, 4),
        rowMajorIndex(3, 4),
        rowMajorIndex(4, 4),
        rowMajorIndex(4, 3),
        rowMajorIndex(4, 2),
        rowMajorIndex(4, 1),
        rowMajorIndex(4, 0),
        rowMajorIndex(3, 0),
        rowMajorIndex(2, 0),
        rowMajorIndex(1, 0)
      ];
      const LOOP_LEN = PERIMETER_PATH.length;
      const HALF_LOOP = Math.floor(LOOP_LEN / 2);
      const TAIL_BRIGHT = [1, 0.82, 0.64, 0.46, 0.3, 0.18];
      const BACK_TAIL_BRIGHT = [0.38, 0.3, 0.22, 0.14];
      const BASE_OPACITY = 0.08;
      const TWIST_INNER_OPACITY = 0.52;
      const SEAM_PULSE_OPACITY = 0.55;
      const IDLE_RING_OPACITY = 0.48;
      const SEAM_INDEX = rowMajorIndex(2, 2);
      const TWIST_INNER_BY_HEAD_STEP = /* @__PURE__ */ new Map([
        [0, rowMajorIndex(1, 1)],
        [4, rowMajorIndex(1, 3)],
        [8, rowMajorIndex(3, 3)],
        [12, rowMajorIndex(3, 1)]
      ]);
      function pathStepForCellIndex(cellIndex) {
        return PERIMETER_PATH.indexOf(cellIndex);
      }
      function opacityFromTail(distance, tail) {
        if (distance < 0 || distance >= tail.length) {
          return 0;
        }
        return tail[distance] ?? 0;
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 29,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const headStep = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1600,
        steps: () => LOOP_LEN,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const step = headStep.current;
        const motionDisabled = reducedMotion();
        return ({ isActive, index, phase }) => {
          if (!isActive) {
            return { className: "dmx-inactive" };
          }
          const onLoop = pathStepForCellIndex(index);
          const backHead = (step + HALF_LOOP) % LOOP_LEN;
          if (motionDisabled || phase === "idle") {
            if (onLoop >= 0) {
              return { style: { opacity: IDLE_RING_OPACITY } };
            }
            if (index === SEAM_INDEX) {
              return { style: { opacity: 0.22 } };
            }
            return { style: { opacity: BASE_OPACITY } };
          }
          let opacity = BASE_OPACITY;
          if (onLoop >= 0) {
            const forward = (step - onLoop + LOOP_LEN) % LOOP_LEN;
            const alongBack = (backHead - onLoop + LOOP_LEN) % LOOP_LEN;
            opacity = Math.max(opacity, opacityFromTail(forward, TAIL_BRIGHT), opacityFromTail(alongBack, BACK_TAIL_BRIGHT));
          }
          const twistInner = TWIST_INNER_BY_HEAD_STEP.get(step);
          if (twistInner === index) {
            opacity = Math.max(opacity, TWIST_INNER_OPACITY);
          }
          if (index === SEAM_INDEX && step % 4 === 0) {
            opacity = Math.max(opacity, SEAM_PULSE_OPACITY);
          }
          return { style: { opacity: Math.min(1, opacity) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Square_20
  );
}
Square_20.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const ROW_COUNTS = [3, 4, 5, 4, 3];
const HEX_ROW_PITCH_RATIO = Math.sqrt(3) / 2;
function hexPatternIndex(row, rowCount, col) {
  return row * ROW_COUNTS[2] + Math.floor((ROW_COUNTS[2] - rowCount) / 2) + col;
}
const HEX_ROWS = ROW_COUNTS.map(
  (count, row) => Array.from({ length: count }, (_, col) => ({
    id: `${row},${col}`,
    row,
    col,
    count,
    index: hexPatternIndex(row, count, col)
  }))
);
const HEX_CELLS = HEX_ROWS.flat();
function getHexLayout(size, dotSize, cellPadding) {
  const gap = cellPadding != null ? Math.max(0, cellPadding) : Math.max(1, Math.floor((size - dotSize * ROW_COUNTS[2]) / (ROW_COUNTS[2] - 1)));
  const colPitch = dotSize + gap;
  const rowGap = Math.max(1, colPitch * HEX_ROW_PITCH_RATIO - dotSize);
  const matrixWidth = dotSize * ROW_COUNTS[2] + gap * (ROW_COUNTS[2] - 1);
  const matrixHeight = dotSize * ROW_COUNTS.length + rowGap * (ROW_COUNTS.length - 1);
  return {
    gap,
    rowGap,
    matrixWidth,
    matrixHeight,
    matrixSpan: Math.max(matrixWidth, matrixHeight)
  };
}
function pointForCell(row, col) {
  const count = ROW_COUNTS[row] ?? 1;
  return {
    x: col - (count - 1) / 2,
    y: (row - 2) * HEX_ROW_PITCH_RATIO
  };
}
function buildHexCells(activePatternIndexes, resolveOpacity, resolveStyle) {
  return HEX_CELLS.map((cell) => {
    const isActive = activePatternIndexes.has(cell.index);
    return {
      ...cell,
      isActive,
      opacity: isActive ? resolveOpacity(cell) : 0,
      style: resolveStyle?.(cell)
    };
  });
}
Hex_base[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-base.svelte";
function Hex_base($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      function cn(...tokens) {
        return clsx$1(tokens);
      }
      function mergeStyles(...styles) {
        const tokens = styles.filter(Boolean);
        return tokens.length > 0 ? tokens.join("; ") : void 0;
      }
      function normalizeStyle(style) {
        return style ?? void 0;
      }
      let {
        cells,
        ref = null,
        class: className,
        style: userStyle,
        role = "status",
        "aria-live": ariaLive = "polite",
        "aria-label": ariaLabel = "Loading",
        onmouseenter,
        onmouseleave,
        size = 33,
        dotSize = 5,
        color = "currentColor",
        speed = 1,
        muted = false,
        bloom = false,
        halo = 0,
        dotClass = void 0,
        opacityBase = void 0,
        opacityMid = void 0,
        opacityPeak = void 0,
        cellPadding = void 0,
        boxSize = void 0,
        minSize = void 0,
        animated = void 0,
        hoverAnimated = void 0,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const safeSpeed = derived(() => speed > 0 ? speed : 1);
      const speedScale = derived(() => 1 / safeSpeed());
      const layout = derived(() => getHexLayout(size, dotSize, cellPadding));
      const boxLayout = derived(() => resolveBoxLayout({ boxSize, minSize }));
      const scale = derived(() => boxLayout().useWrapper && layout().matrixSpan > 0 ? boxLayout().outerDim / layout().matrixSpan : 1);
      const baseOpacity = derived(() => clampUnitInterval(opacityBase));
      const midOpacity = derived(() => clampUnitInterval(opacityMid));
      const peakOpacity = derived(() => clampUnitInterval(opacityPeak));
      const matrixClass = derived(() => cn("dmx-root", muted && "dmx-muted", isBloomRootActive(bloom, halo) && "dmx-bloom", getBloomHaloSpreadClass(halo), !boxLayout().useWrapper && className));
      const rootStyle = derived(() => mergeStyles(
        styleEntriesToString({
          width: stylePx(layout().matrixWidth),
          height: stylePx(layout().matrixHeight),
          "--dmx-speed": speedScale(),
          "--dmx-dot-size": stylePx(dotSize),
          color,
          ...baseOpacity() !== void 0 && { "--dmx-opacity-base": baseOpacity() },
          ...midOpacity() !== void 0 && { "--dmx-opacity-mid": midOpacity() },
          ...peakOpacity() !== void 0 && { "--dmx-opacity-peak": peakOpacity() },
          ...boxLayout().useWrapper ? {
            transform: `scale(${scale()})`,
            "transform-origin": "center center"
          } : {
            "min-width": minSize != null ? stylePx(minSize) : void 0,
            "min-height": minSize != null ? stylePx(minSize) : void 0
          }
        }),
        !boxLayout().useWrapper ? normalizeStyle(userStyle) : void 0
      ));
      const wrapperStyle = derived(() => mergeStyles(
        styleEntriesToString({
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          width: stylePx(boxLayout().outerDim),
          height: stylePx(boxLayout().outerDim),
          "min-width": minSize != null ? stylePx(minSize) : void 0,
          "min-height": minSize != null ? stylePx(minSize) : void 0,
          overflow: "hidden"
        }),
        boxLayout().useWrapper ? normalizeStyle(userStyle) : void 0
      ));
      const gridStyle = derived(() => styleEntriesToString({ gap: stylePx(layout().rowGap) }));
      const rowStyle = derived(() => styleEntriesToString({ gap: stylePx(layout().gap) }));
      const cellsById = derived(() => new Map(cells.map((cell) => [cell.id, cell])));
      const renderedRows = derived(() => HEX_ROWS.map((row) => row.map((definition) => {
        const cell = cellsById().get(definition.id) ?? { ...definition, isActive: false, opacity: 0, style: void 0 };
        const stylePatch = cell.style ? { ...cell.style } : {};
        let isBloomDot = false;
        if (cell.isActive) {
          const bloomParts = getDotBloomParts(true, cell.opacity, bloom, halo, baseOpacity(), midOpacity(), peakOpacity());
          stylePatch.opacity = remapOpacityToTriplet(cell.opacity, baseOpacity(), midOpacity(), peakOpacity());
          stylePatch["--dmx-bloom-level"] = bloomParts.level;
          isBloomDot = bloomParts.bloomDot;
        } else {
          stylePatch.opacity = 0;
          stylePatch.visibility = "hidden";
          stylePatch["pointer-events"] = "none";
          stylePatch.animation = "none";
        }
        return {
          id: cell.id,
          className: cn("dmx-dot", !cell.isActive && "dmx-inactive", isBloomDot && "dmx-bloom-dot", dotClass),
          style: styleEntriesToString({
            width: stylePx(dotSize),
            height: stylePx(dotSize),
            ...stylePatch
          })
        };
      })));
      if (boxLayout().useWrapper) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div${attributes(
          {
            role,
            "aria-live": ariaLive,
            "aria-label": ariaLabel,
            class: clsx(className),
            style: wrapperStyle(),
            ...restProps
          },
          "svelte-14vli3f"
        )}>`);
        push_element($$renderer2, "div", 203, 1);
        $$renderer2.push(`<div${attr_class(clsx(matrixClass()), "svelte-14vli3f")}${attr_style(rootStyle())}>`);
        push_element($$renderer2, "div", 214, 2);
        $$renderer2.push(`<div class="dmx-hex-grid svelte-14vli3f"${attr_style(gridStyle())}>`);
        push_element($$renderer2, "div", 215, 3);
        $$renderer2.push(`<!--[-->`);
        const each_array = ensure_array_like(renderedRows());
        for (let rowIndex = 0, $$length = each_array.length; rowIndex < $$length; rowIndex++) {
          let row = each_array[rowIndex];
          $$renderer2.push(`<div class="dmx-hex-row svelte-14vli3f"${attr_style(rowStyle())}>`);
          push_element($$renderer2, "div", 217, 5);
          $$renderer2.push(`<!--[-->`);
          const each_array_1 = ensure_array_like(row);
          for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
            let cell = each_array_1[$$index];
            $$renderer2.push(`<span aria-hidden="true"${attr_class(clsx(cell.className), "svelte-14vli3f")}${attr_style(cell.style)}>`);
            push_element($$renderer2, "span", 222, 7);
            $$renderer2.push(`</span>`);
            pop_element();
          }
          $$renderer2.push(`<!--]--></div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--></div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div${attributes(
          {
            role,
            "aria-live": ariaLive,
            "aria-label": ariaLabel,
            class: clsx(matrixClass()),
            style: rootStyle(),
            ...restProps
          },
          "svelte-14vli3f"
        )}>`);
        push_element($$renderer2, "div", 231, 1);
        $$renderer2.push(`<div class="dmx-hex-grid svelte-14vli3f"${attr_style(gridStyle())}>`);
        push_element($$renderer2, "div", 242, 2);
        $$renderer2.push(`<!--[-->`);
        const each_array_2 = ensure_array_like(renderedRows());
        for (let rowIndex = 0, $$length = each_array_2.length; rowIndex < $$length; rowIndex++) {
          let row = each_array_2[rowIndex];
          $$renderer2.push(`<div class="dmx-hex-row svelte-14vli3f"${attr_style(rowStyle())}>`);
          push_element($$renderer2, "div", 244, 4);
          $$renderer2.push(`<!--[-->`);
          const each_array_3 = ensure_array_like(row);
          for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
            let cell = each_array_3[$$index_2];
            $$renderer2.push(`<span aria-hidden="true"${attr_class(clsx(cell.className), "svelte-14vli3f")}${attr_style(cell.style)}>`);
            push_element($$renderer2, "span", 249, 6);
            $$renderer2.push(`</span>`);
            pop_element();
          }
          $$renderer2.push(`<!--]--></div>`);
          pop_element();
        }
        $$renderer2.push(`<!--]--></div>`);
        pop_element();
        $$renderer2.push(`</div>`);
        pop_element();
      }
      $$renderer2.push(`<!--]-->`);
      bind_props($$props, { ref });
    },
    Hex_base
  );
}
Hex_base.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_1[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-1.svelte";
function Hex_1($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.1;
      const MID_OPACITY = 0.2;
      const HIGH_OPACITY = 0.96;
      const CENTER_OPACITY = 0.1;
      const TRAIL_SPAN = 5;
      const PERIMETER_PATH = [
        "0,0",
        "0,1",
        "0,2",
        "1,3",
        "2,4",
        "3,3",
        "4,2",
        "4,1",
        "4,0",
        "3,0",
        "2,0",
        "1,0"
      ];
      const PATH_LEN = PERIMETER_PATH.length;
      const HALF_PATH = PATH_LEN / 2;
      function modF(value, modulo) {
        return (value % modulo + modulo) % modulo;
      }
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function glowAlongPath(head, pathIndex) {
        if (pathIndex === null) {
          return BASE_OPACITY;
        }
        const distance = modF(head - pathIndex, PATH_LEN);
        const glow = 1 - smoothstep01(0, TRAIL_SPAN, distance);
        return BASE_OPACITY + glow * (HIGH_OPACITY - BASE_OPACITY);
      }
      function opacityForCell(id, phase) {
        if (id === "2,2") {
          return CENTER_OPACITY;
        }
        const pathIndex = PERIMETER_PATH.indexOf(id);
        const normalizedPathIndex = pathIndex === -1 ? null : pathIndex;
        const headA = phase * PATH_LEN;
        const headB = modF(headA + HALF_PATH, PATH_LEN);
        const perimeterGlow = Math.max(glowAlongPath(headA, normalizedPathIndex), glowAlongPath(headB, normalizedPathIndex) * 0.74);
        if (normalizedPathIndex !== null) {
          return Math.min(HIGH_OPACITY, perimeterGlow);
        }
        const [, col] = id.split(",").map(Number);
        const centerFalloff = col === 2 ? MID_OPACITY : 0.18;
        return Math.max(BASE_OPACITY, centerFalloff);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.6,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1500,
        speed: () => speed
      });
      const currentPhase = derived(() => reducedMotion() || phaseController.phase === "idle" ? 0.08 : cycleProgress.current);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(activePatternIndexes(), (cell) => opacityForCell(cell.id, currentPhase())));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_1
  );
}
Hex_1.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_2[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-2.svelte";
function Hex_2($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const MID_OPACITY = 0.44;
      const HIGH_OPACITY = 0.98;
      const SPOKE_WIDTH = 0.34;
      function angularDistance(a, b) {
        const diff = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
        return Math.min(diff, Math.PI * 2 - diff);
      }
      function opacityForCell(row, col, phase) {
        const { x, y } = pointForCell(row, col);
        const radius = Math.sqrt(x * x + y * y);
        if (radius < 0.01) {
          return MID_OPACITY + Math.sin(phase * Math.PI * 2) * 0.18;
        }
        const angle = Math.atan2(y, x);
        const rotation = phase * Math.PI * 2;
        const spokeA = angularDistance(angle, rotation);
        const spokeB = angularDistance(angle, rotation + Math.PI * 2 / 3);
        const spokeC = angularDistance(angle, rotation + Math.PI * 4 / 3);
        const nearestSpoke = Math.min(spokeA, spokeB, spokeC);
        const spokeGlow = Math.max(0, 1 - nearestSpoke / SPOKE_WIDTH);
        const outerPulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2 - radius * 2.2);
        const shellLift = radius > 1.7 ? outerPulse * 0.24 : 0;
        return Math.min(HIGH_OPACITY, BASE_OPACITY + spokeGlow * 0.78 + shellLift);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.7,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1500,
        speed: () => speed
      });
      const currentPhase = derived(() => reducedMotion() || phaseController.phase === "idle" ? 0.06 : cycleProgress.current);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(activePatternIndexes(), (cell) => opacityForCell(cell.row, cell.col, currentPhase())));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_2
  );
}
Hex_2.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_3[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-3.svelte";
function Hex_3($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const HIGH_OPACITY = 0.96;
      const BAND_WIDTH = 0.55;
      function triangularWave(value) {
        const wrapped = (value % 1 + 1) % 1;
        return 1 - Math.abs(wrapped * 2 - 1);
      }
      function bandGlow(distance) {
        return Math.max(0, 1 - Math.abs(distance) / BAND_WIDTH);
      }
      function opacityForCell(row, col, phase) {
        const { x, y } = pointForCell(row, col);
        const sweep = triangularWave(phase) * 3.9 - 1.95;
        const diagA = x * 0.86 + y * 0.5;
        const diagB = x * -0.86 + y * 0.5;
        const gateA = bandGlow(diagA - sweep);
        const gateB = bandGlow(diagB + sweep);
        const centerDistance = Math.sqrt(x * x + y * y);
        const centerFlash = Math.max(0, 1 - Math.abs(sweep) / 0.68) * Math.max(0, 1 - centerDistance / 1.9);
        const wake = 0.16 * Math.max(0, 1 - Math.abs(y - sweep * 0.22) / 1.2);
        return Math.min(HIGH_OPACITY, BASE_OPACITY + gateA * 0.7 + gateB * 0.7 + centerFlash * 0.42 + wake);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.45,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1850,
        speed: () => speed
      });
      const currentPhase = derived(() => reducedMotion() || phaseController.phase === "idle" ? 0.12 : cycleProgress.current);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(activePatternIndexes(), (cell) => opacityForCell(cell.row, cell.col, currentPhase())));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_3
  );
}
Hex_3.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_4[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-4.svelte";
function Hex_4($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const MID_OPACITY = 0.36;
      const HIGH_OPACITY = 0.98;
      const TRAIL_SPAN = 2.2;
      const VERTEX_PATH = [
        "0,2",
        "1,3",
        "2,4",
        "3,3",
        "4,2",
        "3,0",
        "2,0",
        "1,0",
        "0,0"
      ];
      const ECHO_BY_VERTEX = {
        "0,2": ["0,1", "1,2"],
        "1,3": ["1,2", "2,3"],
        "2,4": ["2,3", "2,2"],
        "3,3": ["3,2", "2,3"],
        "4,2": ["4,1", "3,2"],
        "3,0": ["3,1", "2,1"],
        "2,0": ["2,1", "2,2"],
        "1,0": ["1,1", "2,1"],
        "0,0": ["0,1", "1,1"]
      };
      const PATH_LEN = VERTEX_PATH.length;
      function modF(value, modulo) {
        return (value % modulo + modulo) % modulo;
      }
      function opacityForCell(row, col, phase) {
        const id = `${row},${col}`;
        const head = phase * PATH_LEN;
        const vertexIndex = VERTEX_PATH.indexOf(id);
        let opacity = BASE_OPACITY;
        if (vertexIndex >= 0) {
          const distance = modF(head - vertexIndex, PATH_LEN);
          const glow = Math.max(0, 1 - distance / TRAIL_SPAN);
          opacity = Math.max(opacity, BASE_OPACITY + glow * (HIGH_OPACITY - BASE_OPACITY));
        }
        for (let index = 0; index < PATH_LEN; index += 1) {
          const vertex = VERTEX_PATH[index];
          if (!ECHO_BY_VERTEX[vertex].includes(id)) {
            continue;
          }
          const distance = modF(head - index, PATH_LEN);
          const echo = Math.max(0, 1 - Math.abs(distance - 0.55) / 1.45);
          opacity = Math.max(opacity, BASE_OPACITY + echo * 0.52);
        }
        if (id === "2,2") {
          const centerBeat = 0.5 + 0.5 * Math.sin(phase * Math.PI * PATH_LEN);
          opacity = Math.max(opacity, MID_OPACITY + centerBeat * 0.22);
        }
        const { x, y } = pointForCell(row, col);
        const softFill = Math.max(0, 1 - Math.sqrt(x * x + y * y) / 2.35) * 0.1;
        return Math.min(HIGH_OPACITY, opacity + softFill);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.5,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1650,
        speed: () => speed
      });
      const currentPhase = derived(() => reducedMotion() || phaseController.phase === "idle" ? 0.12 : cycleProgress.current);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(activePatternIndexes(), (cell) => opacityForCell(cell.row, cell.col, currentPhase())));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_4
  );
}
Hex_4.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_5[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-5.svelte";
function Hex_5($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const HIGH_OPACITY = 0.96;
      function wavePeak(value) {
        const wrapped = (value % 1 + 1) % 1;
        return Math.max(0, 1 - Math.abs(wrapped * 2 - 1) / 0.55);
      }
      function opacityForCell(row, col, phase) {
        const { x, y } = pointForCell(row, col);
        const angle = Math.atan2(y, x);
        const radius = Math.sqrt(x * x + y * y);
        const spiral = phase + radius * 0.18 + angle / (Math.PI * 2);
        const counterSpiral = phase * 0.72 - radius * 0.16 - angle / (Math.PI * 2);
        const primary = wavePeak(spiral);
        const secondary = wavePeak(counterSpiral) * 0.55;
        const core = radius < 0.1 ? 0.54 + Math.sin(phase * Math.PI * 4) * 0.26 : 0;
        return Math.min(HIGH_OPACITY, BASE_OPACITY + primary * 0.7 + secondary * 0.42 + core);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.75,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1450,
        speed: () => speed
      });
      const currentPhase = derived(() => reducedMotion() || phaseController.phase === "idle" ? 0.18 : cycleProgress.current);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(activePatternIndexes(), (cell) => opacityForCell(cell.row, cell.col, currentPhase())));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_5
  );
}
Hex_5.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_6[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-6.svelte";
function Hex_6($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.1;
      const HIGH_OPACITY = 0.98;
      const BAND_COUNT = 4;
      function wrappedDistance(a, b) {
        const diff = Math.abs(a - b) % BAND_COUNT;
        return Math.min(diff, BAND_COUNT - diff);
      }
      function opacityForCell(row, col, phase) {
        const count = ROW_COUNTS[row] ?? 1;
        const x = col - (count - 1) / 2;
        const y = row - 2;
        const downwardChevron = y + Math.abs(x) * 0.92 + 1.55;
        const upwardChevron = -y + Math.abs(x) * 0.92 + 1.55;
        const head = phase * BAND_COUNT;
        const primary = Math.max(0, 1 - wrappedDistance(downwardChevron, head) / 0.78);
        const secondary = Math.max(0, 1 - wrappedDistance(upwardChevron, head + BAND_COUNT / 2) / 0.92);
        const centerLift = row === 2 && col === 2 ? 0.18 : 0;
        return Math.min(HIGH_OPACITY, BASE_OPACITY + primary * 0.78 + secondary * 0.38 + centerLift);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.55,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1260,
        speed: () => speed
      });
      const currentPhase = derived(() => reducedMotion() || phaseController.phase === "idle" ? 0.12 : cycleProgress.current);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(activePatternIndexes(), (cell) => opacityForCell(cell.row, cell.col, currentPhase())));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_6
  );
}
Hex_6.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_7[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-7.svelte";
function Hex_7($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.2;
      const MID_OPACITY = 0.32;
      const HIGH_OPACITY = 0.98;
      const FRAMES = [
        {
          "0,0": "x",
          "0,1": "x",
          "0,2": "x",
          "1,1": "o",
          "1,2": "o",
          "2,2": "x",
          "3,1": "o",
          "3,2": "o",
          "4,0": "x",
          "4,1": "x",
          "4,2": "x"
        },
        {
          "0,1": "o",
          "1,0": "x",
          "1,1": "x",
          "1,2": "x",
          "1,3": "x",
          "2,2": "o",
          "3,0": "x",
          "3,1": "x",
          "3,2": "x",
          "3,3": "x",
          "4,1": "o"
        },
        {
          "0,1": "x",
          "1,1": "x",
          "1,2": "x",
          "2,0": "o",
          "2,1": "x",
          "2,2": "x",
          "2,3": "x",
          "2,4": "o",
          "3,1": "x",
          "3,2": "x",
          "4,1": "x"
        },
        {
          "0,0": "o",
          "0,2": "o",
          "1,0": "x",
          "1,3": "x",
          "2,1": "x",
          "2,2": "o",
          "2,3": "x",
          "3,0": "x",
          "3,3": "x",
          "4,0": "o",
          "4,2": "o"
        }
      ];
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.9,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const steppedCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1520,
        steps: () => FRAMES.length,
        speed: () => speed
      });
      const frame = derived(() => FRAMES[reducedMotion() || phaseController.phase === "idle" ? 0 : steppedCycle.current] ?? FRAMES[0]);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(
        activePatternIndexes(),
        (cell) => {
          const tone = frame()[cell.id];
          return tone === "x" ? HIGH_OPACITY : tone === "o" ? MID_OPACITY : BASE_OPACITY;
        },
        () => ({ transition: "opacity 170ms ease-out" })
      ));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_7
  );
}
Hex_7.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_8[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-8.svelte";
function Hex_8($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.2;
      const MID_OPACITY = 0.46;
      const HIGH_OPACITY = 0.98;
      const FRAMES = [
        {
          "0,1": "x",
          "1,1": "o",
          "1,2": "o",
          "2,0": "x",
          "2,2": "x",
          "2,4": "x",
          "3,1": "o",
          "3,2": "o",
          "4,1": "x"
        },
        {
          "0,0": "x",
          "0,2": "x",
          "1,0": "o",
          "1,3": "o",
          "2,1": "x",
          "2,2": "o",
          "2,3": "x",
          "3,0": "o",
          "3,3": "o",
          "4,0": "x",
          "4,2": "x"
        },
        {
          "0,1": "o",
          "1,0": "x",
          "1,3": "x",
          "2,0": "o",
          "2,2": "x",
          "2,4": "o",
          "3,0": "x",
          "3,3": "x",
          "4,1": "o"
        },
        {
          "0,0": "o",
          "0,2": "o",
          "1,1": "x",
          "1,2": "x",
          "2,1": "o",
          "2,3": "o",
          "3,1": "x",
          "3,2": "x",
          "4,0": "o",
          "4,2": "o"
        }
      ];
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.35,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const steppedCycle = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1400,
        steps: () => FRAMES.length,
        speed: () => speed
      });
      const frame = derived(() => FRAMES[reducedMotion() || phaseController.phase === "idle" ? 0 : steppedCycle.current] ?? FRAMES[0]);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(
        activePatternIndexes(),
        (cell) => {
          const tone = frame()[cell.id];
          return tone === "x" ? HIGH_OPACITY : tone === "o" ? MID_OPACITY : BASE_OPACITY;
        },
        () => ({ transition: "opacity 160ms ease-out" })
      ));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_8
  );
}
Hex_8.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_9[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-9.svelte";
function Hex_9($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.15;
      const HIGH_OPACITY = 0.98;
      const PETAL_WIDTH = 0.42;
      function angularDistance(a, b) {
        return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      }
      function opacityForCell(row, col, phase) {
        const { x, y } = pointForCell(row, col);
        const angle = Math.atan2(y, x);
        const radius = Math.sqrt(x * x + y * y);
        if (radius < 0.1) {
          return 0.42 + Math.sin(phase * Math.PI * 2) * 0.2;
        }
        const rotation = phase * Math.PI * 2;
        const petalA = Math.max(0, 1 - angularDistance(angle, rotation) / PETAL_WIDTH);
        const petalB = Math.max(0, 1 - angularDistance(angle, rotation + Math.PI) / PETAL_WIDTH);
        const crossA = Math.max(0, 1 - angularDistance(angle, rotation + Math.PI / 2) / 0.52) * 0.46;
        const crossB = Math.max(0, 1 - angularDistance(angle, rotation + Math.PI * 1.5) / 0.52) * 0.46;
        const ring = (0.5 + 0.5 * Math.sin(phase * Math.PI * 2 - radius * 2.7)) * (radius > 1.3 ? 0.22 : 0.1);
        const petalPeak = Math.max(petalA, petalB);
        if (petalPeak > 0.92) {
          return HIGH_OPACITY;
        }
        return Math.min(HIGH_OPACITY, BASE_OPACITY + petalPeak * 0.82 + crossA + crossB + ring);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.8,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1650,
        speed: () => speed
      });
      const currentPhase = derived(() => reducedMotion() || phaseController.phase === "idle" ? 0.1 : cycleProgress.current);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(activePatternIndexes(), (cell) => opacityForCell(cell.row, cell.col, currentPhase())));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_9
  );
}
Hex_9.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Hex_10[FILENAME] = "src/desktop-renderer/lib/components/loaders/hex/hex-10.svelte";
function Hex_10($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.09;
      const HIGH_OPACITY = 0.98;
      function ripple(value, width) {
        const wrapped = (value % 1 + 1) % 1;
        const distance = Math.min(wrapped, 1 - wrapped);
        return Math.max(0, 1 - distance / width);
      }
      function opacityForCell(row, col, phase) {
        const { x, y } = pointForCell(row, col);
        const radius = Math.sqrt(x * x + y * y);
        const lensCenter = Math.sin(phase * Math.PI * 2) * 1.15;
        const lensDistance = Math.abs(lensCenter - x * 0.88 - y * 0.16);
        const liquidLens = Math.max(0, 1 - lensDistance / 0.78);
        const wakeFront = ripple(phase + x * 0.12 - y * 0.045 + radius * 0.07, 0.16);
        const wakeBack = ripple(phase + 0.34 + x * 0.09 + y * 0.035 + radius * 0.05, 0.2) * 0.34;
        const verticalCompression = Math.max(0, 1 - Math.abs(Math.cos(phase * Math.PI * 2) * 1.18 - y * 1.25) / 1.1) * 0.18;
        const shellSheen = (0.5 + 0.5 * Math.sin(phase * Math.PI * 2 - radius * 1.9)) * (radius > 1.35 ? 0.16 : 0.06);
        const core = radius < 0.1 ? 0.34 + Math.sin(phase * Math.PI * 2) * 0.1 : 0;
        return Math.min(HIGH_OPACITY, BASE_OPACITY + liquidLens * 0.72 + wakeFront * 0.38 + wakeBack + verticalCompression + shellSheen + core);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1.55,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 33,
        dotSize = 5,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1850,
        speed: () => speed
      });
      const currentPhase = derived(() => reducedMotion() || phaseController.phase === "idle" ? 0.14 : cycleProgress.current);
      const activePatternIndexes = derived(() => new Set(getPatternIndexes(pattern)));
      const cells = derived(() => buildHexCells(activePatternIndexes(), (cell) => opacityForCell(cell.row, cell.col, currentPhase())));
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Hex_base($$renderer2, spread_props([
        {
          speed,
          size,
          dotSize,
          animated,
          hoverAnimated,
          cells: cells(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Hex_10
  );
}
Hex_10.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
const TRIANGLE_MATRIX_SIZE = 7;
const TRIANGLE_VISIBLE_ROW_START = 1;
const TRIANGLE_VISIBLE_ROW_END = 4;
const TRIANGLE_VISIBLE_ROW_COUNT = TRIANGLE_VISIBLE_ROW_END - TRIANGLE_VISIBLE_ROW_START + 1;
const TRIANGLE_COORDS = [
  [1, 3],
  [2, 2],
  [2, 4],
  [3, 1],
  [3, 3],
  [3, 5],
  [4, 0],
  [4, 2],
  [4, 4],
  [4, 6]
];
function triangleIndex(row, col) {
  return row * TRIANGLE_MATRIX_SIZE + col;
}
const TRIANGLE_ACTIVE_INDEXES = TRIANGLE_COORDS.map(([row, col]) => triangleIndex(row, col));
const TRIANGLE_KEYS = new Set(TRIANGLE_COORDS.map(([row, col]) => `${row},${col}`));
function isWithinTriangleMask(row, col) {
  if (row < 0 || row >= TRIANGLE_MATRIX_SIZE || col < 0 || col >= TRIANGLE_MATRIX_SIZE) {
    return false;
  }
  return TRIANGLE_KEYS.has(`${row},${col}`);
}
Triangle_1[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-1.svelte";
function Triangle_1($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const STEP_COUNT = 30;
      const BASE_OPACITY = 0.08;
      const CENTER_OPACITY = 0.24;
      const CENTER_ROW = 3;
      const CENTER_COL = 3;
      const TAIL_LEVELS = [0.96, 0.72, 0.52, 0.34, 0.2];
      const PERIMETER_PATH = [
        [1, 3],
        [2, 2],
        [3, 1],
        [4, 0],
        [4, 2],
        [4, 4],
        [4, 6],
        [3, 5],
        [2, 4]
      ];
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const step = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1650,
        steps: () => STEP_COUNT,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const frame = reducedMotion() ? 0 : step.current;
        return ({ isActive, row, col, phase }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          const currentFrame = phase === "idle" ? 0 : frame;
          let opacity = BASE_OPACITY;
          if (row === CENTER_ROW && col === CENTER_COL) {
            opacity = CENTER_OPACITY;
          }
          const head = Math.floor(currentFrame / STEP_COUNT * PERIMETER_PATH.length) % PERIMETER_PATH.length;
          for (let trail = 0; trail < TAIL_LEVELS.length; trail += 1) {
            const idx = (head - trail + PERIMETER_PATH.length) % PERIMETER_PATH.length;
            const [pathRow, pathCol] = PERIMETER_PATH[idx];
            if (row === pathRow && col === pathCol) {
              opacity = Math.max(opacity, TAIL_LEVELS[trail]);
              break;
            }
          }
          return { style: { opacity } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Dot_matrix_base($$renderer2, spread_props([
        {
          speed,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_1
  );
}
Triangle_1.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_base[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-base.svelte";
function Triangle_base($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      function cn(...tokens) {
        return clsx$1(tokens);
      }
      function mergeStyles(...styles) {
        const tokens = styles.filter(Boolean);
        return tokens.length > 0 ? tokens.join("; ") : void 0;
      }
      function normalizeStyle(style) {
        return style ?? void 0;
      }
      function manhattanDistance(row, col, center) {
        return Math.abs(row - center) + Math.abs(col - center);
      }
      const TRIANGLE_ROW_GROUPS = Array.from({ length: TRIANGLE_VISIBLE_ROW_COUNT }, (_, index) => {
        const row = TRIANGLE_VISIBLE_ROW_START + index;
        return TRIANGLE_COORDS.filter(([coordRow]) => coordRow === row);
      });
      let {
        ref = null,
        class: className,
        style: userStyle,
        role = "status",
        "aria-live": ariaLive = "polite",
        "aria-label": ariaLabel = "Loading",
        onmouseenter,
        onmouseleave,
        size = 34,
        dotSize = 6,
        color = "currentColor",
        speed = 1,
        muted = false,
        bloom = false,
        halo = 0,
        dotClass = void 0,
        opacityBase = void 0,
        opacityMid = void 0,
        opacityPeak = void 0,
        cellPadding = void 0,
        boxSize = void 0,
        minSize = void 0,
        activeIndexes = void 0,
        phase = "idle",
        reducedMotion = false,
        animationResolver = void 0,
        gridSize = TRIANGLE_MATRIX_SIZE,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const safeSpeed = derived(() => speed > 0 ? speed : 1);
      const speedScale = derived(() => 1 / safeSpeed());
      const safeGridSize = derived(() => Math.max(1, Math.floor(gridSize)));
      const gridCenter = derived(() => Math.floor(safeGridSize() / 2));
      const outerSize = derived(() => Math.max(boxSize ?? size, minSize ?? 0, size));
      const fitPadding = derived(() => Math.max(1, dotSize * 0.15));
      const drawableSize = derived(() => Math.max(dotSize, outerSize() - fitPadding()));
      const explicitGap = derived(() => cellPadding != null ? Math.max(0, cellPadding) : void 0);
      const colPitch = derived(() => explicitGap() != null ? dotSize + explicitGap() : (drawableSize() - dotSize) / (4 - 1));
      const rowPitch = derived(() => colPitch() * Math.sqrt(3) * 0.5);
      const rawWidth = derived(() => dotSize + colPitch() * 3);
      const rawHeight = derived(() => dotSize + rowPitch() * (TRIANGLE_VISIBLE_ROW_COUNT - 1));
      const scale = derived(() => Math.max(rawWidth(), rawHeight()) > 0 ? drawableSize() / Math.max(rawWidth(), rawHeight()) : 1);
      const baseOpacity = derived(() => clampUnitInterval(opacityBase));
      const midOpacity = derived(() => clampUnitInterval(opacityMid));
      const peakOpacity = derived(() => clampUnitInterval(opacityPeak));
      const allowedIndexes = derived(() => activeIndexes ? new Set(Array.from(activeIndexes)) : new Set(TRIANGLE_COORDS.map(([row, col]) => triangleIndex(row, col))));
      const matrixClass = derived(() => cn("dmx-root", muted && "dmx-muted", isBloomRootActive(bloom, halo) && "dmx-bloom", getBloomHaloSpreadClass(halo)));
      const wrapperStyle = derived(() => mergeStyles(
        styleEntriesToString({
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          width: stylePx(outerSize()),
          height: stylePx(outerSize()),
          overflow: "hidden"
        }),
        normalizeStyle(userStyle)
      ));
      const rootStyle = derived(() => styleEntriesToString({
        width: stylePx(rawWidth()),
        height: stylePx(rawHeight()),
        "--dmx-speed": speedScale(),
        "--dmx-dot-size": stylePx(dotSize),
        color,
        position: "relative",
        transform: `scale(${scale()})`,
        "transform-origin": "center center",
        ...baseOpacity() !== void 0 && { "--dmx-opacity-base": baseOpacity() },
        ...midOpacity() !== void 0 && { "--dmx-opacity-mid": midOpacity() },
        ...peakOpacity() !== void 0 && { "--dmx-opacity-peak": peakOpacity() }
      }));
      const dots = derived(() => TRIANGLE_ROW_GROUPS.flatMap((rowGroup, rowIndex) => {
        const activeRowGroup = rowGroup.filter(([row, col]) => allowedIndexes().has(triangleIndex(row, col)));
        const rowWidth = dotSize + colPitch() * Math.max(0, activeRowGroup.length - 1);
        const rowStart = (rawWidth() - rowWidth) / 2;
        return activeRowGroup.flatMap(([row, col], colIndex) => {
          const index = triangleIndex(row, col);
          const left = rowStart + colIndex * colPitch();
          const top = rowIndex * rowPitch();
          const centeredX = left + dotSize / 2 - rawWidth() / 2;
          const centeredY = top + dotSize / 2 - rawHeight() / 2;
          const distance = Math.hypot(centeredX, centeredY);
          const angle = Math.atan2(centeredY, centeredX);
          const maxRadius = Math.hypot(rawWidth() / 2, rawHeight() / 2);
          const radius = maxRadius > 0 ? distance / maxRadius : 0;
          const manhattan = manhattanDistance(row, col, gridCenter());
          const animationState = animationResolver ? animationResolver({
            index,
            row,
            col,
            distanceFromCenter: distance,
            angleFromCenter: angle,
            radiusNormalized: radius,
            manhattanDistance: manhattan,
            phase,
            isActive: true,
            reducedMotion
          }) : {};
          const stylePatch = animationState.style ? { ...animationState.style } : {};
          const rawOpacity = typeof stylePatch.opacity === "number" ? stylePatch.opacity : void 0;
          let isBloomDot = false;
          if (rawOpacity !== void 0) {
            stylePatch.opacity = remapOpacityToTriplet(rawOpacity, baseOpacity(), midOpacity(), peakOpacity());
            const bloomParts = getDotBloomParts(true, rawOpacity, bloom, halo, baseOpacity(), midOpacity(), peakOpacity());
            stylePatch["--dmx-bloom-level"] = bloomParts.level;
            isBloomDot = bloomParts.bloomDot;
          }
          return [
            {
              index,
              className: cn("dmx-dot", isBloomDot && "dmx-bloom-dot", dotClass, animationState.className),
              style: styleEntriesToString({
                position: "absolute",
                left: stylePx(left),
                top: stylePx(top),
                width: stylePx(dotSize),
                height: stylePx(dotSize),
                "--dmx-distance": distance,
                "--dmx-row": row,
                "--dmx-col": col,
                "--dmx-x": stylePx(centeredX),
                "--dmx-y": stylePx(centeredY),
                "--dmx-angle": angle,
                "--dmx-radius": radius,
                "--dmx-manhattan": manhattan,
                ...stylePatch
              })
            }
          ];
        });
      }));
      $$renderer2.push(`<div${attributes(
        {
          role,
          "aria-live": ariaLive,
          "aria-label": ariaLabel,
          class: clsx(className),
          style: wrapperStyle(),
          ...restProps
        },
        "svelte-1c40gnh"
      )}>`);
      push_element($$renderer2, "div", 246, 0);
      $$renderer2.push(`<div${attr_class(clsx(matrixClass()), "svelte-1c40gnh")}${attr_style(rootStyle())}>`);
      push_element($$renderer2, "div", 257, 1);
      $$renderer2.push(`<div class="dmx-triangle-grid svelte-1c40gnh">`);
      push_element($$renderer2, "div", 258, 2);
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(dots());
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let dot = each_array[$$index];
        $$renderer2.push(`<span aria-hidden="true"${attr_class(clsx(dot.className), "svelte-1c40gnh")}${attr_style(dot.style)}>`);
        push_element($$renderer2, "span", 260, 4);
        $$renderer2.push(`</span>`);
        pop_element();
      }
      $$renderer2.push(`<!--]--></div>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
      $$renderer2.push(`</div>`);
      pop_element();
      bind_props($$props, { ref });
    },
    Triangle_base
  );
}
Triangle_base.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_2[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-2.svelte";
function Triangle_2($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const STEP_COUNT = 36;
      const BASE_OPACITY = 0.08;
      const MID_OPACITY = 0.34;
      const HIGH_OPACITY = 0.94;
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        cellPadding = 0,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const step = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1550,
        steps: () => STEP_COUNT,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const frame = reducedMotion() ? 0 : step.current;
        return ({ isActive, row, col, phase }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          const progress = (phase === "idle" ? 0 : frame) / STEP_COUNT;
          const rowPhase = (4 - row) * 0.13;
          const pulse = 0.5 - 0.5 * Math.cos((progress + rowPhase) * Math.PI * 2);
          const crest = pulse * pulse;
          const altitudeWeight = 0.58 + (4 - row) * 0.16;
          const centerWeight = col === 3 ? 0.16 : 0;
          const opacity = Math.min(HIGH_OPACITY, BASE_OPACITY + pulse * (MID_OPACITY - BASE_OPACITY) + crest * (altitudeWeight + centerWeight) * (HIGH_OPACITY - MID_OPACITY));
          return { style: { opacity } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_2
  );
}
Triangle_2.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_3[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-3.svelte";
function Triangle_3($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const STEP_COUNT = 36;
      const BASE_OPACITY = 0.03;
      const MID_OPACITY = 0.07;
      const HIGH_OPACITY = 0.94;
      const FAR_OPACITY = 0.15;
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const step = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1650,
        steps: () => STEP_COUNT,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const frame = reducedMotion() ? 0 : step.current;
        return ({ isActive, row, col, phase }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          const theta = (phase === "idle" ? 0 : frame) / STEP_COUNT * Math.PI * 2;
          const sweepX = Math.cos(theta);
          const sweepY = Math.sin(theta);
          const ambientPulse = 0.5 - 0.5 * Math.cos(theta);
          const centerRow = row - 3;
          const centerCol = col - 3;
          const radius = Math.hypot(centerRow, centerCol);
          const projection = centerCol * sweepX + centerRow * sweepY;
          const perpendicular = Math.abs(centerCol * sweepY - centerRow * sweepX);
          const ahead = Math.max(0, projection);
          const beamCore = Math.max(0, 1 - perpendicular / 0.45);
          const beamHalo = Math.max(0, 1 - perpendicular / 1.15);
          const rangeFade = Math.max(0.25, 1 - radius / 3.6);
          const trail = beamHalo * Math.max(0, 1 - ahead / 3.6);
          let opacity = BASE_OPACITY + ambientPulse * (MID_OPACITY - BASE_OPACITY) * rangeFade;
          opacity = Math.max(opacity, MID_OPACITY + beamCore * (HIGH_OPACITY - MID_OPACITY));
          opacity = Math.max(opacity, FAR_OPACITY + trail * (MID_OPACITY - FAR_OPACITY));
          if (row === 3 && col === 3) {
            opacity = Math.max(opacity, 0.56);
          }
          return { style: { opacity: Math.min(HIGH_OPACITY, opacity) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_3
  );
}
Triangle_3.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_4[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-4.svelte";
function Triangle_4($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const STEP_COUNT = 28;
      const BASE_OPACITY = 0;
      const MID_OPACITY = 0;
      const TRAIL_LEVELS = [0.96, 0.52, 0.3];
      const PERIMETER_PATH = [
        [1, 3],
        [2, 2],
        [3, 1],
        [4, 0],
        [4, 2],
        [4, 4],
        [4, 6],
        [3, 5],
        [2, 4]
      ];
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const step = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1450,
        steps: () => STEP_COUNT,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const frame = reducedMotion() ? 0 : step.current;
        const segmentLength = Math.max(1, Math.floor(STEP_COUNT / 3));
        return ({ isActive, row, col, phase }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          let opacity = row === 3 && col === 3 ? MID_OPACITY : BASE_OPACITY;
          const currentFrame = phase === "idle" ? 0 : frame;
          for (let headOffset = 0; headOffset < 3; headOffset += 1) {
            const spokeFrame = (currentFrame + headOffset * segmentLength) % STEP_COUNT;
            const head = Math.floor(spokeFrame / STEP_COUNT * PERIMETER_PATH.length);
            for (let trail = 0; trail < TRAIL_LEVELS.length; trail += 1) {
              const idx = (head - trail + PERIMETER_PATH.length) % PERIMETER_PATH.length;
              const [pathRow, pathCol] = PERIMETER_PATH[idx];
              if (row === pathRow && col === pathCol) {
                opacity = Math.max(opacity, TRAIL_LEVELS[trail]);
                break;
              }
            }
          }
          return { style: { opacity } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_4
  );
}
Triangle_4.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_5[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-5.svelte";
function Triangle_5($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const STEP_COUNT = 42;
      const BASE_OPACITY = 0.06;
      const MID_OPACITY = 0.3;
      const HIGH_OPACITY = 0.92;
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const step = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1700,
        steps: () => STEP_COUNT,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const frame = reducedMotion() ? 0 : step.current;
        return ({ isActive, row, col, phase }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          const progress = (phase === "idle" ? 0 : frame) / STEP_COUNT;
          const pingPong = 0.5 - 0.5 * Math.cos(progress * Math.PI * 2);
          const scanRow = 1 + pingPong * 3;
          const distance = Math.abs(row - scanRow);
          const beam = Math.max(0, 1 - distance / 2.2);
          const easedBeam = beam * beam;
          let opacity = BASE_OPACITY + easedBeam * (HIGH_OPACITY - BASE_OPACITY);
          if (distance > 1.3) {
            opacity = Math.max(opacity, MID_OPACITY - Math.min(0.18, (distance - 1.3) * 0.12));
          }
          if (row === 3 && col === 3) {
            opacity = Math.max(opacity, 0.42);
          }
          return { style: { opacity } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_5
  );
}
Triangle_5.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_6[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-6.svelte";
function Triangle_6($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const D1 = 1;
      const D2 = 2;
      const D3 = 4;
      const D4 = 8;
      const D5 = 16;
      const D6 = 32;
      const LOW_OPACITY = 0.07;
      const MID_OPACITY = 0.36;
      const HIGH_OPACITY = 0.96;
      const WAVE_HALF = 0.82;
      const INTRO_PHASE = 0.52;
      const BIT_TO_FILL_INDEX = { [D1]: 0, [D2]: 1, [D3]: 2, [D4]: 3, [D5]: 4, [D6]: 5 };
      function smoothstep01(edge0, edge1, x) {
        if (edge1 <= edge0) {
          return x >= edge1 ? 1 : 0;
        }
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function waveFills(introT) {
        const waveCenter = -WAVE_HALF + introT * (5 + 2 * WAVE_HALF);
        return [0, 1, 2, 3, 4, 5].map((index) => smoothstep01(index - WAVE_HALF, index + WAVE_HALF, waveCenter));
      }
      function brailleBitForTriangle(row, col) {
        if (row === 2 && col === 2) return D1;
        if (row === 3 && col === 1) return D2;
        if (row === 4 && col === 0) return D3;
        if (row === 2 && col === 4) return D4;
        if (row === 3 && col === 5) return D5;
        if (row === 4 && col === 6) return D6;
        return null;
      }
      function meanFills(indices, fills) {
        let sum = 0;
        for (const index of indices) {
          sum += fills[index] ?? 0;
        }
        return sum / indices.length;
      }
      function opacityForCell(row, col, fills, blinkMul, resetMul) {
        const lift = (base) => LOW_OPACITY + (base - LOW_OPACITY) * blinkMul * resetMul;
        const bit = brailleBitForTriangle(row, col);
        if (bit !== null) {
          const idx = BIT_TO_FILL_INDEX[bit] ?? 0;
          const raw = LOW_OPACITY + (HIGH_OPACITY - LOW_OPACITY) * (fills[idx] ?? 0);
          return lift(raw);
        }
        if (row === 1 && col === 3) {
          const mean = meanFills([0, 3], fills);
          const raw = LOW_OPACITY + (HIGH_OPACITY - LOW_OPACITY) * mean * 0.92 + (MID_OPACITY - LOW_OPACITY) * (1 - mean) * 0.35;
          return lift(Math.min(HIGH_OPACITY, raw));
        }
        if (row === 3 && col === 3) {
          const mean = meanFills([0, 1, 2, 3, 4, 5], fills);
          const raw = LOW_OPACITY + (HIGH_OPACITY - LOW_OPACITY) * mean * 0.88 + (MID_OPACITY - LOW_OPACITY) * (1 - mean) * 0.4;
          return lift(Math.min(HIGH_OPACITY, raw));
        }
        if (row === 4 && col === 2) {
          return lift(LOW_OPACITY + (MID_OPACITY + 0.28 - LOW_OPACITY) * meanFills([1, 2], fills));
        }
        if (row === 4 && col === 4) {
          return lift(LOW_OPACITY + (MID_OPACITY + 0.28 - LOW_OPACITY) * meanFills([4, 5], fills));
        }
        return LOW_OPACITY;
      }
      function cycleParams(phase) {
        {
          return {
            fills: waveFills(phase / INTRO_PHASE),
            blinkMul: 1,
            resetMul: 1
          };
        }
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        cellPadding = 2,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 3e3,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const params = reducedMotion() || phaseController.phase === "idle" ? {
          fills: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55],
          blinkMul: 1,
          resetMul: 1
        } : cycleParams(cycleProgress.current);
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return {
            style: {
              opacity: opacityForCell(row, col, params.fills, params.blinkMul, params.resetMul)
            }
          };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_6
  );
}
Triangle_6.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_7[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-7.svelte";
function Triangle_7($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.06;
      const MID_OPACITY = 0.38;
      const HIGH_OPACITY = 0.96;
      function opacityForCell(row, col, phase) {
        const diagonal = row + col;
        const t = phase * Math.PI * 2;
        const u = diagonal * 0.55 - t * 1.35;
        const primary = 0.5 + 0.5 * Math.cos(u);
        const harmonic = 0.5 + 0.5 * Math.cos(u * 2 + 0.4);
        const crest = primary * primary * 0.92 + Math.max(0, harmonic - 0.35) * 0.28;
        let opacity = BASE_OPACITY + crest * (HIGH_OPACITY - BASE_OPACITY);
        if (row === 3 && col === 3) {
          opacity = Math.max(opacity, MID_OPACITY + (crest - 0.25) * 0.35);
        }
        return Math.min(HIGH_OPACITY, opacity);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 2200,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.22 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_7
  );
}
Triangle_7.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_8[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-8.svelte";
function Triangle_8($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.05;
      const MID_OPACITY = 0.42;
      const HIGH_OPACITY = 0.96;
      const LEFT_WING = /* @__PURE__ */ new Set(["2,2", "3,1", "4,0", "4,2"]);
      const RIGHT_WING = /* @__PURE__ */ new Set(["2,4", "3,5", "4,4", "4,6"]);
      function sectorForCell(row, col) {
        const key = `${row},${col}`;
        if ((row === 1 || row === 3) && col === 3) return "spine";
        if (LEFT_WING.has(key)) return "left";
        if (RIGHT_WING.has(key)) return "right";
        return "none";
      }
      function opacityForCell(row, col, phase) {
        const p = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
        const leftLift = p * p;
        const rightLift = (1 - p) * (1 - p);
        const crossover = Math.max(0, 1 - 4 * (p - 0.5) * (p - 0.5));
        const sector = sectorForCell(row, col);
        if (sector === "none") return 0;
        if (sector === "spine") {
          if (row === 1 && col === 3) {
            return Math.min(HIGH_OPACITY, MID_OPACITY + crossover * (HIGH_OPACITY - MID_OPACITY) * 0.95);
          }
          const hub = BASE_OPACITY + crossover * 0.55 * (HIGH_OPACITY - BASE_OPACITY) + leftLift * 0.08 + rightLift * 0.08;
          return Math.min(HIGH_OPACITY, hub);
        }
        if (sector === "left") {
          return Math.min(HIGH_OPACITY, BASE_OPACITY + leftLift * (HIGH_OPACITY - BASE_OPACITY));
        }
        return Math.min(HIGH_OPACITY, BASE_OPACITY + rightLift * (HIGH_OPACITY - BASE_OPACITY));
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1500,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.25 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_8
  );
}
Triangle_8.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_9[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-9.svelte";
function Triangle_9($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.14;
      const HIGH_OPACITY = 0.96;
      const DELTAS_8 = [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1]
      ];
      function buildBfsRingFromCenter() {
        const dist = /* @__PURE__ */ new Map();
        const start = "3,3";
        if (!TRIANGLE_COORDS.some(([row, col]) => row === 3 && col === 3)) {
          return dist;
        }
        const queue = [[3, 3]];
        dist.set(start, 0);
        let head = 0;
        while (head < queue.length) {
          const [row, col] = queue[head];
          head += 1;
          const current = dist.get(`${row},${col}`);
          for (const [dRow, dCol] of DELTAS_8) {
            const nextRow = row + dRow;
            const nextCol = col + dCol;
            const key = `${nextRow},${nextCol}`;
            if (isWithinTriangleMask(nextRow, nextCol) && !dist.has(key)) {
              dist.set(key, current + 1);
              queue.push([nextRow, nextCol]);
            }
          }
        }
        return dist;
      }
      const BFS_RING = buildBfsRingFromCenter();
      const MAX_RING = Math.max(0, ...BFS_RING.values());
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        const ring = BFS_RING.get(`${row},${col}`) ?? 0;
        const span = Math.max(1, MAX_RING);
        const t = phase * Math.PI * 2;
        const u = ring / span * Math.PI * 2 - t;
        const wave = 0.5 + 0.5 * Math.cos(u);
        const crest = smoothstep01(0.35, 1, wave);
        return Math.min(HIGH_OPACITY, BASE_OPACITY + crest * (HIGH_OPACITY - BASE_OPACITY));
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1800,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.18 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_9
  );
}
Triangle_9.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_10[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-10.svelte";
function Triangle_10($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const STEP_COUNT = 36;
      const BASE_OPACITY = 0.07;
      const TAIL_LEVELS = [0.94, 0.68, 0.42, 0.24];
      const COLUMN_RAKE_PATH = [
        [4, 0],
        [3, 1],
        [4, 2],
        [2, 2],
        [3, 3],
        [1, 3],
        [4, 4],
        [2, 4],
        [4, 6],
        [3, 5]
      ];
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const step = createSteppedCycle({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1750,
        steps: () => STEP_COUNT,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const frame = reducedMotion() ? 0 : step.current;
        const pathLen = COLUMN_RAKE_PATH.length;
        const head = Math.floor((phaseController.phase === "idle" ? 0 : frame) / STEP_COUNT * pathLen) % pathLen;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          let opacity = BASE_OPACITY;
          for (let trail = 0; trail < TAIL_LEVELS.length; trail += 1) {
            const idx = (head - trail + pathLen) % pathLen;
            const [pathRow, pathCol] = COLUMN_RAKE_PATH[idx];
            if (row === pathRow && col === pathCol) {
              opacity = Math.max(opacity, TAIL_LEVELS[trail]);
              break;
            }
          }
          return { style: { opacity } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_10
  );
}
Triangle_10.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_11[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-11.svelte";
function Triangle_11($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.13;
      const MID_OPACITY = 0.36;
      const HIGH_OPACITY = 0.96;
      const APEX_ROW = 1;
      const APEX_COL = 3;
      function manhattanFromApex(row, col) {
        return Math.abs(row - APEX_ROW) + Math.abs(col - APEX_COL);
      }
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        const tier = manhattanFromApex(row, col);
        const t = phase * Math.PI * 2;
        const u = tier / 6 * Math.PI * 2 - t;
        const wave = 0.5 + 0.5 * Math.cos(u);
        const crest = smoothstep01(0.28, 0.98, wave);
        let opacity = BASE_OPACITY + crest * (HIGH_OPACITY - BASE_OPACITY);
        if (row === 3 && col === 3) {
          opacity = Math.max(opacity, MID_OPACITY + crest * 0.35);
        }
        return Math.min(HIGH_OPACITY, opacity);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1400,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.18 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_11
  );
}
Triangle_11.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_12[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-12.svelte";
function Triangle_12($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.06;
      const MID_OPACITY = 0.34;
      const HIGH_OPACITY = 0.96;
      function smoothstep01(edge0, edge1, x) {
        if (edge1 <= edge0) {
          return x >= edge1 ? 1 : 0;
        }
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        const skew = row - col;
        const t = phase * Math.PI * 2;
        const u = skew * 0.62 - t * 1.45;
        const primary = 0.5 + 0.5 * Math.cos(u);
        const harmonic = 0.5 + 0.5 * Math.cos(u * 2 - 0.55);
        const primarySoft = smoothstep01(0.12, 0.95, primary);
        const harmonicSoft = smoothstep01(0.38, 0.92, harmonic);
        const crest = primarySoft * primarySoft * 0.88 + Math.max(0, harmonicSoft - 0.42) * 0.32;
        let opacity = BASE_OPACITY + crest * (HIGH_OPACITY - BASE_OPACITY);
        if (row === 3 && col === 3) {
          opacity = Math.max(opacity, MID_OPACITY + (crest - 0.22) * 0.4);
        }
        return Math.min(HIGH_OPACITY, opacity);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 2300,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.2 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_12
  );
}
Triangle_12.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_13[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-13.svelte";
function Triangle_13($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.13;
      const HIGH_OPACITY = 0.95;
      const TRAIL_SPAN = 4.25;
      const SERPENT_PATH = [
        [4, 0],
        [4, 2],
        [4, 4],
        [4, 6],
        [3, 5],
        [3, 3],
        [3, 1],
        [2, 2],
        [2, 4],
        [1, 3]
      ];
      function pathIndex(row, col) {
        for (let index = 0; index < SERPENT_PATH.length; index += 1) {
          const [pathRow, pathCol] = SERPENT_PATH[index];
          if (row === pathRow && col === pathCol) return index;
        }
        return null;
      }
      function modF(value, divisor) {
        return (value % divisor + divisor) % divisor;
      }
      function behindAlongPath(step, index, length) {
        return modF(step - index, length);
      }
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        const index = pathIndex(row, col);
        if (index === null) return 0;
        const step = phase * SERPENT_PATH.length;
        const distance = behindAlongPath(step, index, SERPENT_PATH.length);
        const glow = 1 - smoothstep01(0, TRAIL_SPAN, distance);
        return BASE_OPACITY + glow * (HIGH_OPACITY - BASE_OPACITY);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1400,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.14 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_13
  );
}
Triangle_13.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_14[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-14.svelte";
function Triangle_14($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.07;
      const MID_OPACITY = 0.32;
      const HIGH_OPACITY = 0.96;
      function smoothstep01(edge0, edge1, x) {
        if (edge1 <= edge0) {
          return x >= edge1 ? 1 : 0;
        }
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        const beamCenter = phase * 7.2 - 0.35;
        const distance = Math.abs(col - beamCenter);
        const core = 1 - smoothstep01(0, 0.62, distance);
        const halo = 1 - smoothstep01(0.35, 1.42, distance);
        const eased = core * 0.92 + halo * 0.22;
        let opacity = BASE_OPACITY + eased * (HIGH_OPACITY - BASE_OPACITY);
        if (row === 3 && col === 3) {
          opacity = Math.max(opacity, MID_OPACITY + eased * 0.28);
        }
        return Math.min(HIGH_OPACITY, opacity);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1500,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.12 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_14
  );
}
Triangle_14.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_15[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-15.svelte";
function Triangle_15($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const MID_OPACITY = 0.38;
      const HIGH_OPACITY = 0.96;
      const HUBS = [[1, 3], [4, 0], [4, 6]];
      function manhattan(aRow, aCol, bRow, bCol) {
        return Math.abs(aRow - bRow) + Math.abs(aCol - bCol);
      }
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function falloffFromHub(row, col, hub) {
        return 1 - smoothstep01(0, 5.4, manhattan(row, col, hub[0], hub[1]));
      }
      function opacityForCell(row, col, phase) {
        const t = phase * Math.PI * 2;
        const sharp = 4;
        const u0 = Math.max(0, Math.cos(t)) ** sharp;
        const u1 = Math.max(0, Math.cos(t - Math.PI * 2 / 3)) ** sharp;
        const u2 = Math.max(0, Math.cos(t - Math.PI * 4 / 3)) ** sharp;
        const sum = u0 + u1 + u2 + 1e-4;
        const glow = (falloffFromHub(row, col, HUBS[0]) * u0 + falloffFromHub(row, col, HUBS[1]) * u1 + falloffFromHub(row, col, HUBS[2]) * u2) / sum;
        let opacity = BASE_OPACITY + glow * (HIGH_OPACITY - BASE_OPACITY);
        if (row === 3 && col === 3) {
          opacity = Math.max(opacity, MID_OPACITY + glow * 0.32);
        }
        return Math.min(HIGH_OPACITY, opacity);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1100,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.15 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_15
  );
}
Triangle_15.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_16[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-16.svelte";
function Triangle_16($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.1;
      const MID_OPACITY = 0.36;
      const HIGH_OPACITY = 0.96;
      const WING = 0.52;
      const FRONT_SIGMA = 0.88;
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        const t = phase * Math.PI * 2;
        const v = row - WING * Math.abs(col - 3);
        const front = 1.85 + 1.4 * Math.sin(t);
        const d = Math.abs(v - front);
        const glowRaw = Math.exp(-(d * d) / (FRONT_SIGMA * FRONT_SIGMA));
        const glow = smoothstep01(0.04, 0.98, glowRaw);
        let opacity = BASE_OPACITY + glow * (HIGH_OPACITY - BASE_OPACITY);
        if (row === 3 && col === 3) {
          opacity = Math.max(opacity, MID_OPACITY * 0.58 + glow * (HIGH_OPACITY - MID_OPACITY) * 0.48);
        }
        return Math.min(HIGH_OPACITY, opacity);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 2400,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.12 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_16
  );
}
Triangle_16.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_17[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-17.svelte";
function Triangle_17($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.06;
      const HIGH_OPACITY = 0.95;
      const TRAIL_SPAN = 4.35;
      const INFINITY_PATH = [
        [4, 0],
        [3, 1],
        [2, 2],
        [1, 3],
        [2, 4],
        [3, 5],
        [4, 6],
        [4, 4],
        [3, 3],
        [4, 2]
      ];
      function pathIndex(row, col) {
        for (let index = 0; index < INFINITY_PATH.length; index += 1) {
          const [pathRow, pathCol] = INFINITY_PATH[index];
          if (row === pathRow && col === pathCol) return index;
        }
        return null;
      }
      function modF(value, divisor) {
        return (value % divisor + divisor) % divisor;
      }
      function behindAlongPath(step, index, length) {
        return modF(step - index, length);
      }
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        const index = pathIndex(row, col);
        if (index === null) return 0;
        const step = phase * INFINITY_PATH.length;
        const distance = behindAlongPath(step, index, INFINITY_PATH.length);
        const glow = 1 - smoothstep01(0, TRAIL_SPAN, distance);
        return BASE_OPACITY + glow * (HIGH_OPACITY - BASE_OPACITY);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1500,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.12 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_17
  );
}
Triangle_17.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_18[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-18.svelte";
function Triangle_18($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const CORE_DIM = 0.1;
      const SHELL_LOW = 0.22;
      const SHELL_HIGH = 0.96;
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        if (row === 3 && col === 3) return CORE_DIM;
        const breathe = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
        const crest = smoothstep01(0.2, 0.94, breathe);
        return SHELL_LOW + crest * (SHELL_HIGH - SHELL_LOW);
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1600,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.2 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_18
  );
}
Triangle_18.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_19[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-19.svelte";
function Triangle_19($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const MID_OPACITY = 0.38;
      const HIGH_OPACITY = 0.96;
      const CENTER_ROW = 3;
      const CENTER_COL = 3;
      const BEAM_SIGMA = 0.58;
      function angleDiff(a, b) {
        let delta = a - b;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        return delta;
      }
      function smoothstep01(edge0, edge1, x) {
        if (edge1 <= edge0) {
          return x >= edge1 ? 1 : 0;
        }
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function opacityForCell(row, col, phase) {
        if (row === CENTER_ROW && col === CENTER_COL) {
          const hub = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
          return MID_OPACITY + smoothstep01(0.12, 0.9, hub) * 0.22;
        }
        const t = phase * Math.PI * 2;
        const angle = Math.atan2(row - CENTER_ROW, col - CENTER_COL);
        const delta = angleDiff(angle, t);
        const beamRaw = Math.exp(-(delta * delta) / (BEAM_SIGMA * BEAM_SIGMA));
        const beam = smoothstep01(0.05, 0.98, beamRaw);
        const rim = 0.5 + 0.5 * Math.cos(angle * 2 - t * 1.15);
        const accent = smoothstep01(0.45, 0.92, rim) * 0.18;
        return Math.min(HIGH_OPACITY, BASE_OPACITY + (beam + accent) * (HIGH_OPACITY - BASE_OPACITY));
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1400,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.12 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_19
  );
}
Triangle_19.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
Triangle_20[FILENAME] = "src/desktop-renderer/lib/components/loaders/triangle/triangle-20.svelte";
function Triangle_20($$renderer, $$props) {
  $$renderer.component(
    ($$renderer2) => {
      const BASE_OPACITY = 0.08;
      const HIGH_OPACITY = 0.94;
      const CENTER_DIM = 0.2;
      const TRAIL_SPAN = 3.35;
      const PERIMETER_PATH = [
        [1, 3],
        [2, 2],
        [3, 1],
        [4, 0],
        [4, 2],
        [4, 4],
        [4, 6],
        [3, 5],
        [2, 4]
      ];
      const HALF = PERIMETER_PATH.length / 2;
      function pathIndex(row, col) {
        for (let index = 0; index < PERIMETER_PATH.length; index += 1) {
          const [pathRow, pathCol] = PERIMETER_PATH[index];
          if (row === pathRow && col === pathCol) return index;
        }
        return null;
      }
      function modF(value, divisor) {
        return (value % divisor + divisor) % divisor;
      }
      function behindAlongPath(step, index, length) {
        return modF(step - index, length);
      }
      function smoothstep01(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      function glowAlongPath(step, index, length) {
        if (index === null) return BASE_OPACITY;
        const distance = behindAlongPath(step, index, length);
        const glow = 1 - smoothstep01(0, TRAIL_SPAN, distance);
        return BASE_OPACITY + glow * (HIGH_OPACITY - BASE_OPACITY);
      }
      function opacityForCell(row, col, phase) {
        if (row === 3 && col === 3) return CENTER_DIM;
        const index = pathIndex(row, col);
        const stepA = phase * PERIMETER_PATH.length;
        const stepB = modF(stepA + HALF, PERIMETER_PATH.length);
        return Math.min(HIGH_OPACITY, Math.max(glowAlongPath(stepA, index, PERIMETER_PATH.length), glowAlongPath(stepB, index, PERIMETER_PATH.length)));
      }
      let {
        onmouseenter,
        onmouseleave,
        speed = 1,
        pattern = "full",
        animated = true,
        hoverAnimated = false,
        size = 30,
        dotSize = 6,
        $$slots,
        $$events,
        ...restProps
      } = $$props;
      const reducedMotionQuery = createReducedMotionQuery();
      const reducedMotion = derived(() => reducedMotionQuery.current);
      const phaseController = createDotMatrixPhaseController({
        animated: () => Boolean(animated && !reducedMotion()),
        hoverAnimated: () => Boolean(hoverAnimated && !reducedMotion()),
        speed: () => speed
      });
      const cycleProgress = createCycleProgress({
        active: () => !reducedMotion() && phaseController.phase !== "idle",
        cycleMsBase: () => 1800,
        speed: () => speed
      });
      const animationResolver = derived(() => {
        const currentPhase = reducedMotion() || phaseController.phase === "idle" ? 0.1 : cycleProgress.current;
        return ({ isActive, row, col }) => {
          if (!isActive || !isWithinTriangleMask(row, col)) {
            return { className: "dmx-inactive" };
          }
          return { style: { opacity: opacityForCell(row, col, currentPhase) } };
        };
      });
      function handleMouseEnter(event) {
        phaseController.onMouseEnter();
        onmouseenter?.(event);
      }
      function handleMouseLeave(event) {
        phaseController.onMouseLeave();
        onmouseleave?.(event);
      }
      Triangle_base($$renderer2, spread_props([
        {
          speed,
          pattern,
          animated,
          hoverAnimated,
          size,
          dotSize,
          gridSize: TRIANGLE_MATRIX_SIZE,
          activeIndexes: TRIANGLE_ACTIVE_INDEXES,
          phase: phaseController.phase,
          reducedMotion: reducedMotion(),
          animationResolver: animationResolver(),
          onmouseenter: handleMouseEnter,
          onmouseleave: handleMouseLeave
        },
        restProps
      ]));
    },
    Triangle_20
  );
}
Triangle_20.render = function() {
  throw new Error("Component.render(...) is no longer valid in Svelte 5. See https://svelte.dev/docs/svelte/v5-migration-guide#Components-are-no-longer-classes for more information");
};
export {
  SvelteSet as $,
  Hex_9 as A,
  Hex_10 as B,
  Triangle_2 as C,
  Triangle_3 as D,
  Triangle_4 as E,
  Triangle_5 as F,
  Triangle_6 as G,
  Hex_1 as H,
  Triangle_7 as I,
  Triangle_8 as J,
  Triangle_9 as K,
  Triangle_10 as L,
  Triangle_11 as M,
  Triangle_12 as N,
  Triangle_13 as O,
  Triangle_14 as P,
  Triangle_15 as Q,
  Triangle_16 as R,
  Square_1 as S,
  Triangle_1 as T,
  Triangle_17 as U,
  Triangle_18 as V,
  Triangle_19 as W,
  Triangle_20 as X,
  SvelteMap as Y,
  applyTranscriptOps as Z,
  createSubscriber as _,
  Square_2 as a,
  MediaQuery as a0,
  Square_3 as b,
  Square_4 as c,
  Square_5 as d,
  Square_6 as e,
  Square_7 as f,
  Square_8 as g,
  Square_9 as h,
  Square_10 as i,
  Square_11 as j,
  Square_12 as k,
  Square_13 as l,
  Square_14 as m,
  Square_15 as n,
  Square_16 as o,
  Square_17 as p,
  Square_18 as q,
  Square_19 as r,
  Square_20 as s,
  Hex_2 as t,
  Hex_3 as u,
  Hex_4 as v,
  Hex_5 as w,
  Hex_6 as x,
  Hex_7 as y,
  Hex_8 as z
};
