import { test } from "node:test";
import assert from "node:assert/strict";
import type { Thread, ThreadStatus } from "@peach-pi/shared-types";
import { buildOutgoing, type OutgoingDraft } from "../../src/lib/composer/submit.ts";

/**
 * Table test for the composer's routing matrix — the highest-risk renderer
 * path, which had zero coverage before this slice. Mirrors the four routing
 * branches in Composer's `submit()` plus the plan-mode `toolMode` rule.
 *
 * buildOutgoing is pure: no IPC, no store reads, no side effects. We feed
 * minimal drafts + threads and assert the exact `{ channel, args }` shape.
 */

function draft(overrides: Partial<OutgoingDraft> = {}): OutgoingDraft {
  return {
    text: overrides.text ?? "hello",
    attachments: overrides.attachments ?? [],
    mode: overrides.mode ?? "build",
    command: overrides.command ?? null,
    connections: overrides.connections ?? [],
    secrets: overrides.secrets ?? [],
    planPromptSent: overrides.planPromptSent ?? false,
  };
}

function localThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    projectId: "p1",
    title: "T",
    status: "idle",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Thread;
}

function remoteThread(overrides: Partial<Thread> = {}): Thread {
  return localThread({
    remoteHostId: "host-1",
    remoteThreadId: "remote-t1" as never,
    status: "running",
    ...overrides,
  });
}

test("local idle thread → threads:prompt with toolMode all", () => {
  const out = buildOutgoing(draft(), localThread({ status: "idle" }), false);
  assert.equal(out.channel, "threads:prompt");
  assert.deepEqual(out.args, ["t1", "hello", [], "all"]);
});

test("local running thread, asSteer=false → threads:prompt (queue, not steer)", () => {
  const out = buildOutgoing(draft(), localThread({ status: "running" }), false);
  assert.equal(out.channel, "threads:prompt");
  assert.deepEqual(out.args, ["t1", "hello", [], "all"]);
});

test("local running thread, asSteer=true → threads:steer (no images, no toolMode)", () => {
  const out = buildOutgoing(draft(), localThread({ status: "running" }), true);
  assert.equal(out.channel, "threads:steer");
  assert.deepEqual(out.args, ["t1", "hello"]);
});

test("asSteer while NOT running never steers — falls through to prompt", () => {
  const out = buildOutgoing(draft(), localThread({ status: "idle" }), true);
  assert.equal(out.channel, "threads:prompt");
  assert.deepEqual(out.args, ["t1", "hello", [], "all"]);
});

test("remote running thread, asSteer=false → remote:message", () => {
  const out = buildOutgoing(draft(), remoteThread({ status: "running" }), false);
  assert.equal(out.channel, "remote:message");
  assert.deepEqual(out.args, ["host-1", "remote-t1", "hello"]);
});

test("remote running thread, asSteer=true → remote:steer", () => {
  const out = buildOutgoing(draft(), remoteThread({ status: "running" }), true);
  assert.equal(out.channel, "remote:steer");
  assert.deepEqual(out.args, ["host-1", "remote-t1", "hello"]);
});

test("remote idle thread, asSteer=true → remote:message (steer suppressed when not running)", () => {
  const out = buildOutgoing(draft(), remoteThread({ status: "idle" }), true);
  assert.equal(out.channel, "remote:message");
  assert.deepEqual(out.args, ["host-1", "remote-t1", "hello"]);
});

test("plan mode (first send) wraps body with plan instructions and forces toolMode readOnly", () => {
  const out = buildOutgoing(
    draft({ mode: "plan", planPromptSent: false }),
    localThread({ status: "idle" }),
    false,
  );
  assert.equal(out.channel, "threads:prompt");
  const [, text, images, toolMode] = out.args;
  assert.equal(toolMode, "readOnly");
  assert.deepEqual(images, []);
  // Plan-mode wrapper prepends its instructions + separator before the body.
  assert.ok(text.includes("Plan mode active") || text.includes("Plan mode"));
  assert.ok(text.endsWith("hello"));
});

