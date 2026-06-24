import { randomUUID } from "node:crypto";
import type {
  Automation,
  AutomationRun,
  ModelInfo,
  Project,
  SideConversation,
  SideMessage,
  Thread,
  ThreadTag,
  UiState,
  Worktree,
} from "@peach-pi/shared-types";
import type { AppDb } from "./db.ts";

interface ProjectRow {
  id: string;
  path: string;
  name: string;
  kind: string;
  ord: number;
  created_at: string;
  archived_at: string | null;
}

interface ThreadRow {
  id: string;
  project_id: string | null;
  pi_session_file: string | null;
  chat_workspace_dir: string | null;
  worktree_dir: string | null;
  worktree_id: string | null;
  title: string;
  tag: string | null;
  status: string;
  snoozed_until: string | null;
  woke_from_snooze_at: string | null;
  to_test_at: string | null;
  to_test_note: string | null;
  archived_at: string | null;
  created_at: string;
  last_activity_at: string;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  path: r.path,
  name: r.name,
  kind: r.kind as Project["kind"],
  order: r.ord,
  createdAt: r.created_at,
  archivedAt: r.archived_at ?? undefined,
});

const toThread = (r: ThreadRow): Thread => ({
  id: r.id,
  projectId: r.project_id,
  piSessionFile: r.pi_session_file,
  chatWorkspaceDir: r.chat_workspace_dir ?? undefined,
  worktreeId: r.worktree_id,
  worktreeDir: r.worktree_dir ?? undefined,
  title: r.title,
  tag: (r.tag as ThreadTag | null) ?? undefined,
  status: r.status as Thread["status"],
  snoozedUntil: r.snoozed_until ?? undefined,
  wokeFromSnoozeAt: r.woke_from_snooze_at ?? undefined,
  toTestAt: r.to_test_at ?? undefined,
  toTestNote: r.to_test_note ?? undefined,
  archivedAt: r.archived_at ?? undefined,
  createdAt: r.created_at,
  lastActivityAt: r.last_activity_at,
});

