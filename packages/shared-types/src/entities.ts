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

export type ThreadStatus = "idle" | "running" | "failed" | "completed";

export interface Thread {
  id: ThreadId;
  /** Null for custom chats (not tied to a repo). */
  projectId: ProjectId | null;
  /** Absolute path of the pi JSONL session file backing this thread. */
  piSessionFile: string | null;
  /** For custom chats: the chat-specific workspace directory. */
  chatWorkspaceDir?: string;
  /** For worktree threads: the isolated git worktree this thread works in. */
  worktreeDir?: string;
  title: string;
  status: ThreadStatus;
  snoozedUntil?: string;
  toTestAt?: string;
  toTestNote?: string;
  archivedAt?: string;
  createdAt: string;
  lastActivityAt: string;
}

export type ThreadKind = "thread" | "chat";

export interface UiState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  activeView: AppView;
  selectedThreadId: ThreadId | null;
}

export type AppView =
  | "new-thread"
  | "thread"
  | "settings"
  | "skills"
  | "extensions"
  | "automations"
  | "testing"
  | "agents"
  | "graph";

/** Base64 image crossing the IPC boundary with a prompt. */
export interface ImagePayload {
  mimeType: string;
  data: string;
}

/** Slash-menu entry surfaced from pi prompt templates / extension commands. */
export interface CommandInfo {
  name: string;
  description: string;
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
  changedCount: number;
  insertions: number;
  deletions: number;
  ahead: number;
  behind: number;
  isWorktree: boolean;
}

export interface GitChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

export type GitCommitPushResult =
  | { ok: true; branch: string; message: string; pushed: boolean }
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

/** Toast-style notification (extension notify or app notices). */
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

/** Snapshot published main → renderer. Grows with features. */
export interface AppSnapshot {
  projects: Project[];
  threads: Thread[];
  automations: Automation[];
  ui: UiState;
}
