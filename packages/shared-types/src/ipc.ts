import type {
  AppSnapshot,
  CommandInfo,
  Automation,
  AutomationRun,
  ExtensionWidgetPayload,
  GitChangedFile,
  GitCommitPushResult,
  GitInfo,
  SubagentAgentInfo,
  ExtensionStatusPayload,
  ExtensionUiRequest,
  ImagePayload,
  ModelInfo,
  NoticePayload,
  Project,
  QueueState,
  ResourceInspection,
  SessionMeta,
  ThinkingLevel,
  Thread,
  ThreadId,
  ToolMode,
} from "./entities.ts";
import type { TranscriptDelta, TranscriptItem } from "./transcript.ts";

/**
 * Typed IPC contract registry (pattern carried over from peche-pi's
 * desktop-ipc-seam — single source of truth, no drift between main,
 * preload, and renderer).
 *
 * - `invoke`: renderer → main, async result (ipcRenderer.invoke)
 * - `event`:  main → renderer subscription (webContents.send)
 */

export interface InvokeContract<Args extends unknown[] = unknown[], Result = unknown> {
  kind: "invoke";
  /** Optional runtime guard executed in main before the handler. */
  validate?: (...args: Args) => void;
  __args?: Args;
  __result?: Result;
}

export interface EventContract<Payload = unknown> {
  kind: "event";
  __payload?: Payload;
}

const invoke = <Args extends unknown[], Result>(
  validate?: (...args: Args) => void,
): InvokeContract<Args, Result> => ({ kind: "invoke", validate });

const event = <Payload>(): EventContract<Payload> => ({ kind: "event" });

function requireNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

