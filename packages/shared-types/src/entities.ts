/** Core app entities. App DB stores identity/organization only —
 *  pi JSONL session files remain source of truth for conversation content. */

export type ProjectId = string;
export type ThreadId = string;

export interface Project {
  id: ProjectId;
  /** Absolute path to local repo/folder. Null only for the implicit chats area. */
  path: string;
  name: string;
  kind: "repo" | "folder";
  order: number;
  createdAt: string;
  archivedAt?: string;
}

/** A first-class isolated git worktree owned by a project (ADR-0003 evolve).
 *  Many threads can run inside one worktree. `archivedAt` marks a worktree
 *  whose dir has been removed and threads archived; it no longer appears in
 *  the sidebar. */
export interface Worktree {
  id: string;
  projectId: ProjectId;
  /** Absolute path to the worktree checkout. */
  dir: string;
  /** Sidebar label, e.g. "Worktree 2". */
  name: string;
  createdAt: string;
  archivedAt?: string;
}

export type ThreadStatus = "idle" | "running" | "failed" | "completed";

/** Auto-classified thread category (utility model picks one of these). */
export type ThreadTag = "feature" | "bugfix" | "refactor" | "docs" | "chore" | "other";

/** Allowlist used to validate the utility model's tag output. */
export const THREAD_TAGS: readonly ThreadTag[] = [
  "feature",
  "bugfix",
  "refactor",
  "docs",
  "chore",
  "other",
];

export interface Thread {
  id: ThreadId;
  /** Null for custom chats (not tied to a repo). */
  projectId: ProjectId | null;
  /** Absolute path of the pi JSONL session file backing this thread. */
  piSessionFile: string | null;
  /** For custom chats: the chat-specific workspace directory. */
  chatWorkspaceDir?: string;
  /** Worktree this thread runs in; null = the project's main checkout ("master"). */
  worktreeId?: string | null;
  /** Denormalized cache of the worktree's dir (for git-service); null when
   *  the thread runs in the main checkout. */
  worktreeDir?: string;
  title: string;
  /** Auto-classified category; null until the title/tag pass runs. */
  tag?: ThreadTag;
  status: ThreadStatus;
  snoozedUntil?: string;
  /** Set when a snooze timer expired and the thread auto-returned to active.
   *  Cleared once the thread is opened. Drives the "woke from snooze" highlight. */
  wokeFromSnoozeAt?: string;
  toTestAt?: string;
  toTestNote?: string;
  archivedAt?: string;
  createdAt: string;
  lastActivityAt: string;
  /** Set on synthetic threads mirrored from a remote master (ADR-0009/0010).
   *  Local threads leave these undefined. The renderer uses them to tag the
   *  sidebar row and to route transcript/steer traffic to the remote host
   *  instead of the local pi process. `id` is a composite
   *  `remote:<hostId>:<remoteThreadId>` to avoid colliding with local ids. */
  remoteHostId?: string;
  /** The master's own thread id (the id to use on the wire). */
  remoteThreadId?: ThreadId;
  /** Display label of the master, for the sidebar's remote section header. */
  remoteHostName?: string;
  /** The master's project name for this thread, so the sidebar can nest it
   *  under the real project rather than one flat host section. */
  remoteProjectName?: string;
  /** The client id currently holding the steering lease on the master, or
   *  null when free. The renderer compares this to its own client id. */
  remoteControllerId?: string | null;
  /** Display name of the controlling client ("another laptop" when not you). */
  remoteControllerName?: string | null;
}

export type ThreadKind = "thread" | "chat";

/** Placeholder titles assigned at creation and overwritten on first prompt.
 *  Used to detect genuinely-new threads (vs an existing thread whose history
 *  is still loading asynchronously). Keep in sync with thread-service. */
export const NEW_THREAD_TITLES = ["New thread", "New chat"] as const;
export function isNewThread(title: string): boolean {
  return (NEW_THREAD_TITLES as readonly string[]).includes(title);
}

export interface UiState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  activeView: AppView;
  selectedThreadId: ThreadId | null;
  /** Project IDs the user has collapsed in the sidebar. */
  collapsedProjects: string[];
  /** The HUD's own active thread, independent of `selectedThreadId`. */
  hudThreadId: ThreadId | null;
  /** Persisted HUD window position; null = default bottom-centre. */
  hudPosition: { x: number; y: number } | null;
  /** Opt-in: expand the HUD chat when the HUD's own thread finishes. */
  hudAutoRevealOnFinish: boolean;
}

export type AppView =
  | "new-thread"
  | "thread"
  | "testing"
  | "settings"
  | "skills"
  | "extensions"
  | "automations"
  | "connections"
  | "testing"
  | "graph"
  | "bws"
  | "remote"
  | "work-queue"
  | "playroom";

/** Derived workflow status for a Work Queue issue.
 *  - `done`: closed-as-completed (a merged PR closes its issue as completed)
 *  - `ready`: open and every blocker is done
 *  - `blocked`: open with at least one unmet blocker */
export type IssueStatus = "done" | "ready" | "blocked";

/** One issue from the project's tracker, enriched with the structure parsed
 *  from its body (`## Parent`, `## Blocked by`, `## Acceptance criteria`), the
 *  `prd` label, and a derived {@link IssueStatus}. */
