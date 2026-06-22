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
  | "agents"
  | "graph";

/** Base64 image crossing the IPC boundary with a prompt. */
export interface ImagePayload {
  mimeType: string;
  data: string;
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
export interface Automation {
  id: string;
  name: string;
  cron: string;
  projectId: ProjectId | null;
  prompt: string;
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

/** A saved external-service credential. Secrets never cross the IPC seam:
 *  only identity/metadata + non-secret OAuth config is exposed to the renderer.
 *  The secret blob (API key or OAuth token set) lives encrypted in SQLite. */
export interface Connector {
  id: string;
  /** Service id, e.g. "notion", "github", "linear", or "custom:<name>". */
  provider: string;
  /** Human label chosen by the user. */
  label: string;
  authKind: "api_key" | "oauth";
  /** OAuth: false until a token exchange completes. API-key: always true. */
  connected: boolean;
  /** Non-secret OAuth config (omitted for api-key connectors). */
  oauth?: ConnectorOauthConfig;
  /** Token expiry (ISO), when the provider tells us. */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Non-secret OAuth connector config — surfaced to the renderer for editing.
 *  CLIENT_SECRET is intentionally absent; it lives only in the encrypted blob. */
export interface ConnectorOauthConfig {
  clientId: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** PKCE S256 by default; false for providers that don't support it (Notion). */
  usePkce: boolean;
  /** Send client_secret as HTTP Basic auth (Notion requires it) vs in the body. */
  useBasicAuth: boolean;
  /** Route the handshake + token exchange through the vendor OAuth broker
   *  instead of talking to the provider directly. Set for confidential
   *  providers (Notion, GitHub, …) so the client_secret never ships. */
  useBroker?: boolean;
}

/** Input for `connectors:createApiKey`. */
export interface CreateApiKeyInput {
  provider: string;
  label: string;
  apiKey: string;
}

/** Input for `connectors:createOAuth` (BYO client — no bundled secrets). */
export interface CreateOAuthInput {
  provider: string;
  label: string;
  clientId: string;
  /** User-supplied client secret — encrypted before persistence, never
   *  returned. Omit for PKCE public clients (GitHub, Google, Linear, …). */
  clientSecret?: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes?: string[];
  usePkce?: boolean;
  useBasicAuth?: boolean;
  /** Route through the vendor broker (confidential providers); client_id and
   *  client_secret are then held server-side and omitted here. */
  useBroker?: boolean;
}

/** Result of starting an OAuth flow — the URL for the renderer to open. */
export interface OAuthStartResult {
  authUrl: string;
}

/** What `connectors:resolve` returns for a configured connector. Raw token or
 *  ready-to-use headers; agents/tools use this like Claude's apiKeyHelper. */
export interface ResolvedCredential {
  headers: Record<string, string>;
  tokenType: string | null;
  expiresAt: string | null;
}

/** Defaults for a known OAuth provider — pre-fills the BYO-client form in the
 *  renderer. The user still supplies their own client_id + client_secret
 *  (unless a `clientId` is bundled). Also drives the connector catalog grid. */
export interface OAuthPreset {
  provider: string;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** PKCE S256 supported? false for Notion (Notion doesn't fully support PKCE). */
  usePkce: boolean;
  /** Requires HTTP Basic auth on the token endpoint? true for Notion. */
  useBasicAuth: boolean;
  /** Default redirect URI. Custom-scheme-tolerant providers use deep-link;
   *  Notion rejects custom schemes and needs `http://localhost:<port>/callback`. */
  redirectUri: string;
  /** simple-icons slug (e.g. "notion"); renderer falls back to a monogram
   *  tile when absent or unknown. */
  icon?: string;
  /** Brand hex override; otherwise the renderer uses simple-icons' own hex. */
  iconHex?: string;
  /** Provider REST base, shown for reference (agent-side tools call this). */
  apiBaseUrl?: string;
  /** "Create an OAuth app" / credentials docs — linked from the connect form. */
  docsUrl?: string;
  /** Bundled public client_id, when peach-pi ships a registered app for this
   *  provider. Undefined = user supplies their own (BYO). */
  clientId?: string;
  /** When true, confidential handshakes route through the vendor broker (the
   *  broker holds the secret). One-click without any local credential. */
  useBroker?: boolean;
  /** Bundled client_secret for confidential clients (e.g. Notion). Provisioned
   *  out-of-band; lets "Connect" skip the form entirely. */
  clientSecret?: string;
  /** Does the token endpoint need a client_secret? false for PKCE-only public
   *  clients. Defaults to true. */
  clientSecretRequired?: boolean;
  /** Runtime-only: true when a client (bundled or provisioned via the local
   *  clients file) exists, so the renderer can offer one-click Connect. */
  hasClient?: boolean;
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
}
