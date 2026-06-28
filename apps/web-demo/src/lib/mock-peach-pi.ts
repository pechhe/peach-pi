import type {
  AppSnapshot,
  PeachPiApi,
  Project,
  Thread,
  ThreadStatus,
  TranscriptDelta,
  TranscriptItem,
  TranscriptOp,
} from "@peach-pi/shared-types";
import { applyTranscriptOps } from "@peach-pi/shared-types";

/**
 * Mock `window.peachPi` for the web demo. Implements the same `PeachPiApi`
 * surface the desktop preload exposes; reads return canned mock data and
 * `threads:prompt` kicks off the canned agent replay (which dispatches
 * `event:transcript` + `event:snapshot` updates to subscribed stores).
 *
 * Installed on `window` early (before the renderer boots) so the snapshot +
 * transcripts stores pick it up via `lib/ipc.ts`'s `window.peachPi`.
 */

type Listener = (payload: never) => void;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
let _n = 0;
const uid = (p = "i"): string => `${p}-${Date.now().toString(36)}-${(_n++).toString(36)}`;

const NOW = Date.now();
const iso = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();

// ─── Mock data ────────────────────────────────────────────────────────────

const mockProjects: Project[] = [
  {
    id: "proj-peach-pi",
    name: "peach-pi",
    path: "~/code/peach-pi",
    kind: "repo",
    order: 0,
    createdAt: iso(-1000 * 60 * 60 * 24 * 14),
    mergeWorkflow: "pr",
  },
  {
    id: "proj-dayjob",
    name: "dayjob",
    path: "~/code/dayjob",
    kind: "repo",
    order: 1,
    createdAt: iso(-1000 * 60 * 60 * 24 * 60),
    mergeWorkflow: "pr",
  },
];

const mockThreads: Thread[] = [
  {
    id: "thread-build-validation",
    projectId: "proj-peach-pi",
    piSessionFile: null,
    title: "Add input validation to login form",
    tag: "feature",
    status: "idle",
    createdAt: iso(-1000 * 60 * 14),
    lastActivityAt: iso(-1000 * 60 * 2),
  },
  {
    id: "thread-fix-api-cors",
    projectId: "proj-peach-pi",
    piSessionFile: null,
    title: "Fix CORS error on /api/threads",
    tag: "bugfix",
    status: "completed",
    createdAt: iso(-1000 * 60 * 60 * 3),
    lastActivityAt: iso(-1000 * 60 * 38),
  },
  {
    id: "thread-doc-telemetry",
    projectId: "proj-dayjob",
    piSessionFile: null,
    title: "Document the telemetry consent flow",
    tag: "docs",
    status: "completed",
    createdAt: iso(-1000 * 60 * 60 * 26),
    lastActivityAt: iso(-1000 * 60 * 60 * 22),
  },
];

const mockSnapshot: AppSnapshot = {
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
    archiveThreadWorktreeWarningDismissed: false,
  },
};

/** Pre-seeded transcript for the two finished threads so opening them
 *  in the demo isn't an empty experience. */
const seedTranscripts: Record<string, TranscriptItem[]> = {
  "thread-fix-api-cors": [
    {
      id: "c1",
      kind: "user",
      text: "Getting a CORS error when /api/threads is hit from localhost:5173. Can you fix it?",
    },
    {
      id: "c2",
      kind: "assistant",
      text: "Done — added `localhost:5173` to the CORS allowlist in `apps/desktop/electron/main.ts` (line 84, inside the `session.defaultSession.webRequest.onHeadersReceived` filter). The dev server origin is now whitelisted only in development via `import.meta.env.DEV` so production stays locked down.",
      thinking: "User reports CORS on /api/threads. Looking at the main process, the onHeadersReceived handler sets Access-Control-Allow-Origin to the app origin only — localhost is different. Need to allow the dev origin during dev builds.",
      streaming: false,
    },
  ],
  "thread-doc-telemetry": [
    {
      id: "d1",
      kind: "user",
      text: "Document the telemetry consent flow on the privacy policy page.",
    },
    {
      id: "d2",
      kind: "assistant",
      text: "Updated `docs/privacy-policy.md` with a new **Consent flow** section that walks through when the dialog appears, what is sent once accepted, and how to revoke. Sketch of what got added:\n\n```md\n## Consent flow\n\nOn first launch, Peach Pi opens a consent dialog covering both crash reporting (Sentry) and product analytics (PostHog). Until the user opts in, no telemetry is sent.\n\nRevoke anytime via Settings → Privacy.\n```\n\nLet me know if you'd like it formatted differently.",
      thinking: "Privacy policy update. The consent dialog fires on first boot; revocation is via Settings. Map that out plainly.",
      streaming: false,
    },
  ],
};