export interface TrackedIssue {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  labels: string[];
  /** True when the issue carries the `prd` label. */
  isPrd: boolean;
  /** Parent PRD issue number from `## Parent`, or null. */
  parent: number | null;
  /** Issue numbers this one is `## Blocked by`. */
  blockedBy: number[];
  /** `## Acceptance criteria` checklist item texts. */
  acceptanceCriteria: string[];
  status: IssueStatus;
  /** Blockers that are not yet done — drives the greyed-out "blocked by #N" UI. */
  unmetBlockers: number[];
  /** Raw issue body (used to seed an agent run). */
  body: string;
  /** True when an agent worktree already exists for this issue (no relaunch). */
  inProgress: boolean;
}

/** Result of launching an agent on an issue from the Work Queue. */
export type StartAgentResult =
  | { ok: true; threadId: ThreadId }
  | { ok: false; reason: "not-ready" | "in-progress" | "error"; message?: string };

/** Result of listing a project's tracker issues. A project with no git remote
 *  or a non-GitHub remote resolves to a placeholder reason rather than erroring. */
export type WorkQueueResult =
  | { ok: true; source: "gh" | "rest"; issues: TrackedIssue[] }
  | { ok: false; reason: "no-remote" | "not-github" | "error"; message?: string };

/** Base64 image crossing the IPC boundary with a prompt. */
export interface ImagePayload {
  mimeType: string;
  data: string;
}

// ── Remote session hosting (ADR-0009) ────────────────────────────────
// The same app plays two roles: a master serves its sessions over the
// tailnet (session tap + checkpoint branches), and a laptop attaches
// read-only and pulls work into a worktree. v1 is observe-only.

/** Host-side config for serving sessions. Off by default. */
export interface RemoteHostConfig {
  /** Serving enabled (off by default — never expose a session by accident). */
  enabled: boolean;
  /** Shared bearer token a client must present to attach. */
  token: string;
  /** Port to serve on (0 = random free port, remembered after first start). */
  port: number;
  /** Bind IP auto-resolved from the Tailscale interface; null when offline. */
  bindIp: string | null;
  /** When true, serve EVERY project — current and future. The "select all"
   *  shortcut; `servedProjects` is ignored while this is on. */
  serveAll: boolean;
  /** Explicitly served project ids (only consulted when `serveAll` is false). */
  servedProjects: ProjectId[];
}

/** Phone-pairing info for the watch PWA. The master fronts its relay with
 *  Tailscale Serve (HTTPS on its MagicDNS name) so the HTTPS-served PWA can
 *  reach it without a mixed-content block, then hands the phone a deep link +
 *  QR that pre-fills the connection. */
export interface RemoteConnectInfo {
  /** This machine's Tailscale MagicDNS name (no trailing dot), or null when the
   *  tailnet / `tailscale` CLI is unavailable. */
  magicDnsName: string | null;
  /** HTTPS origin the watch app should hit (Tailscale Serve), or null. */
  httpsUrl: string | null;
  /** Whether `tailscale serve` is actively proxying HTTPS to the relay. */
  serveActive: boolean;
  /** Deep link that opens the watch PWA and pre-fills this connection. Null
   *  until serving + Serve are both up and the HTTPS endpoint is known. */
  connectUrl: string | null;
  /** Inline SVG QR code for `connectUrl` (scan to connect), or null. */
  qrSvg: string | null;
  /** The CLI command to enable Serve, shown when auto-enable isn't possible. */
  serveHint: string | null;
}

/** A machine on this device's tailnet, surfaced so the watcher can pick a host
 *  to attach to without typing an address. `httpsUrl` is the Tailscale Serve
 *  endpoint (HTTPS on 443) the watcher connects to with just a passkey. */
export interface RemoteTailnetPeer {
  /** Short label (first DNS label), e.g. "master-mac". */
  name: string;
  /** Full MagicDNS name (no trailing dot). */
  magicDnsName: string;
  /** HTTPS origin to attach to (`https://<magicDnsName>`). */
  httpsUrl: string;
  /** True when Tailscale reports the peer online. */
  online: boolean;
}

/** A saved master the laptop can reach + attach to. */
export interface RemoteHostConnection {
  id: string;
  /** Human label, e.g. "master-mac". */
  name: string;
  /** Tailnet hostname or IP (no scheme/port). */
  host: string;
  port: number;
  /** Shared bearer token the master generated. */
  token: string;
}

/** A session a master is serving (from GET /sessions). */
export interface RemoteSessionInfo {
  threadId: ThreadId;
  title: string;
  status: ThreadStatus;
  /** The session's project on the master (null for chats), so the laptop can
   *  nest remote threads under their real project names in the sidebar. */
  projectId: ProjectId | null;
  projectName: string | null;
  /** The client currently holding the steering lease (null = free). The lease
   *  auto-acquires on attach, auto-lapses when the tap drops, and can be
   *  force-taken. See lease.ts. */
  controllerId: string | null;
  controllerName: string | null;
  leaseExpiresAt: string | null;
  /** Whether a client marked this thread done/archived; propagated to all
   *  clients so the controller finishing it archives it everywhere. */
  archived: boolean;
  /** Git origin URL of the session's repo, so the laptop can match a local
   *  project to fetch checkpoint branches from. */
  originUrl: string | null;
  /** Latest checkpoint sha on `wip/<threadId>`, if any. */
  lastCheckpointSha: string | null;
  lastCheckpointAt: string | null;
}

