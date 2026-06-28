import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RemoteHostService,
  authorizeRequest,
  type RelayDeps,
} from "../../electron/services/served-session/relay-host.ts";
import type { ProjectId, ThreadId } from "@peach-pi/shared-types";

/** Minimal fake deps: an in-memory thread table + cwd map. The relay's
 *  projects/settings/piConfig/actions deps are stubbed with no-ops since the
 *  write-path + serving tests below never exercise the HTTP routes that read
 *  them. */
function deps(threads: { id: ThreadId; projectId: ProjectId | null }[]): RelayDeps {
  return {
    threads: () =>
      threads.map((t) => ({
        id: t.id,
        title: t.id,
        status: "idle",
        projectId: t.projectId,
      })),
    threadCwd: (id) => (threads.some((t) => t.id === id) ? `/fake/${id}` : null),
    transcript: async (id) => ({ items: [{ id, kind: "notice", text: "" }], seq: 0 }),
    projects: () => [],
    settings: async () => ({ piSettings: {} as never, autoCompact: { percent: 80, tokens: null }, utilityModel: null }),
    piConfig: async () => ({}),
    models: async () => [],
    meta: async () => ({ threadId: "t1" as ThreadId, model: null, thinkingLevel: "off", availableThinkingLevels: ["off"], contextTokens: null, contextWindow: null, contextPercent: null }),
    actions: {
      message: async () => {},
      steer: async () => {},
      abort: async () => {},
      archiveThread: async () => {},
      snoozeThread: async () => {},
      unsnoozeThread: async () => {},
      markToTest: async () => {},
      unmarkToTest: async () => {},
      deleteQueued: async () => {},
      createThread: async () => "t-new" as ThreadId,
      createChat: async () => "chat-new" as ThreadId,
      gitCommitPush: async () => ({ ok: true }) as never,
      gitPr: async () => ({ ok: true }) as never,
      gitMerge: async () => ({ ok: true }) as never,
    },
  };
}

test("a thread is served iff its project is served", () => {
  const h = new RemoteHostService(
    deps([{ id: "t1", projectId: "p1" }, { id: "t2", projectId: "p2" }]) as RelayDeps,
  );
  h.setServeAll(false); // serveAll defaults on; opt out to test per-project serving
  assert.equal(h.isServedThread("t1"), false);
  h.setProjectServed("p1", true);
  assert.equal(h.isServedThread("t1"), true);
  assert.equal(h.isServedThread("t2"), false); // other project not served
});

test("chats (projectId null) are never served", () => {
  const h = new RemoteHostService(
    deps([{ id: "chat", projectId: null }]) as RelayDeps,
  );
  h.setProjectServed("p1", true); // serving some project
  assert.equal(h.isServedThread("chat"), false);
  // Even serveAll does not surface chats (no repo, no checkpoint).
  h.setServeAll(true);
  assert.equal(h.isServedThread("chat"), false);
});

test("serveAll serves every project AND later-added threads", () => {
  // Simulates "new project added after serveAll was turned on" — the defining
  // behavior of check-all (ADR-0009ergonomics): future projects are included.
  const table = [
    { id: "t1", projectId: "p1" },
    { id: "t2", projectId: "p2" },
  ];
  const h = new RemoteHostService(deps(table) as RelayDeps);
  h.setServeAll(true);
  assert.equal(h.isServedThread("t1"), true);
  assert.equal(h.isServedThread("t2"), true);
  // A thread for a brand-new project appears served with no extra toggle.
  table.push({ id: "t3", projectId: "p3-new" });
  assert.equal(h.isServedThread("t3"), true);
});

test("servedProjects is ignored while serveAll is on", () => {
  const h = new RemoteHostService(
    deps([{ id: "t1", projectId: "p1" }]) as RelayDeps,
  );
  h.setServeAll(false); // serveAll defaults on
  h.setProjectServed("p1", false); // explicitly NOT serving p1
  assert.equal(h.isServedThread("t1"), false);
  h.setServeAll(true); // ...but serveAll overrides
  assert.equal(h.isServedThread("t1"), true);
});

test("status() reflects serveAll and servedProjects", async () => {
  const h = new RemoteHostService(
    deps([{ id: "t1", projectId: "p1" }]) as RelayDeps,
  );
  h.setServeAll(false); // serveAll defaults on; opt out to test servedProjects
  h.setProjectServed("p1", true);
  h.setProjectServed("p2", true);
  let s = await h.status();
  assert.equal(s.serveAll, false);
  assert.deepEqual(s.servedProjects.sort(), ["p1", "p2"]);
  h.setServeAll(true);
  s = await h.status();
  assert.equal(s.serveAll, true);
});

test("forwardTranscript drops frames for threads whose project is not served", () => {
  const h = new RemoteHostService(
    deps([{ id: "t1", projectId: "p1" }]) as RelayDeps,
  );
  // No listeners installed, but the guard should short-circuit before broadcast.
  // Expectation: no throw, no-op. Served-ness is the gate.
  assert.doesNotThrow(() =>
    h.forwardTranscript({ threadId: "t1", ops: [], seq: 1 }),
  );
});