// ─── Mock bridge ──────────────────────────────────────────────────────────

class MockPeachPi {
  private listeners = new Map<string, Set<Listener>>();
  private transcripts = new Map<string, { items: TranscriptItem[]; seq: number }>(
    Object.entries(seedTranscripts).map(([id, items]) => [id, { items, seq: items.length }]),
  );
  private snapshot: AppSnapshot = structuredClone(mockSnapshot);
  private runningReplays = new Set<string>();

  /** Broadcast an event to all subscribers of `channel`. */
  dispatch(channel: string, payload: unknown): void {
    const set = this.listeners.get(channel);
    if (set) for (const fn of set) fn(payload as never);
  }

  private emitOps(threadId: string, ops: TranscriptOp[]): void {
    const entry = this.transcripts.get(threadId) ?? { items: [], seq: 0 };
    entry.seq += 1;
    entry.items = applyTranscriptOps(entry.items, ops);
    this.transcripts.set(threadId, entry);
    const delta: TranscriptDelta = { threadId, ops, seq: entry.seq };
    this.dispatch("event:transcript", delta);
  }

  private setStatus(threadId: string, status: ThreadStatus): void {
    const idx = this.snapshot.threads.findIndex((t) => t.id === threadId);
    if (idx === -1) return;
    const next = [...this.snapshot.threads];
    next[idx] = { ...next[idx]!, status, lastActivityAt: new Date().toISOString() };
    this.snapshot = { ...this.snapshot, threads: next };
    this.dispatch("event:snapshot", structuredClone(this.snapshot));
  }