/** A served project the phone can start a new thread in (from GET /projects). */
export interface RemoteProjectInfo {
  id: ProjectId;
  name: string;
}

/** Behavioral settings a master exposes over `GET /settings`, so a client can
 *  adopt them on connect (ADR-0011, one-time pull on connect; not reset on
 *  disconnect). UI/window state is intentionally excluded (machine-specific). */
export interface RemoteSettingsSnapshot {
  piSettings: PiSettings;
  autoCompact: AutoCompactSettings;
  utilityModel: ModelInfo | null;
}

/** Allowlisted `~/.pi/agent` files ported over `GET /pi-config` on connect
 *  (ADR-0011). Excludes machine-identity / local-path files:
 *  peach-remote-host.json (the client's own serving identity),
 *  peach-connectors*.json + mcp.json (local binary paths / OAuth clients),
 *  caches (peach-*-cache.json, codex-pool.json, package*.json, .DS_Store). */
export const PORTABLE_PI_CONFIG_FILES = [
  "models.json",
  "auth.json",
  "settings.json",
  ".env",
  ".env.local",
  "caveman.json",
  "vision-proxy.json",
  "promptsmith-settings.json",
  "fancy-footer.json",
  "peach-vision-consent.json",
  "peach-custom-connections.json",
  "peach-bws.json",
  /** Extension enable/disable list (pi settings' packages/extensions arrays). */
  "package.json",
] as const;

/** Directories under ~/.pi/agent to sync wholesale (blind overwrite of each
 *  file, recursed), so extensions + skills — and the per-skill
 *  `disable-model-invocation` frontmatter flag that gates system-prompt
 *  injection — carry over from the master (ADR-0011). */
export const PORTABLE_PI_DIRS = ["skills", "extensions"] as const;

/** Glob patterns to skip when walking PORTABLE_PI_DIRS: each machine
 *  regenerates these locally, so blind-overwriting them would be wasted work
 *  (and could clobber a machine's own install). */
export const PORTABLE_PI_DIR_SKIP = [
  "node_modules/**",
  ".cache/**",
  "**/package-lock.json",
] as const;

/** Response of `GET /pi-config`: filename → file contents (null when the
 *  master doesn't have that file). Keys are relative to ~/.pi/agent — flat
 *  names for allowlisted files, or `skills/<name>/...` / `extensions/...`
 *  paths for the synced directory trees. The client overwrites each present
 *  file into its own ~/.pi/agent. */
export type PiConfigPayload = Record<string, string | null>;

/** A checkpoint snapshot the master recorded for a thread. */
export interface RemoteCheckpoint {
  threadId: ThreadId;
  sha: string;
  createdAt: string;
  /** Whether it was pushed to origin. */
  pushed: boolean;
}

/** Result of pulling a checkpoint into a worktree on the laptop. */
export interface RemotePullResult {
  worktreePath: string;
  sha: string;
}

/** Where a slash-menu entry originates, for categorising the menu. */
export type CommandKind = "prompt" | "extension" | "skill" | "system";

/** Proposed quick-slot toggle behavior produced by the LLM command probe. */
export interface SlotToggleSpec {
  /** Whether the command reads as an on/off mode rather than a one-shot action. */
  isToggle: boolean;
  /** Exact slash command that enables it (null when not a toggle). */
  on: string | null;
  /** Exact slash command that disables it (null when not a toggle). */
  off: string | null;
  /** Short Title Case label for the slot caption. */
  label: string;
  /** One-line rationale (shown to the user). */
  reason: string;
}

/** Slash-menu entry surfaced from pi prompt templates / extension commands / skills. */
export interface CommandInfo {
  /** Friendly name the user types/searches, e.g. "diagnose" (no "skill:" prefix). */
  name: string;
  description: string;
  kind: CommandKind;
}

/** Queued messages for a running thread (steer + follow-up). */
export interface QueueState {
  threadId: ThreadId;
  steering: string[];
  followUp: string[];
}

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
}

/** A model paired with its membership in pi's global `enabledModels` scope.
 *  When `scoped` is false the model is hidden from the composer selector.
 *  An empty scope (everything implicitly scoped) surfaces every model as scoped. */
export interface ScopedModel {
  provider: string;
  id: string;
  name: string;
  scoped: boolean;
}

/** Plan mode runs read-only tools; build mode runs everything. */
export type ToolMode = "all" | "readOnly";

/**
 * Auto-compaction trigger thresholds. A run that ends past EITHER threshold
 * triggers compaction — whichever is reached first (the smaller of the two).
 */
export interface AutoCompactSettings {
  /** Percentage of the model's context window (1–100). */
  percent: number;
  /** Absolute token count. Null = no token-based trigger. */
  tokens: number | null;
}

/** Whether `npm:pi-vision-proxy` is present in the pi `packages` list. */
export interface VisionProxyInstallState {
  installed: boolean;
}

/** GUI-relevant subset of the `pi-vision-proxy` config
 *  (`~/.pi/agent/vision-proxy.json`). The extension merges this over its
 *  built-in defaults on read; we only store the keys the user can change. */