export class ProjectRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  all(): Project[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY ord, created_at")
      .all() as unknown as ProjectRow[];
    return rows.map(toProject);
  }

  add(path: string, name: string, kind: Project["kind"]): Project {
    const id = randomUUID();
    const now = new Date().toISOString();
    const maxOrd = (
      this.db.prepare("SELECT COALESCE(MAX(ord), -1) AS m FROM projects").get() as { m: number }
    ).m;
    this.db
      .prepare("INSERT INTO projects (id, path, name, kind, ord, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, path, name, kind, maxOrd + 1, now);
    return { id, path, name, kind, order: maxOrd + 1, createdAt: now };
  }

  remove(id: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }

  /** Persist a full reordering. Writes the `ord` of each listed project to
   *  its array index; projects not in the list keep their old ord. */
  reorder(orderedIds: string[]): void {
    const stmt = this.db.prepare("UPDATE projects SET ord = ? WHERE id = ?");
    this.db.exec("BEGIN");
    try {
      orderedIds.forEach((id, index) => stmt.run(index, id));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

interface WorktreeRow {
  id: string;
  project_id: string;
  dir: string;
  name: string;
  created_at: string;
  archived_at: string | null;
}

const toWorktree = (r: WorktreeRow): Worktree => ({
  id: r.id,
  projectId: r.project_id,
  dir: r.dir,
  name: r.name,
  createdAt: r.created_at,
  archivedAt: r.archived_at ?? undefined,
});

export class WorktreeRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  all(): Worktree[] {
    const rows = this.db
      .prepare("SELECT * FROM worktrees ORDER BY created_at")
      .all() as unknown as WorktreeRow[];
    return rows.map(toWorktree);
  }

  /** Active worktrees for a project (archived ones excluded). */
  activeForProject(projectId: string): Worktree[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM worktrees WHERE project_id = ? AND archived_at IS NULL ORDER BY created_at",
      )
      .all(projectId) as unknown as WorktreeRow[];
    return rows.map(toWorktree);
  }

  get(id: string): Worktree | null {
    const row = this.db.prepare("SELECT * FROM worktrees WHERE id = ?").get(id) as
      | WorktreeRow
      | undefined;
    return row ? toWorktree(row) : null;
  }

  insert(fields: { projectId: string; dir: string; name: string }): Worktree {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO worktrees (id, project_id, dir, name, created_at) VALUES (?,?,?,?,?)",
      )
      .run(id, fields.projectId, fields.dir, fields.name, now);
    return this.get(id)!;
  }

  /** Next "Worktree N" name for a project, counting existing rows. */
  nextName(projectId: string): string {
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM worktrees WHERE project_id = ?")
      .get(projectId) as { c: number };
    return `Worktree ${row.c + 1}`;
  }

  setName(id: string, name: string): void {
    this.db.prepare("UPDATE worktrees SET name = ? WHERE id = ?").run(name, id);
  }

  setArchived(id: string, at: string | null): void {
    this.db.prepare("UPDATE worktrees SET archived_at = ? WHERE id = ?").run(at, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM worktrees WHERE id = ?").run(id);
  }
}

export class ThreadRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  all(): Thread[] {
    const rows = this.db
      .prepare("SELECT * FROM threads ORDER BY last_activity_at DESC")
      .all() as unknown as ThreadRow[];
    return rows.map(toThread);
  }

  insert(fields: {
    projectId: string | null;
    title: string;
    piSessionFile?: string;
    chatWorkspaceDir?: string;
    worktreeId?: string | null;
    worktreeDir?: string;
  }): Thread {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO threads (id, project_id, pi_session_file, chat_workspace_dir, worktree_dir, worktree_id, title, status, created_at, last_activity_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        fields.projectId,
        fields.piSessionFile ?? null,
        fields.chatWorkspaceDir ?? null,
        fields.worktreeDir ?? null,
        fields.worktreeId ?? null,
        fields.title,
        "idle",
        now,
        now,
      );
    return this.get(id)!;
  }

  setArchived(id: string, at: string | null): void {
    this.db.prepare("UPDATE threads SET archived_at = ? WHERE id = ?").run(at, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM threads WHERE id = ?").run(id);
  }

  setStatus(id: string, status: Thread["status"]): void {
    this.db
      .prepare("UPDATE threads SET status = ?, last_activity_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  /** At boot, any persisted `running` thread is a ghost — the pi process that
   *  backed it died with the previous app session. Reap them to `failed` so
   *  `hasActiveRuns` (which gates skill/extension deletes and `pi update`)
   *  reflects live state rather than stale DB rows. Returns the reaped count
   *  for logging. */
  resetStaleRunning(): number {
    const result = this.db
      .prepare("UPDATE threads SET status = 'failed' WHERE status = 'running'")
      .run();
    return Number(result.changes);
  }

  /** Clear the "finished, unseen" accent when a thread is opened. Leaves
   *  last_activity_at untouched so opening doesn't reorder the list. */
  markSeen(id: string): void {
    this.db
      .prepare("UPDATE threads SET status = 'idle' WHERE id = ? AND status = 'completed'")
      .run(id);
    // Opening a woken thread clears the "woke from snooze" highlight.
    this.db
      .prepare("UPDATE threads SET woke_from_snooze_at = NULL WHERE id = ?")
      .run(id);
  }

  setTitle(id: string, title: string): void {
    this.db.prepare("UPDATE threads SET title = ? WHERE id = ?").run(title, id);
  }

  setTag(id: string, tag: ThreadTag): void {
    this.db.prepare("UPDATE threads SET tag = ? WHERE id = ?").run(tag, id);
  }

  setSessionFile(id: string, file: string): void {
    this.db.prepare("UPDATE threads SET pi_session_file = ? WHERE id = ?").run(file, id);
  }

  setWorktreeDir(id: string, dir: string | null): void {
    this.db.prepare("UPDATE threads SET worktree_dir = ? WHERE id = ?").run(dir, id);
  }

  /** Link a thread to a worktree record (and sync the denormalized dir).
   *  Passing null detaches it back to the project's main checkout. */
  setWorktree(id: string, worktreeId: string | null, dir: string | null): void {
    this.db
      .prepare("UPDATE threads SET worktree_id = ?, worktree_dir = ? WHERE id = ?")
      .run(worktreeId, dir, id);
  }

  get(id: string): Thread | null {
    const row = this.db.prepare("SELECT * FROM threads WHERE id = ?").get(id) as
      | ThreadRow
      | undefined;
    return row ? toThread(row) : null;
  }

  setSnoozedUntil(id: string, until: string | null): void {
    // Re-snoozing (or manual unsnooze) clears any prior wake highlight.
    this.db
      .prepare("UPDATE threads SET snoozed_until = ?, woke_from_snooze_at = NULL WHERE id = ?")
      .run(until, id);
  }

  setToTest(id: string, at: string | null, note: string | null): void {
    this.db.prepare("UPDATE threads SET to_test_at = ?, to_test_note = ? WHERE id = ?").run(at, note, id);
  }

  /** Threads whose snooze expired — auto-return to active (decision #5).
   *  `last_activity_at` is bumped to the wake time so a long-snoozed thread
   *  stays near the top of the active list after the transient
   *  `wokeFromSnoozeAt` pin is cleared on open; otherwise it would sink back
   *  to the bottom the moment the user clicks it (its pre-snooze activity is
   *  stale). */
  clearExpiredSnoozes(now: string): Thread[] {
    const rows = this.db
      .prepare("SELECT * FROM threads WHERE snoozed_until IS NOT NULL AND snoozed_until <= ?")
      .all(now) as unknown as ThreadRow[];
    this.db
      .prepare("UPDATE threads SET snoozed_until = NULL, woke_from_snooze_at = ?, last_activity_at = ? WHERE snoozed_until IS NOT NULL AND snoozed_until <= ?")
      .run(now, now, now);
    return rows.map((r) =>
      toThread({ ...r, snoozed_until: null, woke_from_snooze_at: now, last_activity_at: now }),
    );
  }
}

interface AutomationRow {
  id: string;
  name: string;
  cron: string;
  project_id: string | null;
  prompt: string;
  environment: string;
  enabled: number;
  last_fired_at: string | null;
  next_fire_at: string | null;
  created_at: string;
}

const toAutomation = (r: AutomationRow): Automation => ({
  id: r.id,
  name: r.name,
  cron: r.cron,
  projectId: r.project_id,
  prompt: r.prompt,
  environment: r.environment === "worktree" ? "worktree" : "local",
  enabled: r.enabled === 1,
  lastFiredAt: r.last_fired_at ?? undefined,
  nextFireAt: r.next_fire_at ?? undefined,
  createdAt: r.created_at,
});

export class AutomationRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  all(): Automation[] {
    const rows = this.db
      .prepare("SELECT * FROM automations ORDER BY created_at")
      .all() as unknown as AutomationRow[];
    return rows.map(toAutomation);
  }

  get(id: string): Automation | null {
    const row = this.db.prepare("SELECT * FROM automations WHERE id = ?").get(id) as
      | AutomationRow
      | undefined;
    return row ? toAutomation(row) : null;
  }

  insert(fields: {
    name: string;
    cron: string;
    projectId: string | null;
    prompt: string;
    environment: "local" | "worktree";
    nextFireAt: string | null;
  }): Automation {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO automations (id, name, cron, project_id, prompt, environment, enabled, next_fire_at, created_at) VALUES (?,?,?,?,?,?,1,?,?)",
      )
      .run(
        id,
        fields.name,
        fields.cron,
        fields.projectId,
        fields.prompt,
        fields.environment,
        fields.nextFireAt,
        now,
      );
    return this.get(id)!;
  }

  setEnabled(id: string, enabled: boolean, nextFireAt: string | null): void {
    this.db
      .prepare("UPDATE automations SET enabled = ?, next_fire_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, nextFireAt, id);
  }

  markFired(id: string, firedAt: string, nextFireAt: string | null): void {
    this.db
      .prepare("UPDATE automations SET last_fired_at = ?, next_fire_at = ? WHERE id = ?")
      .run(firedAt, nextFireAt, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM automations WHERE id = ?").run(id);
  }

  due(nowIso: string): Automation[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM automations WHERE enabled = 1 AND next_fire_at IS NOT NULL AND next_fire_at <= ?",
      )
      .all(nowIso) as unknown as AutomationRow[];
    return rows.map(toAutomation);
  }

  recordRun(automationId: string, threadId: string | null, firedAt: string): void {
    this.db
      .prepare("INSERT INTO automation_runs (id, automation_id, thread_id, fired_at) VALUES (?,?,?,?)")
      .run(randomUUID(), automationId, threadId, firedAt);
  }

  runs(automationId: string, limit = 20): AutomationRun[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY fired_at DESC LIMIT ?",
      )
      .all(automationId, limit) as unknown as Array<{
      id: string;
      automation_id: string;
      thread_id: string | null;
      fired_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      automationId: r.automation_id,
      threadId: r.thread_id,
      firedAt: r.fired_at,
    }));
  }
}

