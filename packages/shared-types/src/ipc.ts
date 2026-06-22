import type {
  AppSnapshot,
  AutoCompactSettings,
  CavemanState,
  CommandInfo,
  Connection,
  ConnectStartResult,
  DevTapProjectStatus,
  Automation,
  AutomationRun,
  ExtensionWidgetPayload,
  GitChangedFile,
  GitCommitPushResult,
  GitInfo,
  GitMergeResult,
  GitPrResult,
  GitPushLocalResult,
  GraphifyStatus,
  ToolkitCatalogEntry,
  ToolkitDetail,
  SubagentAgentInfo,
  SubagentAgentPatch,
  ExtensionStatusPayload,
  ExtensionUiRequest,
  TerminalCustomFrame,
  ImagePayload,
  ModelInfo,
  NoticePayload,
  PiHealth,
  PiSettings,
  VisionProxyConfig,
  VisionProxyInstallState,
  Project,
  QueueState,
  RecordingState,
  RecordingStopResult,
  ResourceInspection,
  SlotToggleSpec,
  CommandKind,
  SessionMeta,
  SideConversation,
  SideDeltaPayload,
  SideDonePayload,
  ThinkingLevel,
  Thread,
  ThreadId,
  ThreadSearchHit,
  ToolMode,
  Worktree,
} from "./entities.ts";
import type { TranscriptDelta, TranscriptSnapshot } from "./transcript.ts";

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
  /** Persist selection so the HUD window knows the prompt target. */
  "app:setSelectedThread": invoke<[threadId: ThreadId | null], void>(),
  /** Read caveman compression state from ~/.pi/agent/caveman.json. */
  "app:getCavemanState": invoke<[], CavemanState>(),
  /** Enable/disable caveman compression for future sessions. */
  "app:setCavemanEnabled": invoke<[enabled: boolean], CavemanState>(),
  /** Set the caveman on-level the composer toggle maps to (e.g. "full", "ultra"). */
  "app:setCavemanLevel": invoke<[level: string], CavemanState>(),
  /** All auth-configured models (global, not session-scoped). */
  "app:listModels": invoke<[], ModelInfo[]>(),
  /** Read the configured "utility" model for background LLM tasks (titles/commits). */
  "app:getUtilityModel": invoke<[], ModelInfo | null>(),
  /** Persist the "utility" model choice. Pass null to clear (fall back to defaults). */
  "app:setUtilityModel": invoke<[model: ModelInfo | null], ModelInfo | null>(),
  /** Read the auto-compaction thresholds (percent + optional token cap). */
  "app:getAutoCompact": invoke<[], AutoCompactSettings>(),
  /** Persist the auto-compaction thresholds. */
  "app:setAutoCompact": invoke<[settings: AutoCompactSettings], AutoCompactSettings>((s) => {
    if (typeof s?.percent !== "number" || s.percent < 1 || s.percent > 100) {
      throw new Error("percent must be a number between 1 and 100");
    }
    if (s.tokens != null && (typeof s.tokens !== "number" || s.tokens < 0)) {
      throw new Error("tokens must be a non-negative number or null");
    }
  }),
  /** Read the pi settings subset exposed in the GUI. */
  "app:getPiSettings": invoke<[], PiSettings>(),
  /** Whether the `npm:pi-vision-proxy` package is listed among pi's packages. */
  "app:getVisionProxyInstallState": invoke<[], VisionProxyInstallState>(),
  /** Install `npm:pi-vision-proxy` via `pi install`. Async notice on completion. */
  "app:installVisionProxy": invoke<[], { ok: boolean; error?: string }>(),
  /** Read the GUI-relevant pi-vision-proxy config (~/.pi/agent/vision-proxy.json,
   *  merged over extension defaults). Null-returning fields are filled in. */
  "app:getVisionProxyConfig": invoke<[], VisionProxyConfig>(),
  /** Persist the vision model choice. `provider` derives from ModelInfo. */
  "app:setVisionProxyModel": invoke<[model: ModelInfo], VisionProxyConfig>(),
  /** Persist the proxy mode (fallback | always | off). */
  "app:setVisionProxyMode": invoke<[mode: VisionProxyConfig["mode"]], VisionProxyConfig>(),
  /** Open the working directory for a thread in Finder. */
  "app:openFolder": invoke<[threadId: ThreadId], void>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),
  /** Startup compatibility report: bundled pi SDK vs loaded extensions. */
  "app:getPiHealth": invoke<[], PiHealth>(),
  /** Write pi settings (partial merge into ~/.pi/agent/settings.json). */
  "app:setPiSettings": invoke<[patch: Partial<PiSettings>], PiSettings>(),
  /** Manually run `pi update --extensions` now (bypasses throttle). */
  "app:updateExtensions": invoke<[], { ok: boolean; updated: boolean; error?: string }>(),
  /** Uninstall a package extension via `pi remove <spec>`. */
  "extensions:remove": invoke<[spec: string], { ok: boolean; error?: string }>((spec) =>
    requireNonEmptyString(spec, "spec"),
  ),
  /** Delete a local extension's file/dir from disk (validated under an extensions dir). */
  "extensions:deleteLocal": invoke<[targetPath: string], { ok: boolean; error?: string }>((p) =>
    requireNonEmptyString(p, "targetPath"),
  ),

  /** Persist the sidebar width (pixels). */
  "ui:setSidebarWidth": invoke<[width: number], void>((w) => {
    if (typeof w !== "number" || !Number.isFinite(w)) {
      throw new Error("width must be a finite number");
    }
  }),

  // projects
  "projects:add": invoke<[path: string], Project>((path) =>
    requireNonEmptyString(path, "path"),
  ),
  "projects:remove": invoke<[projectId: string], void>((id) =>
    requireNonEmptyString(id, "projectId"),
  ),
  /** Native folder picker; returns the added project or null if cancelled. */
  "projects:pick": invoke<[], Project | null>(),
  /** Persist a new sidebar order (full ordered list of project IDs). */
  "projects:reorder": invoke<[orderedIds: string[]], void>((ids) => {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length === 0)) {
      throw new Error("orderedIds must be an array of non-empty strings");
    }
  }),
  /** Collapse/expand a project's thread list in the sidebar. */
  "projects:setCollapsed": invoke<[projectId: string, collapsed: boolean], void>(
    (id, collapsed) => {
      requireNonEmptyString(id, "projectId");
      if (typeof collapsed !== "boolean") throw new Error("collapsed must be a boolean");
    },
  ),

  // worktrees
  /** Create a registered worktree record for a project. Resolves the isolated
   *  git checkout, persists a `worktrees` row, and returns it. The renderer
   *  then creates threads inside it via `threads:create` with `worktreeId`. */
  "worktrees:create": invoke<[projectId: string], Worktree>((id) =>
    requireNonEmptyString(id, "projectId"),
  ),
  /** Rename a worktree (sidebar label only). */
  "worktrees:rename": invoke<[worktreeId: string, name: string], void>((id, name) => {
    requireNonEmptyString(id, "worktreeId");
    requireNonEmptyString(name, "name");
  }),
  /** Archive every non-archived thread in the worktree, remove the git worktree
   *  dir, and mark the worktree archived. The node disappears from the sidebar;
   *  its (now archived) threads still surface under the project's Done bucket. */
  "worktrees:archive": invoke<[worktreeId: string], void>((id) =>
    requireNonEmptyString(id, "worktreeId"),
  ),

  // threads
  "threads:create": invoke<
    [projectId: string, opts?: { worktreeId?: string; worktree?: boolean }],
    Thread
  >((id) => requireNonEmptyString(id, "projectId")),
  "threads:createChat": invoke<[], Thread>(),
  "threads:prompt": invoke<
    [threadId: ThreadId, text: string, images?: ImagePayload[], toolMode?: ToolMode],
    void
  >((id, text) => {
    requireNonEmptyString(id, "threadId");
    requireNonEmptyString(text, "text");
  }),
  "threads:steer": invoke<[threadId: ThreadId, text: string], void>(),
  /** Promote a queued follow-up message to a steer by index. Returns promoted text or null. */
  "threads:promoteFollowUpToSteer": invoke<[threadId: ThreadId, index: number], string | null>(),
  /** Pop the last queued follow-up message and return its text (for recall to composer). */
  "threads:popLastFollowUp": invoke<[threadId: ThreadId], string | null>(),
  /** Delete a queued follow-up message by index. */
  "threads:deleteFollowUp": invoke<[threadId: ThreadId, index: number], void>(),
  /** Delete a queued steer message by index. */
  "threads:deleteSteer": invoke<[threadId: ThreadId, index: number], void>(),
  /** Execute an extension/slash command in the live session (e.g. "/caveman"). */
  "threads:runCommand": invoke<[threadId: ThreadId, command: string], void>((id, cmd) => {
    requireNonEmptyString(id, "threadId");
    requireNonEmptyString(cmd, "command");
  }),
  "threads:abort": invoke<[threadId: ThreadId], void>(),
  "threads:getTranscript": invoke<[threadId: ThreadId], TranscriptSnapshot>(),
  /** Full-text search across thread bodies + titles. */
  "threads:search": invoke<[query: string], ThreadSearchHit[]>((q) =>
    requireNonEmptyString(q, "query"),
  ),
  "threads:listCommands": invoke<[threadId: ThreadId], CommandInfo[]>(),
  "threads:listModels": invoke<[threadId: ThreadId], ModelInfo[]>(),
  "threads:listAllModels": invoke<[threadId: ThreadId], ModelInfo[]>(),
  /** Toggle a model in the global `enabledModels` scope; returns the new scoped list. */
  "threads:setModelScoped": invoke<
    [threadId: ThreadId, provider: string, modelId: string, scoped: boolean],
    ModelInfo[]
  >(),
  "threads:setModel": invoke<[threadId: ThreadId, provider: string, modelId: string], SessionMeta>(),
  "threads:setThinking": invoke<[threadId: ThreadId, level: ThinkingLevel], SessionMeta>(),
  "threads:getMeta": invoke<[threadId: ThreadId], SessionMeta>(),
  /** Resolve a pending extension dialog. Value type depends on request kind. */
  "threads:respondExtensionUi": invoke<
    [requestId: string, value: string | boolean | undefined],
    void
  >((id) => requireNonEmptyString(id, "requestId")),
  /** Forward a keystroke to a live extension `custom()` TUI component. Does
   *  not settle the command — the component decides when to call done(). */
  "threads:terminalCustomInput": invoke<
    [threadId: ThreadId, requestId: string, data: string],
    void
  >(),
  /** Cancel a live extension `custom()` TUI (esc / overlay close). */
  "threads:terminalCustomCancel": invoke<[threadId: ThreadId, requestId: string], void>(),

  "threads:compact": invoke<[threadId: ThreadId], void>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),

  // side conversations (`/btw` quick side chat; reads main convo, never writes)
  /** Start a fresh side conversation for a thread. modelOverride null = use the
   *  thread's current session model. Returns the created (empty) conversation. */
  "side:start": invoke<
    [threadId: ThreadId, modelOverride?: ModelInfo | null],
    SideConversation
  >((id) => requireNonEmptyString(id, "threadId")),
  /** Ask a question in a side conversation; answer streams via event:sideDelta. */
  "side:ask": invoke<[convId: string, question: string], void>((id, q) => {
    requireNonEmptyString(id, "convId");
    requireNonEmptyString(q, "question");
  }),
  /** All side conversations for a thread (newest first) — the btw history. */
  "side:list": invoke<[threadId: ThreadId], SideConversation[]>(),
  /** Load one side conversation (to reopen + continue it). */
  "side:get": invoke<[convId: string], SideConversation | null>(),
  /** Delete a side conversation from the history. */
  "side:delete": invoke<[convId: string], void>((id) =>
    requireNonEmptyString(id, "convId"),
  ),

  /** User turns available as rewind targets (session-tree entry ids, branch order). */
  "threads:listTurns": invoke<[threadId: ThreadId], { entryId: string; text: string }[]>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),
  /** Rewind the conversation to before a turn. Returns the rewound prompt text
   *  (for refilling the composer). When `revertFiles` is set and a git snapshot
   *  exists, the working tree is reverted to its pre-turn state (destructive). */
  "threads:rewind": invoke<
    [threadId: ThreadId, entryId: string, revertFiles?: boolean],
    { editorText?: string }
  >((id, entryId) => {
    requireNonEmptyString(id, "threadId");
    requireNonEmptyString(entryId, "entryId");
  }),

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

  // graphify knowledge graph (per project)
  "graphify:status": invoke<[projectId: string], GraphifyStatus>((id) =>
    requireNonEmptyString(id, "projectId"),
  ),
  "graphify:build": invoke<[projectId: string], { ok: boolean; error?: string }>(),
  "graphify:update": invoke<[projectId: string], { ok: boolean; error?: string }>(),
  "graphify:openViewer": invoke<[projectId: string], boolean>(),
  "graphify:report": invoke<[projectId: string], string | null>(),

  // subagents (pi-subagents extension roster)
  "subagents:listAgents": invoke<[projectId: string | null], SubagentAgentInfo[]>(),
  "subagents:updateAgent": invoke<
    [filePath: string, patch: SubagentAgentPatch],
    SubagentAgentInfo
  >((filePath) => requireNonEmptyString(filePath, "filePath")),

  // git (per-thread working directory)
  "git:info": invoke<[threadId: ThreadId], GitInfo>((id) => requireNonEmptyString(id, "threadId")),
  "git:changedFiles": invoke<[threadId: ThreadId], GitChangedFile[]>(),
  "git:fileDiff": invoke<[threadId: ThreadId, filePath: string], string>(),
  "git:commitPush": invoke<[threadId: ThreadId, message?: string], GitCommitPushResult>(),
  "git:createPr": invoke<[threadId: ThreadId], GitPrResult>((id) => requireNonEmptyString(id, "threadId")),
  "git:mergeToLocal": invoke<[threadId: ThreadId], GitMergeResult>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),
  "git:pushLocal": invoke<[threadId: ThreadId], GitPushLocalResult>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),

  // integrated terminal (one PTY per thread, lives in main)
  "terminal:open": invoke<[threadId: ThreadId], { buffer: string }>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),
  "terminal:input": invoke<[threadId: ThreadId, data: string], void>(),
  "terminal:resize": invoke<[threadId: ThreadId, cols: number, rows: number], void>(),
  "terminal:kill": invoke<[threadId: ThreadId], void>(),

  // HUD — persistent floating composer window
  "hud:hide": invoke<[], void>(),
  "hud:toggle": invoke<[], void>(),
  /** Point the HUD at a thread (independent of the Main Window selection). */
  "hud:setThread": invoke<[threadId: ThreadId | null], void>(),
  /** Start a new chat and point the HUD at it. Returns the new thread. */
  "hud:newChat": invoke<[], Thread>(),
  /** Grow/shrink the HUD window for the expanded chat (composer stays anchored). */
  "hud:setExpanded": invoke<[expanded: boolean], void>(),
  /** Toggle click-through so transparent gap/corners pass clicks to the app behind. */
  "hud:setClickThrough": invoke<[ignore: boolean], void>(),
  /** Release HUD keyboard focus back to the app behind (mouse left the window). */
  "hud:releaseFocus": invoke<[], void>(),
  /** Persist the opt-in "auto-reveal chat when a thread finishes" setting. */
  "hud:setAutoReveal": invoke<[on: boolean], void>(),

  // resources (skills / extensions / prompts visible for a project)
  "resources:inspect": invoke<[projectId: string | null], ResourceInspection>(),
  /** Probe a command with a helper LLM to propose quick-slot toggle behavior. */
  "resources:inspectSlotCommand": invoke<
    [projectId: string | null, kind: CommandKind, name: string],
    SlotToggleSpec | null
  >(),
  /** Read a skill/prompt markdown file surfaced by resources:inspect. */
  "resources:readMarkdown": invoke<[filePath: string], string>((p) => {
    requireNonEmptyString(p, "filePath");
    if (!p.endsWith(".md")) throw new Error("filePath must be a .md file");
  }),
  /** Save a skill's markdown to a user-chosen file via a native save dialog.
   *  Returns the destination path, or null if the user cancelled. */
  "skills:save": invoke<[skillName: string, filePath: string], string | null>((name, p) => {
    requireNonEmptyString(name, "skillName");
    requireNonEmptyString(p, "filePath");
    if (!p.endsWith(".md")) throw new Error("filePath must be a .md file");
  }),

  // files
  /** Read a local image file as base64; null if unreadable/unsupported. */
  "files:readImage": invoke<[filePath: string], { mimeType: string; data: string } | null>((p) =>
    requireNonEmptyString(p, "filePath"),
  ),
  "threads:archive": invoke<[threadId: ThreadId], void>(),
  "threads:unarchive": invoke<[threadId: ThreadId], void>(),
  "threads:delete": invoke<[threadId: ThreadId], void>(),
  "threads:setEnvironment": invoke<[threadId: ThreadId, worktree: boolean], void>(),
  "threads:bringToLocal": invoke<[threadId: ThreadId], void>((id) =>
    requireNonEmptyString(id, "threadId"),
  ),
  "threads:snooze": invoke<[threadId: ThreadId, until: string], void>(),
  "threads:unsnooze": invoke<[threadId: ThreadId], void>(),
  "threads:markToTest": invoke<[threadId: ThreadId, note?: string], void>(),
  "threads:unmarkToTest": invoke<[threadId: ThreadId], void>(),

  /** Is the DevTap runtime tap installed in this project? */
  "devtap:projectStatus": invoke<[projectId: string], DevTapProjectStatus>((id) =>
    requireNonEmptyString(id, "projectId"),
  ),

  // devtap (renderer → main; dev-only runtime tap). Main drops these unless
  // DEV_TAP=1, so this channel is inert in normal production.
  "devtap:report": invoke<
    [
      entry: {
        event: string;
        message?: string;
        payload?: unknown;
        error?: { name: string; message: string; stack?: string };
      },
    ],
    void
  >(),

  // connectors (Composio toolkits). Composio owns auth + token storage; the
  // main process holds the API key and proxies catalogue/connect/execute. The
  // renderer only ever sees toolkit metadata + connection status — never a
  // token. OAuth completion is async and reported via event:connectorsChanged.
  /** Search the Composio toolkit catalogue. Empty query → popular toolkits. */
  "connectors:catalogue": invoke<[query: string], ToolkitCatalogEntry[]>(),
  /** Full detail for one toolkit (metadata + tool list) for the detail pane. */
  "connectors:toolkit": invoke<[toolkitSlug: string], ToolkitDetail>((s) =>
    requireNonEmptyString(s, "toolkitSlug"),
  ),
  /** The local user's connected accounts (ACTIVE + pending). */
  "connectors:list": invoke<[], Connection[]>(),
  /** Begin connecting a toolkit. OAuth → opens the hosted authorize URL via
   *  shell.openExternal and returns its redirectUrl; completion arrives later
   *  via event:connectorsChanged. API-key schemes are rejected here — use
   *  connectors:connectApiKey. */
  "connectors:connect": invoke<[toolkitSlug: string], ConnectStartResult>((s) =>
    requireNonEmptyString(s, "toolkitSlug"),
  ),
  /** Connect a non-OAuth toolkit with user-supplied credential fields (e.g.
   *  Metabase base URL + API key). `fields` keys are the Composio field names
   *  from ToolkitDetail.authFields. Completes synchronously. */
  "connectors:connectFields": invoke<
    [toolkitSlug: string, fields: Record<string, string>],
    Connection
  >((slug) => requireNonEmptyString(slug, "toolkitSlug")),
  /** Disconnect: delete the connected account at Composio. */
  "connectors:disconnect": invoke<[connectionId: string], void>((id) =>
    requireNonEmptyString(id, "connectionId"),
  ),

  // recording (desktop task capture → skill synthesis)
  /** Begin capturing desktop input. `threadId` (optional) ties the recording
   *  to a chat so `recording:stop` can auto-send the synthesis prompt there. */
  "recording:start": invoke<[threadId?: string], RecordingState>(),
  /** Stop + persist events. With a `skill` body → saves the skill file.
   *  Without → returns the digest for the agent/UI to synthesize. */
  "recording:stop": invoke<[skillBody?: string], RecordingStopResult>(),
  /** Stop + discard ALL captured data. Nothing persists. */
  "recording:cancel": invoke<[], RecordingState>(),
  /** Current recorder state (for initial renderer load). */
  "recording:status": invoke<[], RecordingState>(),
  /** Reveal the synthesized skill file in Finder. */
  "recording:revealSkill": invoke<[skillPath: string], void>((p) =>
    requireNonEmptyString(p, "skillPath"),
  ),

  // events (main → renderer)
  "event:snapshot": event<AppSnapshot>(),
  "event:threadChanged": event<Thread>(),
  "event:transcript": event<TranscriptDelta>(),
  "event:queue": event<QueueState>(),
  "event:sessionMeta": event<SessionMeta>(),
  "event:extensionUi": event<ExtensionUiRequest>(),
  "event:notice": event<NoticePayload>(),
  "event:extensionStatus": event<ExtensionStatusPayload>(),
  "event:sideDelta": event<SideDeltaPayload>(),
  "event:sideDone": event<SideDonePayload>(),
  /** Notification click — main window should select this thread. */
  "event:focusThread": event<ThreadId>(),
  /** A run finished while the HUD is up — renderer turns this into an ambient cue. */
  "event:hudFinish": event<{ threadId: ThreadId }>(),
  "event:extensionWidget": event<ExtensionWidgetPayload>(),
  /** A connector's status changed (connected/revoked/refreshed). Renderer
   *  re-lists via `connectors:list`. */
  "event:connectorsChanged": event<void>(),
  "event:terminalData": event<{ threadId: ThreadId; data: string }>(),
  "event:terminalExit": event<{ threadId: ThreadId; exitCode: number }>(),
  /** A render frame from an extension's `custom()` TUI, for the xterm overlay. */
  "event:terminalCustom": event<TerminalCustomFrame>(),
  /** Recorder state changed (start/stop/cancel/error/event-count tick). */
  "event:recordingState": event<RecordingState>(),
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