export interface VisionProxyConfig {
  /** Proxy mode (default "fallback"). */
  mode: "fallback" | "always" | "off";
  /** Vision model provider (default "anthropic"). */
  provider: string;
  /** Vision model id within the provider (default "claude-sonnet-4-5"). */
  modelId: string;
  /** Whether the extension is currently installed as a pi package. */
  installed: boolean;
  /** Whether an env var (PI_VISION_PROXY_MODE / _MODEL) is currently
   *  overriding the file value, which locks the corresponding GUI control. */
  modeLocked: boolean;
  modelLocked: boolean;
}

/** Caveman compression state, mirrored from the pi-caveman extension config. */
export interface CavemanState {
  enabled: boolean;
  /** The level applied when enabled (e.g. "full", "ultra"). */
  level: string;
}

/** Retry settings from ~/.pi/agent/settings.json. */
export interface RetrySettings {
  enabled: boolean;
  maxRetries: number;
  baseDelayMs: number;
  provider: {
    timeoutMs: number | null;
    maxRetries: number;
    maxRetryDelayMs: number;
  };
}

/** Subset of pi settings exposed in the GUI. */
export interface PiSettings {
  retry: RetrySettings;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  /** Auto-run `pi update --extensions` on launch + periodically. Default on. */
  autoUpdateExtensions: boolean;
  /** Prevent macOS idle sleep while an agent run is active (caffeinate). Default off. */
  insomnia: boolean;
}

/** Live per-session metadata published main → renderer. */
export interface SessionMeta {
  threadId: ThreadId;
  model: ModelInfo | null;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  contextTokens: number | null;
  contextWindow: number | null;
  contextPercent: number | null;
}

/** Git status for a thread's working directory. */
export interface GitInfo {
  isRepo: boolean;
  /** Current branch; null while on a detached HEAD (worktree pre-commit). */
  branch: string | null;
  /** Repo default branch (origin/HEAD); null if undetermined. PR target. */
  defaultBranch: string | null;
  changedCount: number;
  insertions: number;
  deletions: number;
  ahead: number;
  behind: number;
  isWorktree: boolean;
  /** Worktree HEAD is an ancestor of the local project's current branch
   *  (i.e. this worktree's committed work is already merged back to local). */
  mergedToLocal: boolean;
}

export interface GitChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

export type GitCommitPushResult =
  | { ok: true; branch: string; message: string; pushed: boolean }
  | { ok: false; error: string };

export type GitPrResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Merge a worktree's branch (--no-ff) into the local project's current branch. */
export type GitMergeResult =
  | { ok: true; target: string; branch: string; hasRemote: boolean; warning?: string }
  | { ok: false; error: string };

/** Push the local project repo's current branch after a merge-to-local. */
export type GitPushLocalResult =
  | { ok: true; branch: string }
  | { ok: false; error: string };

/** A scheduled prompt. Fires into a fresh thread (project) or chat (null). */
export interface AutomationModel {
  provider: string;
  id: string;
  name: string;
}

export interface Automation {
  id: string;
  name: string;
  cron: string;
  projectId: ProjectId | null;
  prompt: string;
  /** Where the fired thread runs: the project's checkout, or a fresh
   *  isolated worktree. Ignored for chats (null projectId). */
  environment: "local" | "worktree";
  /** Pinned model for the fired thread, or null to use pi's default. */
  model?: AutomationModel | null;
  enabled: boolean;
  lastFiredAt?: string;
  nextFireAt?: string;
  createdAt: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  threadId: ThreadId | null;
  firedAt: string;
}

/** Text widget published by an extension (e.g. pi-subagents fleet feed). */
export interface ExtensionWidgetPayload {
  threadId: ThreadId;
  key: string;
  lines: string[] | null;
}

/** A subagent definition file (~/.pi/agent/agents or <project>/.pi/agents). */
export interface SubagentAgentInfo {
  name: string;
  description?: string;
  model?: string;
  thinking?: string;
  mode?: string;
  enabled: boolean;
  scope: "global" | "project";
  filePath: string;
  body: string;
}

/** Editable fields of a subagent definition (null clears the frontmatter key). */
export interface SubagentAgentPatch {
  model?: string | null;
  thinking?: string | null;
  description?: string | null;
}

/** Knowledge-graph state for a project (graphify CLI, graphify-out/). */
export interface GraphifyStatus {
  /** graphify binary found on this machine. */
  available: boolean;
  hasGraph: boolean;
  nodeCount: number;
  edgeCount: number;
  builtAt: string | null;
  building: boolean;
}

/** Whether the DevTap runtime tap is installed in a project. */
export interface DevTapProjectStatus {
  /** A tap adapter module was found in the project. */
  installed: boolean;
  /** Path of the detected tap module, if any. */
  tapPath: string | null;
  /** The global DevTap reader extension exists (~/.pi/agent/extensions/devtap). */
  extensionInstalled: boolean;
}

/** A skill discovered by pi's resource loader. */
export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  /** "global" | "project" | package name etc. — human-readable origin. */
  source: string;
  /** On-disk file/dir to delete for a skill whose file sits under a `skills`
   *  directory. For packaged skills this is null (manage via `pi remove`). */
  deletePath: string | null;
  /** True = hidden from the system prompt, invocable only via `/skill:name`.
   *  Mirrors pi's `disable-model-invocation` frontmatter field. */
  disableModelInvocation: boolean;
}