test("plan mode on a slash command stays toolMode all (slash commands bypass plan)", () => {
  const out = buildOutgoing(
    draft({ mode: "plan", text: "/foo bar" }),
    localThread({ status: "idle" }),
    false,
  );
  assert.equal(out.channel, "threads:prompt");
  const [, text, , toolMode] = out.args;
  assert.equal(toolMode, "all");
  // Slash path: body is the raw text, no plan wrapping.
  assert.equal(text, "/foo bar");
});

test("plan mode after planPromptSent uses slim reminder (second send still readOnly)", () => {
  const out = buildOutgoing(
    draft({ mode: "plan", planPromptSent: true }),
    localThread({ status: "idle" }),
    false,
  );
  assert.equal(out.channel, "threads:prompt");
  const [, text, , toolMode] = out.args;
  assert.equal(toolMode, "readOnly");
  assert.ok(text.includes("hello"));
  // Slim reminder, not the full first-send instructions block.
  assert.ok(text.includes("Plan mode active"));
});

test("build mode always toolMode all, body unwrapped", () => {
  const out = buildOutgoing(
    draft({ mode: "build" }),
    localThread({ status: "idle" }),
    false,
  );
  assert.equal(out.channel, "threads:prompt");
  const [, text, , toolMode] = out.args;
  assert.equal(toolMode, "all");
  assert.equal(text, "hello");
});

test("@-pinned connections + secrets are hinted before the body", () => {
  const out = buildOutgoing(
    draft({
      text: "do the thing",
      connections: [{ kind: "custom", name: "Leadmagic", baseUrl: "https://api.x", logoUrl: null }],
      secrets: [{ id: "s1", name: "API_KEY", projectId: "p1" }],
    }),
    localThread({ status: "idle" }),
    false,
  );
  assert.equal(out.channel, "threads:prompt");
  const [, text] = out.args;
  assert.ok(text.startsWith("The user has pinned these connections"));
  assert.ok(text.includes('custom connection "Leadmagic"'));
  assert.ok(text.includes("Bitwarden Secrets Manager"));
  assert.ok(text.includes('secret "API_KEY" (id: s1)'));
  assert.ok(text.endsWith("do the thing"));
});

test("command chip prepends /name to the body", () => {
  const out = buildOutgoing(
    draft({ command: { name: "review", kind: "skill" }, text: "this file" }),
    localThread({ status: "idle" }),
    false,
  );
  assert.equal(out.channel, "threads:prompt");
  const [, text, , toolMode] = out.args;
  // Command path: slash-wrapped, plan-mode bypassed, toolMode all.
  assert.equal(toolMode, "all");
  assert.ok(text.startsWith("/review"));
  assert.ok(text.endsWith("this file"));
});

test("text + image attachments carry images into the local prompt only", () => {
  const out = buildOutgoing(
    draft({
      attachments: [{ id: "a1", kind: "image", name: "x.png", mimeType: "image/png", data: "DATA" } as never],
    }),
    localThread({ status: "idle" }),
    false,
  );
  assert.equal(out.channel, "threads:prompt");
  const [, , images] = out.args;
  assert.deepEqual(images, [{ mimeType: "image/png", data: "DATA" }]);
});

test("remote path drops images (text-only relay); steer drops images too", () => {
  const withImages = buildOutgoing(
    draft({
      attachments: [{ id: "a1", kind: "image", name: "x.png", mimeType: "image/png", data: "DATA" } as never],
    }),
    remoteThread({ status: "running" }),
    false,
  );
  assert.equal(withImages.channel, "remote:message");
  // Images are dropped on the remote path; text only.
  assert.deepEqual(withImages.args, ["host-1", "remote-t1", "hello"]);

  const steer = buildOutgoing(
    draft({ text: "edit it" }),
    remoteThread({ status: "running" }),
    true,
  );
  assert.equal(steer.channel, "remote:steer");
  assert.deepEqual(steer.args, ["host-1", "remote-t1", "edit it"]);
});