interface SideConversationRow {
  id: string;
  thread_id: string;
  title: string;
  model_provider: string | null;
  model_id: string | null;
  model_name: string | null;
  messages: string;
  created_at: string;
  updated_at: string;
}

const toSideConversation = (r: SideConversationRow): SideConversation => ({
  id: r.id,
  threadId: r.thread_id,
  title: r.title,
  model:
    r.model_provider && r.model_id
      ? { provider: r.model_provider, id: r.model_id, name: r.model_name ?? r.model_id }
      : null,
  messages: JSON.parse(r.messages) as SideMessage[],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class SideChatRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  create(threadId: string, model: ModelInfo | null): SideConversation {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO side_conversations (id, thread_id, title, model_provider, model_id, model_name, messages, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(id, threadId, "", model?.provider ?? null, model?.id ?? null, model?.name ?? null, "[]", now, now);
    return this.get(id)!;
  }

  get(id: string): SideConversation | null {
    const row = this.db.prepare("SELECT * FROM side_conversations WHERE id = ?").get(id) as
      | SideConversationRow
      | undefined;
    return row ? toSideConversation(row) : null;
  }

  listForThread(threadId: string): SideConversation[] {
    const rows = this.db
      .prepare("SELECT * FROM side_conversations WHERE thread_id = ? ORDER BY created_at DESC")
      .all(threadId) as unknown as SideConversationRow[];
    return rows.map(toSideConversation);
  }

  setMessages(id: string, messages: SideMessage[]): void {
    this.db
      .prepare("UPDATE side_conversations SET messages = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(messages), new Date().toISOString(), id);
  }

  setTitle(id: string, title: string): void {
    this.db.prepare("UPDATE side_conversations SET title = ? WHERE id = ?").run(title, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM side_conversations WHERE id = ?").run(id);
  }
}

export interface ConnectorRow {
  id: string;
  provider: string;
  label: string;
  auth_kind: "api_key" | "oauth";
  config_json: string;
  secret_blob: Uint8Array | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Persisted shape of an OAuth connector's non-secret config (`config_json`). */
export interface ConnectorOauthConfigRow {
  clientId: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePkce: boolean;
  useBasicAuth: boolean;
  /** Handshake + exchange run through the vendor broker (confidential
   *  providers). When true, clientId/secret are held server-side. */
  useBroker?: boolean;
}

/** Persisted encrypted-blob payload (decrypted by ConnectorService). */
export interface ConnectorSecretBlob {
  // api-key connectors: apiKey set, oauth fields absent.
  apiKey?: string;
  // OAuth connectors: clientSecret held once (BYO), plus the live token set.
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string;
}

export class ConnectorRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  all(): ConnectorRow[] {
    return this.db
      .prepare("SELECT * FROM connectors ORDER BY created_at")
      .all() as unknown as ConnectorRow[];
  }

  get(id: string): ConnectorRow | null {
    const row = this.db.prepare("SELECT * FROM connectors WHERE id = ?").get(id) as
      | ConnectorRow
      | undefined;
    return row ?? null;
  }

  insert(fields: {
    id: string;
    provider: string;
    label: string;
    authKind: "api_key" | "oauth";
    configJson: string;
    secretBlob: Uint8Array | null;
    expiresAt: string | null;
    now: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO connectors
           (id, provider, label, auth_kind, config_json, secret_blob, expires_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        fields.id,
        fields.provider,
        fields.label,
        fields.authKind,
        fields.configJson,
        fields.secretBlob ? Buffer.from(fields.secretBlob) : null,
        fields.expiresAt,
        fields.now,
        fields.now,
      );
  }

  updateSecret(
    id: string,
    secretBlob: Uint8Array | null,
    expiresAt: string | null,
    now: string,
  ): void {
    this.db
      .prepare(
        "UPDATE connectors SET secret_blob = ?, expires_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(secretBlob ? Buffer.from(secretBlob) : null, expiresAt, now, id);
  }

  updateConfig(
    id: string,
    configJson: string,
    now: string,
  ): void {
    this.db
      .prepare("UPDATE connectors SET config_json = ?, updated_at = ? WHERE id = ?")
      .run(configJson, now, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM connectors WHERE id = ?").run(id);
  }
}

export class KvRepo {
  private db: AppDb;
  constructor(db: AppDb) {
    this.db = db;
  }

  get<T>(key: string): T | null {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
}

export const defaultUiState: UiState = {
  sidebarWidth: 280,
  sidebarCollapsed: false,
  activeView: "new-thread",
  selectedThreadId: null,
  collapsedProjects: [],
  hudThreadId: null,
  hudPosition: null,
  hudAutoRevealOnFinish: false,
};

/** KV key for the configured "utility" model (background LLM tasks: titles/commits). */
export const UTILITY_MODEL_KV_KEY = "utility-model";

/** KV key for the auto-compaction thresholds. */
export const AUTO_COMPACT_KV_KEY = "auto-compact";