/** A loaded pi extension (or a load failure). */
export interface ExtensionInfo {
  /** Extension path as configured. */
  path: string;
  name: string;
  source: string;
  tools: string[];
  commands: string[];
  error?: string;
  /** Install spec (`npm:…`/`git:…`) for `pi remove`; null for local extensions. */
  removeSpec: string | null;
  /** On-disk file/dir to delete for a local extension; null for packages. */
  deletePath: string | null;
  /** True when peach-pi has moved this extension out of the active load list
   *  (`packages`/`extensions`) into the peach-managed stash so pi no longer
   *  loads it. Restoring re-adds it. Applies to new sessions. */
  disabled: boolean;
}

/** Resources visible for a given cwd (global + project-local). */
export interface ResourceInspection {
  skills: SkillInfo[];
  extensions: ExtensionInfo[];
  prompts: CommandInfo[];
}

/** Extension dialog request proxied main → renderer. */
export interface ExtensionUiRequest {
  threadId: ThreadId;
  requestId: string;
  kind: "select" | "confirm" | "input";
  title: string;
  message?: string;
  options?: string[];
  placeholder?: string;
}

/** One render frame of an extension's terminal `custom()` TUI component,
 *  streamed main → renderer for the xterm overlay. `busy` keeps the last
 *  frame visible (under a spinner) between screens; `closed` clears the
 *  overlay when the command finishes or the session is disposed. */
export interface TerminalCustomFrame {
  threadId: ThreadId;
  requestId: string;
  lines: string[];
  busy?: boolean;
  closed?: boolean;
}

/** Toast-style notification (extension notify or app notices). */
/** Compatibility verdict for one loaded pi extension vs the bundled pi SDK. */
export interface PiExtensionHealth {
  /** Package id as declared in pi settings (e.g. `git:github.com/edxeth/pi-subagents`). */
  id: string;
  /** pi SDK version the extension was resolved/built against, if discoverable. */
  resolvedSdk: string | null;
  /** Declared peerDependency range on the pi SDK, if any. */
  peerRange: string | null;
  /** `peer-violation` (hard error) | `version-drift` (likely-incompatible) | null. */
  issue: "peer-violation" | "version-drift" | null;
  level: "error" | "warning" | null;
}

/** Startup compatibility report: the bundled pi vs the user's loaded extensions. */
export interface PiHealth {
  /** pi SDK version the app actually loads, or null if it couldn't be found. */
  hostVersion: string | null;
  status: "ok" | "warning" | "error";
  extensions: PiExtensionHealth[];
  /** Human-readable lines for the banner. Empty when status is `ok`. */
  problems: string[];
}

export interface NoticePayload {
  threadId?: ThreadId;
  message: string;
  level: "info" | "warning" | "error";
}

/** Package names with available updates (emitted by PiUpdateService). */
export interface ExtUpdatesAvailable {
  packages: string[];
}

/** Extension status-bar text for a thread (key = extension-chosen slot). */
export interface ExtensionStatusPayload {
  threadId: ThreadId;
  key: string;
  text: string | null;
}

/** One search hit from `threads:search`. Snippet is present when the
 *  query matched inside the thread body (not just the title). */
export interface ThreadSearchHit {
  threadId: ThreadId;
  title: string;
  /** "" for chats (no project). */
  projectName: string;
  /** Surrounding-text excerpt around the first body match, if any. */
  snippet?: string;
}

/** One message in a `/btw` side conversation (ephemeral re: main history). */
export interface SideMessage {
  role: "user" | "assistant";
  text: string;
}

/** A `/btw` side conversation: a cheap, isolated mini-chat attached to a
 *  thread. Reads the main conversation as context but never writes to it.
 *  Persisted per thread so prior side chats form a browsable history. */
export interface SideConversation {
  id: string;
  threadId: ThreadId;
  title: string;
  /** Model used to answer (defaults to the thread's current session model). */
  model: ModelInfo | null;
  messages: SideMessage[];
  createdAt: string;
  updatedAt: string;
}

/** Streaming text fragment for an in-flight side-chat answer. */
export interface SideDeltaPayload {
  convId: string;
  threadId: ThreadId;
  text: string;
}

/** A side-chat answer finished (or failed). */
export interface SideDonePayload {
  convId: string;
  threadId: ThreadId;
  error?: string;
}

/** Snapshot published main → renderer. Grows with features. */
export interface AppSnapshot {
  projects: Project[];
  worktrees: Worktree[];
  threads: Thread[];
  automations: Automation[];
  ui: UiState;
}

/** A locally-saved API credential for an arbitrary HTTP service, independent
 *  of Composio. Stored on-device; the agent calls it via the `custom_request`
 *  tool. The raw key never crosses IPC to the renderer (only `keyPreview`). */
export interface CustomConnection {
  id: string;
  name: string;
  /** e.g. "https://metabase.acme.com" — no trailing slash needed. */
  baseUrl: string;
  /** Header the key is sent in, e.g. "Authorization" or "X-API-Key". */
  headerName: string;
  /** Prefix prepended to the key, e.g. "Bearer " or "" (raw). */
  headerPrefix: string;
  /** Masked tail of the key for display, e.g. "••••7f3a". */
  keyPreview: string;
  /** Favicon URL for the row icon (derived from baseUrl); null = monogram. */
  logoUrl: string | null;
  createdAt: string;
}

/** A connection the user pinned in the composer with `@` so the model prefers
 *  it for that task. The hint is prepended to the outgoing prompt; the underlying
 *  tools (custom_request / connector_execute) are always available regardless. */
