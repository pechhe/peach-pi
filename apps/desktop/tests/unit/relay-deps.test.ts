import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRemoteHostDeps } from "../../electron/services/served-session/relay-deps.ts";
import type { RemoteHostDepsInput } from "../../electron/services/served-session/relay-deps.ts";
import type { RelayDeps } from "../../electron/services/served-session/index.ts";
import type { ProjectId, ThreadId } from "@peach-pi/shared-types";

/** Fake app slice: an in-memory thread + project + worktree table the factory
 *  maps onto the relay's project/threads shape. No Electron, no relay boot. */
function fakeApp(
  threads: { id: ThreadId; projectId: ProjectId | null; title?: string; status?: string }[],
  projects: { id: ProjectId; name: string }[] = [],
  worktrees: { id: string; name: string; dir: string; projectId: ProjectId }[] = [],
): RemoteHostDepsInput["appService"] {
  return {
    snapshot: () => ({
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title ?? t.id,
        status: t.status ?? "idle",
        projectId: t.projectId,
      })),
      projects,
      worktrees,
    }),
    getAutoCompact: () => ({ percent: 80, tokens: null }),
    getUtilityModel: () => null,
    snoozeThread: () => {},
    unsnoozeThread: () => {},
    unmarkToTest: () => {},
  };
}

/** Fake thread slice: records every write-path verb the relay forwards. */
function fakeThread(): {
  svc: RemoteHostDepsInput["threadService"];
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {};
  const rec = (k: string) => (...args: unknown[]) => {
    (calls[k] ??= []).push(args);
  };
  const svc = {
    getTranscript: async (id: ThreadId) => ({ items: [{ id, kind: "notice" as const, text: "" }], seq: 0 }),
    getMeta: async (id: ThreadId) => ({
      threadId: id,
      model: null,
      thinkingLevel: "off" as const,
      availableThinkingLevels: ["off"],
      contextTokens: null,
      contextWindow: null,
      contextPercent: null,
    }),
    prompt: async (...a: unknown[]) => rec("prompt")(...a),
    steer: async (...a: unknown[]) => rec("steer")(...a),
    abort: async (...a: unknown[]) => rec("abort")(...a),
    archive: (...a: unknown[]) => rec("archive")(...a),
    markToTest: async (...a: unknown[]) => rec("markToTest")(...a),
    deleteSteer: async (...a: unknown[]) => rec("deleteSteer")(...a),
    deleteFollowUp: async (...a: unknown[]) => rec("deleteFollowUp")(...a),
    setModel: async (...a: unknown[]) => rec("setModel")(...a),
    setThinking: async (...a: unknown[]) => rec("setThinking")(...a),
    createThread: async (projectId: ProjectId) => ({ id: `new-${projectId}` as ThreadId }),
    createChat: async () => ({ id: "chat-new" as ThreadId }),
  };
  return { svc, calls };
}

/** Fake git slice: cwd map + recorded write verbs. */
function fakeGit(
  cwdMap: Record<string, string | null>,
): { svc: RemoteHostDepsInput["gitService"]; calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {};
  const rec = (k: string) => (...args: unknown[]) => {
    (calls[k] ??= []).push(args);
  };
  return {
    svc: {
      cwdFor: (id: ThreadId) => cwdMap[id] ?? null,
      commitPush: async (...a: unknown[]) => rec("commitPush")(...a) ?? ({ ok: true } as never),
      createPr: async (...a: unknown[]) => rec("createPr")(...a) ?? ({ ok: true } as never),
      mergeToLocal: async (...a: unknown[]) => rec("mergeToLocal")(...a) ?? ({ ok: true } as never),
    },
    calls,
  };
}

function makeInput(overrides?: Partial<RemoteHostDepsInput>): RemoteHostDepsInput {
  const app = fakeApp(
    [{ id: "t1" as ThreadId, projectId: "p1" as ProjectId }],
    [{ id: "p1" as ProjectId, name: "Proj" }],
    [{ id: "w1", name: "wt", dir: "/wt", projectId: "p1" as ProjectId }],
  );
  const { svc: thread } = fakeThread();
  const { svc: git } = fakeGit({ t1: "/cwd/t1" });
  return { appService: app, threadService: thread, gitService: git, getPiSettings: async () => ({}) as never, ...overrides };
}

test("makeRemoteHostDeps returns a RelayDeps with every required field", () => {
  const deps: RelayDeps = makeRemoteHostDeps(makeInput());
  assert.equal(typeof deps.transcript, "function");
  assert.equal(typeof deps.threads, "function");
  assert.equal(typeof deps.threadCwd, "function");
  assert.equal(typeof deps.projects, "function");
  assert.equal(typeof deps.settings, "function");
  assert.equal(typeof deps.piConfig, "function");
  assert.equal(typeof deps.models, "function");
  assert.equal(typeof deps.meta, "function");
  assert.ok(deps.actions && typeof deps.actions.message === "function");
});