/** All IPC channels. Channel name = object key, namespaced by domain. */
export const ipcContracts = {
  // app
  "app:getSnapshot": invoke<[], AppSnapshot>(),
  "app:ping": invoke<[], { pong: true; version: string }>(),
  /** Persist selection so the overlay window knows the prompt target. */
  "app:setSelectedThread": invoke<[threadId: ThreadId | null], void>(),

  // projects
  "projects:add": invoke<[path: string], Project>((path) =>
    requireNonEmptyString(path, "path"),
  ),
  "projects:remove": invoke<[projectId: string], void>((id) =>
    requireNonEmptyString(id, "projectId"),
  ),
  /** Native folder picker; returns the added project or null if cancelled. */
  "projects:pick": invoke<[], Project | null>(),

  // threads
  "threads:create": invoke<[projectId: string, opts?: { worktree?: boolean }], Thread>((id) =>
    requireNonEmptyString(id, "projectId"),
  ),
  "threads:createChat": invoke<[], Thread>(),
  "threads:prompt": invoke<
    [threadId: ThreadId, text: string, images?: ImagePayload[], toolMode?: ToolMode],
    void
  >((id, text) => {
    requireNonEmptyString(id, "threadId");
    requireNonEmptyString(text, "text");
  }),
  "threads:steer": invoke<[threadId: ThreadId, text: string], void>(),
  "threads:abort": invoke<[threadId: ThreadId], void>(),
  "threads:getTranscript": invoke<[threadId: ThreadId], TranscriptItem[]>(),
  "threads:listCommands": invoke<[threadId: ThreadId], CommandInfo[]>(),
  "threads:listModels": invoke<[threadId: ThreadId], ModelInfo[]>(),
  "threads:setModel": invoke<[threadId: ThreadId, provider: string, modelId: string], SessionMeta>(),
  "threads:setThinking": invoke<[threadId: ThreadId, level: ThinkingLevel], SessionMeta>(),
  "threads:getMeta": invoke<[threadId: ThreadId], SessionMeta>(),
  /** Resolve a pending extension dialog. Value type depends on request kind. */
  "threads:respondExtensionUi": invoke<
    [requestId: string, value: string | boolean | undefined],
    void
  >((id) => requireNonEmptyString(id, "requestId")),

  "threads:compact": invoke<[threadId: ThreadId], void>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),

  // automations (scheduled prompts)
  "automations:create": invoke<
    [fields: { name: string; cron: string; projectId: string | null; prompt: string }],
    Automation
  >((f) => {
    requireNonEmptyString(f?.name, "name");
    requireNonEmptyString(f?.cron, "cron");
    requireNonEmptyString(f?.prompt, "prompt");
  }),
  "automations:setEnabled": invoke<[id: string, enabled: boolean], void>(),
  "automations:delete": invoke<[id: string], void>(),
  "automations:runNow": invoke<[id: string], void>(),
  "automations:runs": invoke<[id: string], AutomationRun[]>(),
  "automations:previewNext": invoke<[cron: string], string | null>(),

  // subagents (pi-subagents extension roster)
  "subagents:listAgents": invoke<[projectId: string | null], SubagentAgentInfo[]>(),

  // git (per-thread working directory)
  "git:info": invoke<[threadId: ThreadId], GitInfo>((id) => requireNonEmptyString(id, "threadId")),
  "git:changedFiles": invoke<[threadId: ThreadId], GitChangedFile[]>(),
  "git:fileDiff": invoke<[threadId: ThreadId, filePath: string], string>(),
  "git:commitPush": invoke<[threadId: ThreadId, message?: string], GitCommitPushResult>(),

  // integrated terminal (one PTY per thread, lives in main)
  "terminal:open": invoke<[threadId: ThreadId], { buffer: string }>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),
  "terminal:input": invoke<[threadId: ThreadId, data: string], void>(),
  "terminal:resize": invoke<[threadId: ThreadId, cols: number, rows: number], void>(),
  "terminal:kill": invoke<[threadId: ThreadId], void>(),

  // overlay quick-composer window
  "overlay:hide": invoke<[], void>(),
  "overlay:toggle": invoke<[], void>(),

  // resources (skills / extensions / prompts visible for a project)
  "resources:inspect": invoke<[projectId: string | null], ResourceInspection>(),
  /** Read a skill/prompt markdown file surfaced by resources:inspect. */
  "resources:readMarkdown": invoke<[filePath: string], string>((p) => {
    requireNonEmptyString(p, "filePath");
    if (!p.endsWith(".md")) throw new Error("filePath must be a .md file");
  }),
  "threads:archive": invoke<[threadId: ThreadId], void>(),
  "threads:unarchive": invoke<[threadId: ThreadId], void>(),
  "threads:delete": invoke<[threadId: ThreadId], void>(),
  "threads:snooze": invoke<[threadId: ThreadId, until: string], void>(),
  "threads:unsnooze": invoke<[threadId: ThreadId], void>(),
  "threads:markToTest": invoke<[threadId: ThreadId, note?: string], void>(),
  "threads:unmarkToTest": invoke<[threadId: ThreadId], void>(),

  // events (main → renderer)
  "event:snapshot": event<AppSnapshot>(),
  "event:threadChanged": event<Thread>(),
  "event:transcript": event<TranscriptDelta>(),
  "event:queue": event<QueueState>(),
  "event:sessionMeta": event<SessionMeta>(),
  "event:extensionUi": event<ExtensionUiRequest>(),
  "event:notice": event<NoticePayload>(),
  "event:extensionStatus": event<ExtensionStatusPayload>(),
  /** Notification click — main window should select this thread. */
  "event:focusThread": event<ThreadId>(),
  "event:extensionWidget": event<ExtensionWidgetPayload>(),
  "event:terminalData": event<{ threadId: ThreadId; data: string }>(),
  "event:terminalExit": event<{ threadId: ThreadId; exitCode: number }>(),
} as const;

export type IpcContracts = typeof ipcContracts;
export type IpcChannel = keyof IpcContracts;

export type InvokeChannel = {
  [K in IpcChannel]: IpcContracts[K] extends { kind: "invoke" } ? K : never;
}[IpcChannel];

export type EventChannel = {
  [K in IpcChannel]: IpcContracts[K] extends { kind: "event" } ? K : never;
}[IpcChannel];

export type InvokeArgs<K extends InvokeChannel> =
  IpcContracts[K] extends InvokeContract<infer A, infer _R> ? A : never;
export type InvokeResult<K extends InvokeChannel> =
  IpcContracts[K] extends InvokeContract<infer _A, infer R> ? R : never;
export type EventPayload<K extends EventChannel> =
  IpcContracts[K] extends EventContract<infer P> ? P : never;

/** Shape of the API exposed on `window.peachPi` by preload. */
export type PeachPiApi = {
  invoke<K extends InvokeChannel>(channel: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>>;
  on<K extends EventChannel>(channel: K, listener: (payload: EventPayload<K>) => void): () => void;
  /** Resolve an OS path for a dropped/picked File (Electron webUtils). */
  getPathForFile(file: File): string;
};