export interface ReferencedConnection {
  /** "custom" = saved HTTP connection; "composio" = connected Composio toolkit. */
  kind: "custom" | "composio";
  /** Display name (custom connection name or Composio toolkit name). */
  name: string;
  /** Base URL (kind === "custom" only). */
  baseUrl?: string;
  /** Composio toolkit slug (kind === "composio" only); filters connectors_search_tools. */
  toolkitSlug?: string;
  /** Favicon/logo for the chip. */
  logoUrl?: string | null;
}

/** A Bitwarden Secrets Manager secret the user pinned with `@` so the model
 *  knows it is available for this task. Only the secret *name* + *id* are
 *  stored here — never the value. The model fetches the value at runtime via
 *  the `bws_get_secret` tool; the cleartext never enters the prompt text. */
export interface ReferencedSecret {
  /** BWS secret id (used by `bws_get_secret` to fetch the value). */
  id: string;
  /** Secret key/name (display + nudge). */
  name: string;
  /** BWS project id the secret lives in. */
  projectId: string;
}

/** A connection config the setup assistant proposes after verifying it; the
 *  user reviews + saves it. The held API key is never echoed here. */
export interface ProposedConnectionConfig {
  name: string;
  baseUrl: string;
  headerName: string;
  headerPrefix: string;
}

/** Streaming assistant text from the connection-setup assistant. */
export interface ConnSetupDeltaPayload {
  sessionId: string;
  text: string;
}

/** A read-only verification probe the assistant ran against the user's API. */
export interface ConnSetupProbePayload {
  sessionId: string;
  /** e.g. "GET /api/user/current → 200". */
  summary: string;
  ok: boolean;
}

/** The assistant proposed a final, verified config to prefill the save form. */
export interface ConnSetupConfigPayload {
  sessionId: string;
  config: ProposedConnectionConfig;
}

/** A setup-assistant turn finished (now idle, awaiting the user) or errored. */
export interface ConnSetupDonePayload {
  sessionId: string;
  error?: string;
}

/** Params for creating a custom connection (includes the raw key). */
export interface CustomConnectionInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  headerName?: string;
  headerPrefix?: string;
  logoUrl?: string | null;
}

/** Connection status as reported by Composio for a connected account. */
export type ConnectionStatus = "ACTIVE" | "INITIATED" | "EXPIRED" | "FAILED" | "INACTIVE";

/** One toolkit in the Composio catalogue (a searchable connect target).
 *  Sourced live from `toolkits.list`; nothing about it is persisted. */
export interface ToolkitCatalogEntry {
  /** Composio toolkit slug, e.g. "gmail", "github", "notion". */
  slug: string;
  /** Display name, e.g. "Gmail". */
  name: string;
  description: string;
  logoUrl: string | null;
  /** Primary auth scheme: "OAUTH2", "API_KEY", "BEARER_TOKEN", … */
  authScheme: string;
  /** How many ACTIVE connected accounts the local user has for this toolkit.
   *  >0 still allows connecting more (e.g. a second Gmail account). */
  connectedCount: number;
}

/** One tool a toolkit exposes, for the detail pane. `readOnly` is derived from
 *  Composio's MCP-style hint tags (readOnlyHint). */
export interface ToolInfo {
  slug: string;
  name: string;
  description: string;
  readOnly: boolean;
}

/** One credential field a non-OAuth toolkit asks for at connect time, e.g.
 *  Metabase's base URL + API key. Sourced from Composio's
 *  `connectedAccountInitiation` schema; the `name` is the exact key Composio
 *  expects back. */
export interface AuthField {
  /** Composio field key, e.g. "full", "generic_api_key", "subdomain". */
  name: string;
  label: string;
  description: string;
  required: boolean;
  /** True for secret fields (rendered as password inputs). */
  secret: boolean;
}

/** Full view of one toolkit for the detail pane: metadata + its tool list.
 *  Fetched live on selection; nothing persisted. */
export interface ToolkitDetail {
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  authScheme: string;
  /** Category labels from Composio meta, e.g. ["email"]. */
  categories: string[];
  /** Fields to collect for a manual (non-OAuth) connection. Empty for OAuth. */
  authFields: AuthField[];
  tools: ToolInfo[];
}

/** A connected account: one provider the local user has authenticated through
 *  Composio. Composio holds the tokens; peach-pi holds only this metadata. */
export interface Connection {
  /** Composio connected-account id (ca_…). */
  id: string;
  toolkitSlug: string;
  name: string;
  /** User/provider label distinguishing multiple accounts of one toolkit
   *  (e.g. two Gmail addresses). Null when Composio has none. */
  alias: string | null;
  logoUrl: string | null;
  status: ConnectionStatus;
  createdAt: string;
}

/** Result of starting a connect flow. For OAuth, `redirectUrl` is the
 *  Composio-hosted authorize URL the renderer opens; completion is reported
 *  later via `event:connectorsChanged`. Null for non-redirect (API-key)
 *  schemes, which complete synchronously. */