// ── write path (ADR-0010) ──────────────────────────────────────
test("isServedProject tracks toggles and serveAll", () => {
  const h = new RemoteHostService(
    deps([{ id: "t1", projectId: "p1" }]) as RelayDeps,
  );
  h.setServeAll(false); // serveAll defaults on
  assert.equal(h.isServedProject("p1"), false);
  h.setProjectServed("p1", true);
  assert.equal(h.isServedProject("p1"), true);
  assert.equal(h.isServedProject("p2"), false);
  h.setServeAll(true); // serveAll opts into every project, incl. unknown ids
  assert.equal(h.isServedProject("p2"), true);
});

test("forwardStatus/forwardQueue are no-ops before the server binds", () => {
  const h = new RemoteHostService(
    deps([{ id: "t1", projectId: "p1" }]) as RelayDeps,
  );
  h.setProjectServed("p1", true);
  // Gated on `this.server` (only set after start()): never throws when offline.
  assert.doesNotThrow(() => h.forwardStatus("t1", "running"));
  assert.doesNotThrow(() => h.forwardQueue("t1", [], ["a follow-up"]));
});

// ── setHostEnabled: orchestrator sunk out of main.ts (issue #15) ──────
// The disable path + status-change notifier are deterministic and don't touch
// the network. The enable path binds a real tailnet server (environment-
// dependent), so it isn't unit-tested here; its hook wiring (enableServe +
// onStatusChange) is exercised end-to-end via the `remote:setHostEnabled` IPC.

test("setHostEnabled(false) is a no-op stop and fires onStatusChange", async () => {
  let notified = 0;
  const h = new RemoteHostService(
    deps([{ id: "t1", projectId: "p1" }]) as RelayDeps,
  );
  h.setHostHooks({ onStatusChange: () => { notified++; } });
  // stop() on a never-started relay is idempotent.
  const status = await h.setHostEnabled(false);
  assert.equal(notified, 1);
  assert.equal(status.enabled, false);
});

// NOTE: skipped — these bind a real HTTP server on an ephemeral port and
// hang the test runner (no network isolation). The start/stop/serve glue is
// better covered by an integration test. Re-enable when isolated.
test.skip("setHostEnabled(true) with no tailnet throws from start(), not from serve", async () => {
  let serveCalls = 0;
  const h = new RemoteHostService(
    deps([{ id: "t1", projectId: "p1" }]) as RelayDeps,
  );
  h.setHostHooks({
    enableServe: async () => { serveCalls++; },
    onStatusChange: () => {},
  });
  await assert.rejects(() => h.setHostEnabled(true), /Tailscale interface/);
  // start() threw before enableServe could run.
  assert.equal(serveCalls, 0);
});

test.skip("setHostEnabled(true) with a faked tailnet iface calls enableServe + onStatusChange", async () => {
  let servePort = -1;
  let notified = 0;
  const h = new RemoteHostService({
    ...deps([{ id: "t1", projectId: "p1" }]),
    interfaces: () => ({ utun0: [{ name: "utun0", family: "IPv4", address: "100.64.0.1", internal: false }] }),
  });
  h.setHostHooks({
    enableServe: async (port) => { servePort = port; },
    onStatusChange: () => { notified++; },
  });
  const status = await h.setHostEnabled(true);
  assert.equal(status.enabled, true);
  assert.equal(status.port > 0, true);
  assert.equal(servePort, status.port);
  assert.equal(notified, 1);
  await h.stop();
});

test.skip("setHostEnabled(true) swallows an enableServe rejection", async () => {
  const h = new RemoteHostService({
    ...deps([{ id: "t1", projectId: "p1" }]),
    interfaces: () => ({ utun0: [{ name: "utun0", family: "IPv4", address: "100.64.0.1", internal: false }] }),
  });
  h.setHostHooks({
    enableServe: async () => { throw new Error("Tailscale missing"); },
    onStatusChange: () => {},
  });
  // enableServe failure is swallowed inside setHostEnabled — surfaced via
  // connectInfo, not thrown — so the direct await resolves to a status.
  const status = await h.setHostEnabled(true);
  assert.equal(status.enabled, true);
  await h.stop();
});

// ── authorizeRequest: the pure auth gate the browser PWA relies on ──────
const TOKEN = "a".repeat(32); // long enough to pass isValidToken

test("authorizeRequest accepts a Bearer header (native/desktop client)", () => {
  assert.equal(authorizeRequest(TOKEN, `Bearer ${TOKEN}`, null), true);
});

test("authorizeRequest accepts a ?token= query param (browser EventSource)", () => {
  // EventSource cannot set headers, so the token rides the query string.
  assert.equal(authorizeRequest(TOKEN, undefined, TOKEN), true);
});

test("authorizeRequest rejects a wrong token on either channel", () => {
  assert.equal(authorizeRequest(TOKEN, "Bearer nope", null), false);
  assert.equal(authorizeRequest(TOKEN, undefined, "nope"), false);
  assert.equal(authorizeRequest(TOKEN, undefined, null), false);
});

test("authorizeRequest rejects when the relay has no valid token", () => {
  // A too-short/empty server token must never authorize, even if echoed back.
  assert.equal(authorizeRequest("short", "Bearer short", "short"), false);
});