  /** Kick off the canned replay for a thread (the user message drop + the
   *  assistant response are emitted as event:transcript deltas so the
   *  transcripts store folds them in like a real backend). */
  private async runReplay(threadId: string, userText: string): Promise<void> {
    if (this.runningReplays.has(threadId)) return;
    this.runningReplays.add(threadId);

    const emit = (ops: TranscriptOp | TranscriptOp[]): void =>
      this.emitOps(threadId, Array.isArray(ops) ? ops : [ops]);

    try {
      this.setStatus(threadId, "running");
      await sleep(280);

      const aid = uid("a");
      emit({ op: "upsert", item: { id: aid, kind: "assistant", text: "", thinking: "", streaming: true } });

      // Thinking #1.
      const think1 = "The user wants input validation on the login form. First I'll find the existing form + auth handler, then add field-level validation (email format, password length) and surface errors inline. Let me look at the codebase.";
      await streamInto(emit, aid, think1, "thinking", 18, 44);

      // Tool call #1: bash rg
      const t1id = uid("t");
      emit({
        op: "upsert",
        item: {
          id: t1id,
          kind: "tool",
          toolName: "bash",
          argsSummary: "rg 'loginForm|handleSubmit' apps/desktop/src --type ts",
          output: "",
          status: "running",
        },
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
        item: { id: t1id, kind: "tool", toolName: "bash", argsSummary: "rg 'loginForm|handleSubmit' apps/desktop/src --type ts", output: rgOut, status: "done" },
      });
      await sleep(220);

      // Tool call #2: read file
      const t2id = uid("t");
      emit({
        op: "upsert",
        item: {
          id: t2id,
          kind: "tool",
          toolName: "read",
          argsSummary: "apps/desktop/src/app/Login.svelte L40–75",
          output: "",
          status: "running",
        },
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
        item: { id: t2id, kind: "tool", toolName: "read", argsSummary: "apps/desktop/src/app/Login.svelte L40–75", output: fileOut, status: "done" },
      });
      await sleep(420);

      // Thinking #2.
      const think2 = "Form is raw HTML with no client-side validation; auth:login fires immediately. I'll add a `validate` step in `handleSubmit` (email regex + password length ≥ 8) and inline error spans bound to a Svelte state. Keep it minimal — skip it for now if the form is already validated server-side, but it isn't, so add it.";
      await streamInto(emit, aid, think2, "thinking", 14, 32);

      // Assistant reply with code blocks.
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

      // Finalize (no longer streaming).
      emit({
        op: "upsert",
        item: { id: aid, kind: "assistant", text: reply, thinking: think1 + think2, streaming: false },
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
  invoke: PeachPiApi["invoke"] = ((channel: string, ...args: unknown[]) => {
    switch (channel) {
      case "app:getSnapshot":
        return Promise.resolve(structuredClone(this.snapshot));
      case "threads:getTranscript": {
        const threadId = args[0] as string;
        const entry = this.transcripts.get(threadId);
        return Promise.resolve({ items: entry?.items ?? [], seq: entry?.seq ?? 0 });
      }
      case "threads:prompt": {
        const threadId = args[0] as string;
        // Composer builds an outgoing bundle; pull the text out of whatever
        // shape the caller passed (string or built-outgoing object).
        const body: unknown = args[1];
        let text: string;
        if (typeof body === "string") {
          text = body;
        } else if (
          body &&
          typeof body === "object" &&
          "text" in body &&
          typeof (body as { text?: unknown }).text === "string"
        ) {
          text = (body as { text: string }).text;
        } else {
          text = "(prompt)";
        }
        const userId = `u-${Date.now().toString(36)}`;
        this.emitOps(threadId, [{ op: "upsert", item: { id: userId, kind: "user", text } }]);
        void this.runReplay(threadId, text);
        return Promise.resolve();
      }
      case "threads:abort":
        // We don't model cancelling mid-replay; the demo replays run to completion.
        return Promise.resolve();
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
      case "remote:abort":
      case "remote:message":
      case "remote:steer":
      case "remote:attach":
      case "connectors:list":
        return Promise.resolve(undefined);
      default:
        // Unknown channel — resolve to undefined so the renderer never throws
        // on a call the demo doesn't explicitly mock.
        return Promise.resolve(undefined);
    }
  }) as PeachPiApi["invoke"];

  on: PeachPiApi["on"] = ((channel: string, listener: (payload: never) => void) => {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }) as PeachPiApi["on"];

  getPathForFile = (): string => "";
}

/** Internal: stream `text` into a transcript item field in ~3-7 char runs. */
async function streamInto(
  emit: (ops: TranscriptOp | TranscriptOp[]) => void,
  id: string,
  text: string,
  field: "text" | "thinking" | "output",
  minMs: number,
  maxMs: number,
): Promise<void> {
  let i = 0;
  while (i < text.length) {
    const n = 4 + Math.floor(Math.random() * 4);
    const chunk = text.slice(i, i + n);
    emit({ op: "append", id, field, delta: chunk });
    i += chunk.length;
    await sleep(minMs + Math.random() * (maxMs - minMs));
  }
}

/** Install the mock on `window.peachPi` before the renderer boots. */
export function installMockPeachPi(): void {
  if (typeof window === "undefined") return;
  if ((window as { peachPi?: unknown }).peachPi) return;
  (window as unknown as { peachPi: MockPeachPi }).peachPi = new MockPeachPi();
}

// Self-install at module load so the mock is live the moment ANY importer
// pulls this module in. The desktop renderer's store modules (e.g.
// `recording.svelte.ts`) call `api.invoke(...)` at *module-load* time (during
// `new Store()`); without an early install, that throws because
// `window.peachPi` is still undefined. Importing this mock file early in
// +page.svelte / +layout.svelte guarantees availability before any store.
installMockPeachPi();

/** Hook for the demo's "Try" button to fire the canned replay directly
 *  without going through the Composer's submit path. */
export function triggerDemoPrompt(threadId: string, text: string): void {
  const w = window as unknown as { peachPi?: MockPeachPi };
  const api = w.peachPi;
  if (!api) return;
  const uid_ = `u-${Date.now().toString(36)}`;
  // The dispatcher routes ops via the same emit function the replay uses.
  // We piggyback on threads:prompt so the user message + reply come through
  // the same code path the real Composer uses.
  void api.invoke("threads:prompt" as never, threadId, text);
}