export interface ConnectStartResult {
  redirectUrl: string | null;
  connectionRequestId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP servers
// ─────────────────────────────────────────────────────────────────────────────

/** One MCP server configured in `~/.pi/agent/mcp.json`, surfaced in the
 *  Connections view. Server identity + launch command come from the config;
 *  `toolCount` and `connected` come from the pi-mcp-adapter metadata cache
 *  (`~/.pi/agent/mcp-cache.json`) when available.
 *
 *  Lifecycle: pi-mcp-adapter connects to servers listed under `mcpServers`.
 *  peach-pi toggles load by moving an entry between `mcpServers` and a
 *  peach-managed `peachDisabledMcpServers` map in the same file. Applies to
 *  new sessions. */
export interface McpServer {
  /** Server name (key in mcp.json `mcpServers`). */
  name: string;
  /** Launch command + args as configured, e.g. `node --experimental-strip-types …`.
 *  Truncated for display; full value is not needed by the renderer. */
  command: string;
  /** Number of tools discovered for this server (from the metadata cache).
 *  Null when the cache has no entry yet (server never connected or is lazy). */
  toolCount: number | null;
  /** Whether the metadata cache has a fresh entry for this server's config.
 *  False until the first successful connection populates the cache. */
  connected: boolean;
  /** True when peach-pi has moved this server out of `mcpServers` into the
 *  peach-managed `peachDisabledMcpServers` stash so pi-mcp-adapter no longer
 *  connects to it. Restoring re-adds it. Applies to new sessions. */
  disabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// BWS — Bitwarden Secrets Manager CLI
// ─────────────────────────────────────────────────────────────────────────────

/** A Secrets Manager project the machine account can access. */
export interface BwsProject {
  id: string;
  organizationId: string;
  name: string;
}

/** One secret in Secrets Manager. `value` is the cleartext secret — it only
 *  crosses IPC because the view explicitly displays/edits it (masked in the UI
 *  until revealed). The access token never leaves the main process. */
export interface BwsSecret {
  id: string;
  organizationId: string;
  projectId: string;
  key: string;
  value: string;
  note: string;
  creationDate: string;
  revisionDate: string;
}

/** Fields for creating a secret (`bws secret create <KEY> <VALUE> <PROJECT_ID>`). */
export interface BwsSecretInput {
  key: string;
  value: string;
  projectId: string;
  note?: string;
}

/** Partial edit for an existing secret (`bws secret edit <ID> --key … --value …`). */
export interface BwsSecretPatch {
  key?: string;
  value?: string;
  note?: string;
  projectId?: string;
}

/** Snapshot of the local bws integration state, shown by the BWS view.
 *  `hasToken` reports whether an access token is saved on-device; the token
 *  itself is never returned. `authenticated` is true only when a probe call
 *  (project list) succeeded with that token. */
export interface BwsStatus {
  /** Is the `bws` binary discoverable on this machine? */
  installed: boolean;
  /** Version string from `bws --version`, e.g. "2.0.0". Null if not installed. */
  version: string | null;
  /** Whether an access token is available (saved on-device or found in shell). */
  hasToken: boolean;
  /** Where the active token came from: "saved" (entered here), "shell"
   *  (BWS_ACCESS_TOKEN exported in your login shell), or null (none). */
  tokenSource: "saved" | "shell" | null;
  /** Whether the saved token successfully authenticated against Secrets Manager. */
  authenticated: boolean;
  /** The currently selected project id (persisted), or null. */
  projectId: string | null;
  /** The selected project's metadata, if it resolves in `projects`. */
  project: BwsProject | null;
  /** All projects the token can access (empty unless authenticated). */
  projects: BwsProject[];
  /** Last error from the auth probe (e.g. invalid token), for display. */
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Browser (native web computer-use tool)
// ─────────────────────────────────────────────────────────────────────────────

/** Read-only install state of the `pi-agent-browser-native` pi package, which
 *  exposes the native `agent_browser` tool (ADR-0008). */
export interface AgentBrowserState {
  /** Whether `npm:pi-agent-browser-native` is in pi's `packages[]`. */
  installed: boolean;
  /** Upstream `agent-browser` engine version on PATH (the native tool is a
   *  wrapper and shells out to it); null when the binary is missing. */
  binaryVersion: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cua Driver (native background computer use)
// ─────────────────────────────────────────────────────────────────────────────

/** macOS TCC permission grant state, as reported by the driver daemon.
 *  `unknown` when the daemon isn't running or the grant can't be read. */
export type PermissionState = "granted" | "denied" | "unknown";

/** Read-only status of the bundled Cua Driver, surfaced in the Connections
 *  view. peach-pi installs CuaDriver.app + starts its background daemon; the
 *  agent drives it via the `cua-driver` CLI (see ADR-0007). */
export interface CuaDriverStatus {
  /** CuaDriver.app present (installed to /Applications, or the bundled copy). */
  installed: boolean;
  /** Driver version from `cua-driver --version`; null when unavailable. */
  version: string | null;
  /** Whether the background daemon is reachable. */
  daemonRunning: boolean;
  /** Accessibility permission grant (required to read/drive native UI). */
  accessibility: PermissionState;
  /** Screen Recording permission grant (required for window screenshots). */
  screenRecording: PermissionState;
}

// ─────────────────────────────────────────────────────────────────────────────
// Record & Replay
// ─────────────────────────────────────────────────────────────────────────────

/** Live state of the desktop recorder, pushed to the renderer on every change
 *  via `event:recordingState`. Idle = nothing running. */
export interface RecordingState {
  status: "idle" | "recording" | "stopping" | "error";
  /** Active recording id; null when idle. */
  recordingId: string | null;
  /** Wall-clock ISO when recording started. */
  startedAt: string | null;
  /** Captured event count so far. */
  eventCount: number;
  /** Human-readable status/error note (e.g. permission denied, binary missing). */
  message: string | null;
  /** Path to the synthesized skill file once stop completes; null otherwise. */
  skillPath: string | null;
}

/** Result of `recording:stop` — drives the post-stop UI (show skill path). */
export interface RecordingStopResult {
  recordingId: string;
  eventCount: number;
  durationMs: number;
  /** The semantic digest of captured events, for display or LLM synthesis. */
  digest: string;
  /** Path the skill file was saved to, if `skill` body was provided. */
  skillPath: string | null;
  /** The ready-to-send synthesis prompt (digest + instructions). The renderer
   *  forwards this to the chat thread that started the recording so the agent
   *  authors the skill inline, instead of the user asking manually. */
  synthesisPrompt: string;
}

// ── Usage tracking ───────────────────────────────────────────────────
// Tracks provider spend/usage across subscription plans and pay-per-token
// providers. Subscription providers (Anthropic, Z.ai) surface quota windows
// (5h + weekly); pay-per-token providers (OpenRouter, NeuralWatt) surface a
// $ balance / energy used. The same view shows both kinds side by side.

/** A single rolling quota window a subscription plan enforces. */
export interface UsageWindow {
  /** Remaining percentage 0–100 (how much of the window is still available;
   *  0 = fully consumed, 100 = untouched). Counted down, not up. */
  remainingPct: number;
  /** ISO 8601 timestamp the window resets at, or null when unknown. */
  resetAt: string | null;
}

/** Subscription quota usage (e.g. Anthropic Claude plan, Z.ai coding plan). */
export interface UsageQuotaSummary {
  kind: "quota";
  fiveHours: UsageWindow | null;
  weekly: UsageWindow | null;
}

/** Pay-per-token balance / spend (e.g. OpenRouter credits, NeuralWatt $/energy). */
export interface UsageBalanceSummary {
  kind: "balance";
  /** Remaining credit balance in USD, or null when the provider doesn't
   *  report a dollar balance (e.g. NeuralWatt is energy-based). */
  balanceUSD: number | null;
  /** Spend in the current UTC day/week/month, where reported. */
  spentDay: number | null;
  spentWeek: number | null;
  spentMonth: number | null;
  /** Provider-specific extra metrics (e.g. NeuralWatt energy kWh/J +
   *  request count) surfaced in the detail view. */
  extra: UsageMetric[];
}

/** A single labelled metric (energy, requests, etc.) for the detail view. */
export interface UsageMetric {
  label: string;
  /** Pre-formatted value string (e.g. "0.0234 kWh", "1,523 reqs"). */
  value: string;
}

/** How the live usage fetch resolved, for renderer state display. */
export type UsageFetchState = "ok" | "partial" | "unknown" | "unsupported" | "manual";

/** One provider's usage summary. The view lists one card per entry. */
export interface ProviderUsageSummary {
  /** Provider id, matching `models.json` providers key (or "anthropic"). */
  provider: string;
  /** Human-readable name (e.g. "Anthropic", "Z.ai", "OpenRouter"). */
  label: string;
  /** Whether this provider is configured with credentials to query. */
  configured: boolean;
  /** Quota windows (subscription) or balance/spend (pay-per-token). */
  summary: UsageQuotaSummary | UsageBalanceSummary | null;
  /** Live fetch resolution state. */
  state: UsageFetchState;
  /** Human-readable note when state isn't "ok" (e.g. auth/instructions). */
  note: string | null;
  /** When non-null, the provider's usage is only viewable on a dashboard
   *  (state "manual"); the view offers this as a one-click link. */
  dashboardUrl: string | null;
  /** ISO 8601 of the last successful fetch, or null if never fetched. */
  fetchedAt: string | null;
}

// ── Movable execution (remote-handoff package) ───────────────────────
// Per-thread ownership with safe handoff between machines (see
// docs/remote-handoff.md). Distinct from ADR-0009's host/attach session
// hosting: this is the "remote-first mode" toggle + per-thread owner.

/** Remote-first mode makes new threads start on a remote machine, and makes
 *  messaging a thread hand it off to the remote machine. Off by default —
 *  the user must opt in. Drives the pulsing sidebar indicator. */
export interface RemoteFirstMode {
  /** Whether remote-first mode is on. */
  enabled: boolean;
  /** The machine name threads are handed TO ("home", "travel-laptop"…).
   *  Null when no remote machine is registered — remote-first is inert then. */
  targetMachine: string | null;
  /** Whether at least one remote machine is configured (so the toggle can warn). */
  hasRemoteMachine: boolean;
}

/** Per-conversation-thread handoff status surfaced to the renderer. A thread
 *  that has never been handed off has status "none." */
export interface ThreadHandoffStatus {
  threadId: ThreadId;
  /** "none" = this thread has no handoff thread; "remote" = owned by a remote
   *  machine; "local" = owned by this machine. */
  owner: "none" | "local" | "remote";
  /** The handoff thread id (peach/thread_…), or null. */
  handoffThreadId: string | null;
  /** Owner machine name when remote, else null. */
  remoteMachine: string | null;
  /** Whether this machine currently holds the lease (may mutate the workspace). */
  leaseHeldHere: boolean;
}
