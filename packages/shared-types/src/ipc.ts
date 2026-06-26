import type {
  AppSnapshot,
  AutoCompactSettings,
  BwsProject,
  BwsSecret,
  BwsSecretInput,
  BwsSecretPatch,
  BwsStatus,
  AgentBrowserState,
  CavemanState,
  CommandInfo,
  CuaDriverStatus,
  Connection,
  ConnectStartResult,
  DevTapProjectStatus,
  Automation,
  AutomationModel,
  AutomationRun,
  ExtensionWidgetPayload,
  GitChangedFile,
  GitCommitPushResult,
  GitInfo,
  GitMergeResult,
  GitPrResult,
  GitPushLocalResult,
  CustomConnection,
  CustomConnectionInput,
  ProposedConnectionConfig,
  ConnSetupDeltaPayload,
  ConnSetupProbePayload,
  ConnSetupConfigPayload,
  ConnSetupDonePayload,
  McpServer,
  ToolkitCatalogEntry,
  ToolkitDetail,
  SubagentAgentInfo,
  SubagentAgentPatch,
  ExtensionStatusPayload,
  ExtensionUiRequest,
  TerminalCustomFrame,
  ImagePayload,
  ModelInfo,
  ScopedModel,
  NoticePayload,
  ExtUpdatesAvailable,
  PiHealth,
  PiSettings,
  VisionProxyConfig,
  VisionProxyInstallState,
  Project,
  ProjectId,
  StartAgentResult,
  StartAllReadyResult,
  WorkQueueResult,
  CloseIssueResult,
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
  RemoteHostConfig,
  RemoteConnectInfo,
  RemoteHostConnection,
  RemoteTailnetPeer,
  RemoteSessionInfo,
  RemotePullResult,
  ProviderUsageSummary,
  RemoteFirstMode,
  ThreadHandoffStatus,
} from "./entities.ts";
import type { RemoteTapFrame, TranscriptDelta, TranscriptSnapshot } from "./transcript.ts";

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
  /** All auth-configured models paired with their scope membership (settings.json enabledModels). */
  "app:listScopedModels": invoke<[], ScopedModel[]>(),
  /** Toggle a model's membership in the global enabledModels scope; returns the updated list. */
  "app:setModelScoped": invoke<[provider: string, modelId: string, scoped: boolean], ScopedModel[]>(),
  /** Read the configured "utility" model for background LLM tasks (titles/commits). */
  "app:getUtilityModel": invoke<[], ModelInfo | null>(),
  /** Persist the "utility" model choice. Pass null to clear (fall back to defaults). */
  "app:setUtilityModel": invoke<[model: ModelInfo | null], ModelInfo | null>(),
  /** This machine's stable remote-client identity, for the control indicator
   *  (ADR-0011). */
  "app:getRemoteClientId": invoke<[], { id: string; name: string }>(),
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
  "app:updateExtensions": invoke<[], { ok: boolean; updated: boolean; queued: boolean; error?: string }>(),

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

  /** Persist whether the sidebar is collapsed (hidden, reveal-on-hover). */
  "ui:setSidebarCollapsed": invoke<[collapsed: boolean], void>((c) => {
    if (typeof c !== "boolean") throw new Error("collapsed must be a boolean");
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
  /** Hot-reload one session's extensions/skills/prompts/themes from disk. */
  "threads:reload": invoke<[threadId: ThreadId], { ok: boolean; error?: string }>(),
  /** Reload every idle session; queue running ones for reload on idle. */
  "threads:reloadAll": invoke<[], { reloaded: string[]; queued: string[] }>(),
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
  /** Retry a failed compaction. No-op if compaction is already running or
   *  no prior failed compaction exists. */
  "threads:retryCompact": invoke<[threadId: ThreadId], void>((id) =>
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
    [
      fields: {
        name: string;
        cron: string;
        projectId: string | null;
        prompt: string;
        environment: "local" | "worktree";
        model: AutomationModel | null;
      },
    ],
    Automation
  >((f) => {
    requireNonEmptyString(f?.name, "name");
    requireNonEmptyString(f?.cron, "cron");
    requireNonEmptyString(f?.prompt, "prompt");
  }),
  "automations:update": invoke<
    [id: string, fields: {
      name: string;
      cron: string;
      projectId: string | null;
      prompt: string;
      environment: "local" | "worktree";
      model: AutomationModel | null;
    }],
    Automation
  >((_id, f) => {
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
  "subagents:updateAgent": invoke<
    [filePath: string, patch: SubagentAgentPatch],
    SubagentAgentInfo
  >((filePath) => requireNonEmptyString(filePath, "filePath")),

  // git (per-thread working directory)
  // work queue — per-project tracker issues (read-only) for the Work Queue view
  "workQueue:list": invoke<[projectId: ProjectId], WorkQueueResult>((id) =>
    requireNonEmptyString(id, "projectId"),
  ),
  /** Launch an agent on a ready issue: new thread on an isolated worktree+branch. */
  "workQueue:startAgent": invoke<[projectId: ProjectId, issueNumber: number], StartAgentResult>(
    (id) => requireNonEmptyString(id, "projectId"),
  ),
  /** Launch an agent on every ready (unblocked, not-in-progress) child of a PRD. */
  "workQueue:startAllReady": invoke<[projectId: ProjectId, prdNumber: number], StartAllReadyResult>(
    (id) => requireNonEmptyString(id, "projectId"),
  ),
  /** Close a tracker issue as completed or not planned (escape hatch for
   *  shipped-but-not-auto-closed issues). */
  "workQueue:closeIssue": invoke<
    [projectId: ProjectId, issueNumber: number, reason: "completed" | "not_planned"],
    CloseIssueResult
  >((id) => requireNonEmptyString(id, "projectId")),
  /** Reopen a previously closed tracker issue. */
  "workQueue:reopenIssue": invoke<[projectId: ProjectId, issueNumber: number], CloseIssueResult>(
    (id) => requireNonEmptyString(id, "projectId"),
  ),

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
  /** Delete a local skill's file/dir from disk (validated under a `skills`
   *  directory). Returns { ok, error? }. */
  "skills:delete": invoke<[targetPath: string], { ok: boolean; error?: string }>((p) =>
    requireNonEmptyString(p, "targetPath"),
  ),
  /** Toggle a skill's `disable-model-invocation` frontmatter field. When
   *  true the skill is hidden from the system prompt (trigger-only via
   *  `/skill:name`); when false it is injected into the prompt. Only valid
   *  for local skills under a `skills` directory. */
  "skills:setInvocation": invoke<
    [filePath: string, disabled: boolean],
    { ok: boolean; error?: string }
  >((p) => requireNonEmptyString(p, "filePath")),
  /** Toggle whether an extension is in pi's active load list (false) or moved
   *  to the peach-managed stash so pi no longer loads it (true). `key` is the
   *  extension's install spec (`npm:…`/`git:…`) for packages, or its resolved
   *  path for local extensions. Applies to new sessions. */
  "extensions:setEnabled": invoke<
    [key: string, enabled: boolean],
    { ok: boolean; error?: string }
  >((k) => requireNonEmptyString(k, "key")),
  /** Toggle whether an MCP server is in `mcpServers` (false) or moved to the
   *  peach-managed `peachDisabledMcpServers` stash (true). Applies to new
   *  sessions. */
  "mcp:setEnabled": invoke<
    [name: string, enabled: boolean],
    { ok: boolean; error?: string }
  >((n) => requireNonEmptyString(n, "name")),

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

  // custom connections (local API key + URL, independent of Composio). Stored
  // on-device; the agent uses them via the `custom_request` tool. Raw keys
  // never reach the renderer.
  /** List saved custom connections (keys masked). */
  "customConnections:list": invoke<[], CustomConnection[]>(),
  /** Save a new custom connection. */
  "customConnections:create": invoke<[input: CustomConnectionInput], CustomConnection>(
    (input) => {
      requireNonEmptyString(input?.name, "name");
      requireNonEmptyString(input?.baseUrl, "baseUrl");
      requireNonEmptyString(input?.apiKey, "apiKey");
    },
  ),
  /** Delete a custom connection by id. */
  "customConnections:delete": invoke<[id: string], void>((id) =>
    requireNonEmptyString(id, "id"),
  ),

  // connection setup assistant (interactive, utility-model driven). The raw
  // key is held in the main process for the session and injected into probe
  // requests; it never reaches the model. Activity streams via event:connSetup*.
  /** Start a setup session: fetch the docs URL (or accept pasted docs text),
   *  hold the key, and kick off the first assistant turn. */
  "connectionSetup:start": invoke<
    [input: { docs: string; apiKey: string; name?: string }],
    { sessionId: string }
  >((input) => {
    requireNonEmptyString(input?.docs, "docs");
    requireNonEmptyString(input?.apiKey, "apiKey");
  }),
  /** Send a user reply into a setup session; the answer streams back. */
  "connectionSetup:send": invoke<[sessionId: string, text: string], void>((id, t) => {
    requireNonEmptyString(id, "sessionId");
    requireNonEmptyString(t, "text");
  }),
  /** Save the proposed config using the session's held key; returns the saved
   *  connection and ends the session. */
  "connectionSetup:save": invoke<
    [sessionId: string, config: ProposedConnectionConfig],
    CustomConnection
  >((id) => requireNonEmptyString(id, "sessionId")),
  /** Discard a setup session and wipe its held key from memory. */
  "connectionSetup:close": invoke<[sessionId: string], void>((id) =>
    requireNonEmptyString(id, "sessionId"),
  ),

  // MCP servers (read-only display). Configuration lives in
  // ~/.pi/agent/mcp.json and is managed by the pi-mcp-adapter extension
  // (`/mcp` commands). peach-pi surfaces them in the Connections view; it
  // does not start/stop them.
  /** List configured MCP servers with cached tool counts. */
  "mcp:list": invoke<[], McpServer[]>(),

  // Agent Browser (native web computer-use tool; see ADR-0008). The
  // pi-agent-browser-native package exposes the native `agent_browser` tool,
  // replacing brittle `agent-browser` shell commands. peach-pi ensures it is
  // installed; the upstream `agent-browser` binary must be on PATH separately.
  /** Current install state of the pi-agent-browser-native package. */
  "agentBrowser:state": invoke<[], AgentBrowserState>(),
  /** Install the pi-agent-browser-native package (idempotent). */
  "agentBrowser:install": invoke<[], { ok: boolean; error?: string }>(),

  // Cua Driver (native background computer use; see ADR-0007). peach-pi
  // bundles CuaDriver.app, installs it + starts the daemon; the agent drives
  // it via the `cua-driver` CLI. These are status/permission affordances only.
  /** Current driver install + daemon + permission status. */
  "cuaDriver:status": invoke<[], CuaDriverStatus>(),
  /** Trigger the macOS Accessibility + Screen Recording prompts (interactive). */
  "cuaDriver:grantPermissions": invoke<[], void>(),

  // bws (Bitwarden Secrets Manager CLI). The main process runs `bws` with the
  // access token injected via env (never an arg, never returned to the
  // renderer). Secret values do cross IPC because the view displays/edits them.
  /** Installed/auth/project state for the BWS view. */
  "bws:status": invoke<[], BwsStatus>(),
  /** Save (or clear, when empty) the on-device access token, then re-probe. */
  "bws:setAccessToken": invoke<[token: string], BwsStatus>((t) => {
    if (typeof t !== "string") throw new Error("token must be a string");
  }),
  /** Forget the saved access token. */
  "bws:clearAuth": invoke<[], BwsStatus>(),
  /** Persist the active project id (null clears it). */
  "bws:setProject": invoke<[projectId: string | null], BwsStatus>(),
  /** Download + install the `bws` binary (macOS, from GitHub releases). */
  "bws:install": invoke<[], { ok: boolean; error?: string }>(),
  /** Projects the token can access. */
  "bws:listProjects": invoke<[], BwsProject[]>(),
  /** Secrets, optionally scoped to a project id. */
  "bws:listSecrets": invoke<[projectId?: string | null], BwsSecret[]>(),
  /** Create a secret. Returns the created secret. */
  "bws:createSecret": invoke<[input: BwsSecretInput], BwsSecret>((input) => {
    requireNonEmptyString(input?.key, "key");
    requireNonEmptyString(input?.projectId, "projectId");
  }),
  /** Edit a secret's fields. Returns the updated secret. */
  "bws:editSecret": invoke<[secretId: string, patch: BwsSecretPatch], BwsSecret>((id) =>
    requireNonEmptyString(id, "secretId"),
  ),
  /** Delete a secret by id. */
  "bws:deleteSecret": invoke<[secretId: string], void>((id) =>
    requireNonEmptyString(id, "secretId"),
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

  // remote session hosting (ADR-0009). Two roles, same app:
  //   - master serves its running session over the tailnet + checkpoints
  //     working trees to disposable `wip/<threadId>` branches.
  //   - laptop attaches read-only and pulls checkpoints into a worktree.
  // Transport is plain HTTP + SSE (no `ws` dep); bound to the Tailscale
  // interface only; shared bearer token; serving off by default.
  /** Read the host serving config (token, port, enabled, resolved bind IP). */
  "remote:hostStatus": invoke<[], RemoteHostConfig>(),
  /** Toggle serving on/off. When turning on, generates a token if none exists
   *  and resolves+binds the Tailscale interface. */
  "remote:setHostEnabled": invoke<[enabled: boolean], RemoteHostConfig>(),
  /** Regenerate the shared bearer token (invalidates attached clients). */
  "remote:regenerateToken": invoke<[], RemoteHostConfig>(),
  /** Toggle whether a project is served. Returns the updated host config. */
  "remote:setProjectServed": invoke<[projectId: ProjectId, served: boolean], RemoteHostConfig>(
    (id) => requireNonEmptyString(id, "projectId"),
  ),
  /** Toggle the "serve all projects" shortcut (includes future projects).
   *  Returns the updated host config. */
  "remote:setServeAll": invoke<[serveAll: boolean], RemoteHostConfig>(),

  /** Phone-pairing info: MagicDNS name, Serve status, and a QR/deep link that
   *  opens the watch PWA pre-filled with this master's HTTPS endpoint + token. */
  "remote:connectInfo": invoke<[], RemoteConnectInfo>(),
  /** Front the relay with Tailscale Serve (HTTPS on the MagicDNS name) so the
   *  HTTPS-served watch PWA can reach it. Returns refreshed connect info. */
  "remote:enableServe": invoke<[], RemoteConnectInfo>(),

  /** List online machines on this device's tailnet (from `tailscale status`),
   *  so the watcher can pick a host to attach to without typing an address. */
  "remote:listTailnetPeers": invoke<[], RemoteTailnetPeer[]>(),
  /** List saved master connections (the laptop side). */
  "remote:listHosts": invoke<[], RemoteHostConnection[]>(),
  /** Add a master connection. */
  "remote:addHost": invoke<[
    input: { name: string; host: string; port: number; token: string },
  ], RemoteHostConnection>((input) => {
    requireNonEmptyString(input?.name, "name");
    requireNonEmptyString(input?.host, "host");
  }),
  /** Delete a saved master connection. */
  "remote:removeHost": invoke<[hostId: string], void>((id) =>
    requireNonEmptyString(id, "hostId"),
  ),
  /** Fetch the served-session list from a master. */
  "remote:listSessions": invoke<[hostId: string], RemoteSessionInfo[]>((id) =>
    requireNonEmptyString(id, "hostId"),
  ),
  /** Attach to a served session (opens an SSE tap; frames via event:remoteTap). */
  "remote:attach": invoke<[hostId: string, threadId: ThreadId], void>((id, tid) => {
    requireNonEmptyString(id, "hostId");
    requireNonEmptyString(tid, "threadId");
  }),
  /** Detach from a session tap. */
  "remote:detach": invoke<[], void>(),
  /** Write path (ADR-0010): forward a composer action to a master's session so
   *  a remote thread can be steered/messaged/aborted from this sidebar. */
  "remote:message": invoke<[hostId: string, threadId: ThreadId, text: string], void>((id, tid) => {
    requireNonEmptyString(id, "hostId");
    requireNonEmptyString(tid, "threadId");
  }),
  "remote:steer": invoke<[hostId: string, threadId: ThreadId, text: string], void>((id, tid) => {
    requireNonEmptyString(id, "hostId");
    requireNonEmptyString(tid, "threadId");
  }),
  "remote:abort": invoke<[hostId: string, threadId: ThreadId], void>((id, tid) => {
    requireNonEmptyString(id, "hostId");
    requireNonEmptyString(tid, "threadId");
  }),
  /** Take/release the steering lease on a remote thread (ADR-0011). */
  "remote:takeControl": invoke<[hostId: string, threadId: ThreadId], void>((id, tid) => {
    requireNonEmptyString(id, "hostId");
    requireNonEmptyString(tid, "threadId");
  }),
  "remote:releaseControl": invoke<[hostId: string, threadId: ThreadId], void>((id, tid) => {
    requireNonEmptyString(id, "hostId");
    requireNonEmptyString(tid, "threadId");
  }),
  /** The controller finishing a remote thread archives it everywhere (ADR-0011). */
  "remote:archive": invoke<[hostId: string, threadId: ThreadId], void>((id, tid) => {
    requireNonEmptyString(id, "hostId");
    requireNonEmptyString(tid, "threadId");
  }),
  /** Fetch a checkpoint branch from a master's origin into a local worktree.
   *  Matches the session's origin URL to a local project, fetches
   *  `wip/<threadId>`, and checks it out into an isolated worktree. */
  "remote:pullToTest": invoke<[hostId: string, threadId: ThreadId], RemotePullResult>(
    (id, tid) => {
      requireNonEmptyString(id, "hostId");
      requireNonEmptyString(tid, "threadId");
    },
  ),

  // ── Movable execution (remote-handoff package, docs/remote-handoff.md) ─
  // Remote-first mode: when on, new threads start on the target remote machine
  // and messaging a thread hands it off there. Distinct from ADR-0009's host/
  // attach session hosting. The "Remote" sidebar item pulses red while on.
  /** Read the remote-first mode (flag + whether a target machine exists). */
  "handoff:getMode": invoke<[], RemoteFirstMode>(),
  /** Turn remote-first mode on/off. Inert when no remote machine is registered. */
  "handoff:setMode": invoke<[enabled: boolean], RemoteFirstMode>(),
  /** Per-thread handoff status (does this conversation thread have a remote
   *  owner? is the lease held here?). */
  "handoff:statusForThread": invoke<[threadId: ThreadId], ThreadHandoffStatus>(
    (tid) => requireNonEmptyString(tid, "threadId"),
  ),
  /** Handoff a conversation thread to the remote machine now (the message →
   *  handoff path). Returns the handoff status; the prompt then runs locally
   *  as the controller. Truly relaying the prompt to a remote pi process is a
   *  future improvement (see docs/remote-handoff.md). */
  "handoff:message": invoke<[threadId: ThreadId], ThreadHandoffStatus>((tid) =>
    requireNonEmptyString(tid, "threadId"),
  ),
  /** Register (or update) a peer machine so remote-first has a target. */
  "handoff:registerMachine": invoke<
    [input: { name: string; sshHost: string | null; repoPath?: string | null }],
    void
  >((input) => requireNonEmptyString(input?.name, "name")),

  // usage tracking — provider spend (pay-per-token) and subscription quota
  // windows across OpenRouter, NeuralWatt, Z.ai, and Anthropic. Main process
  // fetches live status from each provider; raw API keys never reach the
  // renderer. Refreshed on demand and on a ~60s timer while the view is open.
  /** All configured providers' usage summaries (subscribed + pay-per-token). */
  "usage:list": invoke<[], ProviderUsageSummary[]>(),
  /** Force a fresh fetch now (bypasses cache); returns the new summaries. */
  "usage:refresh": invoke<[], ProviderUsageSummary[]>(),

  // events (main → renderer)
  "event:snapshot": event<AppSnapshot>(),
  "event:threadChanged": event<Thread>(),
  "event:transcript": event<TranscriptDelta>(),
  "event:queue": event<QueueState>(),
  "event:sessionMeta": event<SessionMeta>(),
  "event:extensionUi": event<ExtensionUiRequest>(),
  /** A frame from a remote session tap (see ADR-0009). */
  "event:remoteTap": event<RemoteTapFrame>(),
  /** A remote master's served-session list changed — re-list. */
  "event:remoteSessions": event<{ hostId: string }>(),
  /** Remote host serving state changed — re-read status. */
  "event:remoteHostStatus": event<void>(),
  /** Remote-first mode or a thread's handoff status changed — re-read. */
  "event:handoffChanged": event<void>(),
  /** Usage data refreshed — renderer re-reads via `usage:list`. */
  "event:usageChanged": event<void>(),
  "event:notice": event<NoticePayload>(),
  /** Package updates are available (pi CLI detected newer versions). */
  "event:extUpdatesAvailable": event<ExtUpdatesAvailable>(),
  "event:extensionStatus": event<ExtensionStatusPayload>(),
  "event:sideDelta": event<SideDeltaPayload>(),
  "event:sideDone": event<SideDonePayload>(),
  /** Connection-setup assistant streaming + activity. */
  "event:connSetupDelta": event<ConnSetupDeltaPayload>(),
  "event:connSetupProbe": event<ConnSetupProbePayload>(),
  "event:connSetupConfig": event<ConnSetupConfigPayload>(),
  "event:connSetupDone": event<ConnSetupDonePayload>(),
  /** Notification click — main window should select this thread. */
  "event:focusThread": event<ThreadId>(),
  /** A run finished while the HUD is up — renderer turns this into an ambient cue. */
  "event:hudFinish": event<{ threadId: ThreadId }>(),
  "event:extensionWidget": event<ExtensionWidgetPayload>(),
  /** The global `enabledModels` scope changed (settings.json). Live pi sessions
   *  reload settings + republish meta; the renderer re-lists scoped models. */
  "event:scopeChanged": event<void>(),
  /** A connector's status changed (connected/revoked/refreshed). Renderer
   *  re-lists via `connectors:list`. */
  "event:connectorsChanged": event<void>(),
  "event:terminalData": event<{ threadId: ThreadId; data: string }>(),
  "event:terminalExit": event<{ threadId: ThreadId; exitCode: number }>(),
  /** A render frame from an extension's `custom()` TUI, for the xterm overlay. */
  "event:terminalCustom": event<TerminalCustomFrame>(),
  /** Recorder state changed (start/stop/cancel/error/event-count tick). */
  "event:recordingState": event<RecordingState>(),
  /** bws auth/project/secret state changed — renderer re-reads status/secrets. */
  "event:bwsChanged": event<void>(),
  /** Skills/extensions/prompts changed on disk (delete/uninstall). Renderer
   *  re-runs `resources:inspect`. */
  "event:resourcesChanged": event<void>(),
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
/** Invoke channels that take no arguments (for load/set store mirrors). */
export type NoArgInvokeChannel = {
  [K in InvokeChannel]: InvokeArgs<K> extends [] ? K : never;
}[InvokeChannel];
export type EventPayload<K extends EventChannel> =
  IpcContracts[K] extends EventContract<infer P> ? P : never;

/** Shape of the API exposed on `window.peachPi` by preload. */
export type PeachPiApi = {
  invoke<K extends InvokeChannel>(channel: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>>;
  on<K extends EventChannel>(channel: K, listener: (payload: EventPayload<K>) => void): () => void;
  /** Resolve an OS path for a dropped/picked File (Electron webUtils). */
  getPathForFile(file: File): string;
};
