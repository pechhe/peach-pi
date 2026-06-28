import type { ProjectId, ServedSessionRoutes, ThreadId } from "@peach-pi/shared-types";

/**
 * Shared route table + path builders for the served-session relay (ADR-0012).
 *
 * The server (`RelayActions` in `relay-host.ts`) implements these verbs; the
 * client (`relay-client.ts`) derives its `postJson` paths from the same
 * constants instead of duplicating route literals across both files. The
 * `control` verb (which toggles the relay's steering lease) is a first-class
 * entry here — it previously existed only on the client + lease store with no
 * `RelayActions` declaration (a documented consolidation, not new behavior).
 *
 * `:threadId` placeholders are filled with `encodeURIComponent(threadId)`.
 */

/** The canonical route table (mirrors `ServedSessionRoutes` in shared-types). */
export const SERVED_SESSION_ROUTES: ServedSessionRoutes = {
  message: { path: "/sessions/:threadId/message", body: { text: "" } },
  steer: { path: "/sessions/:threadId/steer", body: { text: "" } },
  abort: { path: "/sessions/:threadId/abort", body: {} },
  archive: { path: "/sessions/:threadId/archive", body: {} },
  snooze: { path: "/sessions/:threadId/snooze", body: { until: "" } },
  unsnooze: { path: "/sessions/:threadId/unsnooze", body: {} },
  markToTest: { path: "/sessions/:threadId/mark-to-test", body: { note: "" } },
  unmarkToTest: { path: "/sessions/:threadId/unmark-to-test", body: {} },
  control: { path: "/sessions/:threadId/control", body: {} },
  deleteQueued: { path: "/sessions/:threadId/queue/delete", body: { kind: "steer", index: 0 } },
  gitCommitPush: { path: "/sessions/:threadId/git/commit-push", body: {} },
  gitPr: { path: "/sessions/:threadId/git/pr", body: {} },
  gitMerge: { path: "/sessions/:threadId/git/merge", body: {} },
  createThread: {
    path: "/threads",
    body: { projectId: "" as ProjectId, worktreeId: "", worktree: false },
  },
  createChat: { path: "/chats", body: {} },
};

/** Build a per-session path with an encoded threadId. */
function sessionPath(template: string, threadId: ThreadId): string {
  return template.replace(":threadId", encodeURIComponent(threadId));
}

export const messagePath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.message.path, threadId);
export const steerPath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.steer.path, threadId);
export const abortPath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.abort.path, threadId);
export const archivePath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.archive.path, threadId);
export const snoozePath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.snooze.path, threadId);
export const unsnoozePath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.unsnooze.path, threadId);
export const markToTestPath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.markToTest.path, threadId);
export const unmarkToTestPath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.unmarkToTest.path, threadId);
export const controlPath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.control.path, threadId);
export const deleteQueuedPath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.deleteQueued.path, threadId);
export const gitCommitPushPath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.gitCommitPush.path, threadId);
export const gitPrPath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.gitPr.path, threadId);
export const gitMergePath = (threadId: ThreadId) =>
  sessionPath(SERVED_SESSION_ROUTES.gitMerge.path, threadId);
export const createThreadPath = () => SERVED_SESSION_ROUTES.createThread.path;
export const createChatPath = () => SERVED_SESSION_ROUTES.createChat.path;
