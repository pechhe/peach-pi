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
export {
  HEX_ROWS as H,
  MATRIX_SIZE as M,
  ROW_COUNTS as R,
  TRIANGLE_ACTIVE_INDEXES as T,
  spiralInwardNormFromIndex as a,
  outerRingClockwiseNormFromIndex as b,
  middleRingAntiClockwiseNormFromIndex as c,
  diagonalSnakeOrderValue as d,
  diagonalSnakeNormFromIndex as e,
  getHexLayout as f,
  getPatternIndexes as g,
  buildHexCells as h,
  TRIANGLE_MATRIX_SIZE as i,
  isWithinTriangleMask as j,
  TRIANGLE_VISIBLE_ROW_COUNT as k,
  TRIANGLE_COORDS as l,
  middleRingAntiClockwiseOrderValue as m,
  TRIANGLE_VISIBLE_ROW_START as n,
  outerRingClockwiseOrderValue as o,
  pointForCell as p,
  triangleIndex as q,
  rowMajorIndex as r,
  spiralInwardOrderValue as s,
  trBlPathNormFromIndex as t,
  applyTranscriptOps as u
};