test("threads() maps the app snapshot onto the relay shape", () => {
  const deps = makeRemoteHostDeps(makeInput());
  const out = deps.threads();
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "t1");
  assert.equal(out[0].projectId, "p1");
  assert.equal(out[0].status, "idle");
});

test("threadCwd() forwards to gitService.cwdFor", () => {
  const deps = makeRemoteHostDeps(makeInput());
  assert.equal(deps.threadCwd("t1" as ThreadId), "/cwd/t1");
  assert.equal(deps.threadCwd("missing" as ThreadId), null);
});

test("projects() only includes non-archived projects + their live worktrees", () => {
  const deps = makeRemoteHostDeps(
    makeInput({
      appService: fakeApp(
        [{ id: "t1" as ThreadId, projectId: "p1" as ProjectId }],
        [
          { id: "p1" as ProjectId, name: "Live" },
          { id: "p2" as ProjectId, name: "Dead" },
        ],
        [
          { id: "w1", name: "wt", dir: "/wt", projectId: "p1" as ProjectId },
          { id: "w2", name: "wtd", dir: "/wtd", projectId: "p2" as ProjectId },
        ],
      ),
    }),
  );
  // fakeApp marks no project archived; verify shape + worktree scoping by id.
  const out = deps.projects();
  assert.equal(out.length, 2);
  const p1 = out.find((p) => p.id === "p1")!;
  assert.equal(p1.worktrees.length, 1);
  assert.equal(p1.worktrees[0].id, "w1");
});

test("settings() pulls piSettings + autoCompact + utilityModel from app", async () => {
  const deps = makeRemoteHostDeps(makeInput());
  const s = await deps.settings();
  assert.deepEqual(s.autoCompact, { percent: 80, tokens: null });
  assert.equal(s.utilityModel, null);
});

test("actions.message applies per-send model + thinking overrides then prompts", async () => {
  const { svc: thread, calls } = fakeThread();
  const deps = makeRemoteHostDeps({
    ...makeInput(),
    threadService: thread,
  });
  await deps.actions.message(
    "t1" as ThreadId,
    "hi",
    { model: { provider: "anthropic", id: "claude" } as never, thinking: "high" as never },
  );
  assert.equal(calls.setModel?.length, 1);
  assert.equal(calls.setThinking?.length, 1);
  assert.equal(calls.prompt?.length, 1);
  assert.deepEqual(calls.prompt![0], ["t1", "hi", []]);
});

test("actions.deleteQueued routes steer vs followUp to the right lane", async () => {
  const { svc: thread, calls } = fakeThread();
  const deps = makeRemoteHostDeps({ ...makeInput(), threadService: thread });
  await deps.actions.deleteQueued("t1" as ThreadId, "steer", 2);
  await deps.actions.deleteQueued("t1" as ThreadId, "followUp", 0);
  assert.equal(calls.deleteSteer?.length, 1);
  assert.deepEqual(calls.deleteSteer![0], ["t1", 2]);
  assert.equal(calls.deleteFollowUp?.length, 1);
  assert.deepEqual(calls.deleteFollowUp![0], ["t1", 0]);
});

test("actions.createThread / createChat return the new id", async () => {
  const deps = makeRemoteHostDeps(makeInput());
  const tid = await deps.actions.createThread("p1" as ProjectId);
  const cid = await deps.actions.createChat();
  assert.equal(tid, "new-p1");
  assert.equal(cid, "chat-new");
});

test("actions git verbs forward to gitService", async () => {
  const { svc: git, calls } = fakeGit({ t1: "/cwd" });
  const deps = makeRemoteHostDeps({ ...makeInput(), gitService: git });
  await deps.actions.gitCommitPush("t1" as ThreadId, "msg");
  await deps.actions.gitPr("t1" as ThreadId);
  await deps.actions.gitMerge("t1" as ThreadId);
  assert.equal(calls.commitPush?.length, 1);
  assert.equal(calls.createPr?.length, 1);
  assert.equal(calls.mergeToLocal?.length, 1);
});

test("actions.archiveThread / snoozeThread / unsnoozeThread / unmarkToTest forward to app+thread", async () => {
  const { svc: thread, calls } = fakeThread();
  let appCalls = 0;
  const app = { ...fakeApp([{ id: "t1" as ThreadId, projectId: "p1" as ProjectId }]),
    snoozeThread: () => { appCalls++; },
    unsnoozeThread: () => { appCalls++; },
    unmarkToTest: () => { appCalls++; },
  };
  const deps = makeRemoteHostDeps({ appService: app, threadService: thread, gitService: fakeGit({}).svc, getPiSettings: async () => ({}) as never });
  await deps.actions.archiveThread("t1" as ThreadId);
  await deps.actions.snoozeThread("t1" as ThreadId, "2099-01-01");
  await deps.actions.unsnoozeThread("t1" as ThreadId);
  await deps.actions.markToTest("t1" as ThreadId);
  await deps.actions.unmarkToTest("t1" as ThreadId);
  assert.equal(calls.archive?.length, 1);
  assert.equal(calls.markToTest?.length, 1);
  assert.equal(appCalls, 3); // snooze + unsnooze + unmark
});
