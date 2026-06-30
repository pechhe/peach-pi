/**
 * RemoteHost dependency-adapter factory (ADR-0012: the served-session seam owns
 * its own surface).
 *
 * The relay (`relay-host.ts`'s `RemoteHostService`) consumes a `RelayDeps` bag
 * — the anti-corruption glue that maps app + thread + git state onto what the
 * relay expects (transcript / threads / threadCwd / projects / settings /
 * piConfig / models / meta / actions). Constructing that bag is boot wiring
 * that used to sit inline in `compose-services.ts`; it lives here now so the
 * composition root just calls `makeRemoteHostDeps(svc)` and the relay glue
 * stays with the relay.
 *
 * The input is a structural slice of the three app services the adapter reads
 * from + the persisted-settings reader, so the factory is unit-testable
 * against fakes without booting Electron or the relay.
 */
import { homedir } from "node:os";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { PORTABLE_PI_CONFIG_FILES, PORTABLE_PI_DIRS } from "@peach-pi/shared-types";
import type {
  ProjectId,
  ThreadId,
  ModelInfo,
  ThinkingLevel,
  ImagePayload,
  GitCommitPushResult,
  GitPrResult,
  GitMergeResult,
  RemoteSettingsSnapshot,
  SessionMeta,
  TranscriptSnapshot,
} from "@peach-pi/shared-types";
import type { RelayDeps } from "./relay-host.ts";

/** Recursive directory listing used by the pi-config pull (ADR-0011): relative
 *  posix paths under `root`, skipping node_modules/.cache/lockfiles so each
 *  machine keeps its own regenerable install state. The relay blind-overwrites
 *  the extensions/ + skills/ trees. */
async function collectTreeFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // missing dir on this machine: nothing to serve
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".cache") continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.name === "package-lock.json") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, rel);
      else out.push(rel);
    }
  }
  await walk(root, "");
  return out;
}

/** The slice of `AppService` the adapter reads from. Structural so fakes suffice. */
export interface RemoteHostAppSlice {
  snapshot(): {
    threads: {
      id: ThreadId;
      title: string;
      status: string;
      projectId: ProjectId | null;
      archivedAt?: string;
      snoozedUntil?: string | null;
      toTestAt?: string | null;
      toTestNote?: string | null;
    }[];
    projects: {
      id: ProjectId;
      name: string;
      archivedAt?: string | null;
    }[];
    worktrees: {
      id: string;
      name: string;
      dir: string;
      projectId: ProjectId;
      archivedAt?: string | null;
    }[];
  };
  getAutoCompact(): RemoteSettingsSnapshot["autoCompact"];
  getUtilityModel(): RemoteSettingsSnapshot["utilityModel"];
  snoozeThread(threadId: ThreadId, until: string): void;
  unsnoozeThread(threadId: ThreadId): void;
  unmarkToTest(threadId: ThreadId): void;
}

/** The slice of `ThreadService` the adapter reads from / forwards to. */
export interface RemoteHostThreadSlice {
  getTranscript(threadId: ThreadId): Promise<TranscriptSnapshot>;
  getMeta(threadId: ThreadId): Promise<SessionMeta>;
  prompt(threadId: ThreadId, text: string, images: ImagePayload[]): Promise<void>;
  steer(threadId: ThreadId, text: string): Promise<void>;
  abort(threadId: ThreadId): Promise<void>;
  archive(threadId: ThreadId): void;
  markToTest(threadId: ThreadId): Promise<void>;
  deleteSteer(threadId: ThreadId, index: number): Promise<void>;
  deleteFollowUp(threadId: ThreadId, index: number): Promise<void>;
  setModel(threadId: ThreadId, provider: string, modelId: string): Promise<unknown>;
  setThinking(threadId: ThreadId, level: ThinkingLevel): Promise<unknown>;
  createThread(
    projectId: ProjectId,
    opts?: { worktreeId?: string; worktree?: boolean },
  ): Promise<{ id: ThreadId }>;
  createChat(): Promise<{ id: ThreadId }>;
}

/** The slice of `GitService` the adapter forwards write-path verbs to. */
export interface RemoteHostGitSlice {
  cwdFor(threadId: ThreadId): string | null;
  commitPush(threadId: ThreadId, message?: string): Promise<GitCommitPushResult>;
  createPr(threadId: ThreadId): Promise<GitPrResult>;
  mergeToLocal(threadId: ThreadId): Promise<GitMergeResult>;
}

/** Persisted-settings reader (from `pi-settings.ts`); injected so the factory
 *  stays free of the pi-settings module's IPC coupling for tests. */
export type RemoteHostSettingsReader = () => Promise<RemoteSettingsSnapshot["piSettings"]>;

/** Input to `makeRemoteHostDeps`: the three app-service slices the adapter
 *  reads from + the persisted-settings reader. Passed as one object so the
 *  composition-root call site reads `makeRemoteHostDeps({ ... })`. */
export interface RemoteHostDepsInput {
  appService: RemoteHostAppSlice;
  threadService: RemoteHostThreadSlice;
  gitService: RemoteHostGitSlice;
  getPiSettings: RemoteHostSettingsReader;
}

/** Build the `RelayDeps` bag for `RemoteHostService` from the app services.
 *  No behaviour of its own — pure mapping onto the relay's expected shape. */
export function makeRemoteHostDeps(svc: RemoteHostDepsInput): RelayDeps {
  const { appService, threadService, gitService, getPiSettings } = svc;
  return {
    transcript: (threadId) => threadService.getTranscript(threadId),
    threads: () =>
      appService.snapshot().threads.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        projectId: t.projectId,
        archivedAt: t.archivedAt,
        snoozedUntil: t.snoozedUntil,
        toTestAt: t.toTestAt,
        toTestNote: t.toTestNote,
      })),
    threadCwd: (threadId) => gitService.cwdFor(threadId),
    projects: () => {
      const snap = appService.snapshot();
      return snap.projects
        .filter((p) => !p.archivedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          worktrees: snap.worktrees
            .filter((w) => w.projectId === p.id && !w.archivedAt)
            .map((w) => ({ id: w.id, name: w.name, dir: w.dir })),
        }));
    },
    settings: async () => ({
      piSettings: await getPiSettings(),
      autoCompact: appService.getAutoCompact(),
      utilityModel: appService.getUtilityModel(),
    }),
    piConfig: async () => {
      const dir = path.join(homedir(), ".pi", "agent");
      const out: Record<string, string | null> = {};
      for (const name of PORTABLE_PI_CONFIG_FILES) {
        try {
          out[name] = await readFile(path.join(dir, name), "utf8");
        } catch {
          out[name] = null;
        }
      }
      for (const sub of PORTABLE_PI_DIRS) {
        const root = path.join(dir, sub);
        const files = await collectTreeFiles(root);
        for (const rel of files) out[`${sub}/${rel}`] = await readFile(path.join(root, rel), "utf8");
      }
      return out;
    },
    models: async () => {
      const { listScopedModels } = await import("@peach-pi/pi-client");
      return listScopedModels();
    },
    meta: (threadId) => threadService.getMeta(threadId),
    actions: {
      message: async (threadId, text, opts) => {
        // Apply the mobile composer's per-send override before the prompt so
        //  it takes effect for THIS turn (mobile composer, ADR-0011).
        if (opts?.model) await threadService.setModel(threadId, opts.model.provider, opts.model.id);
        if (opts?.thinking) await threadService.setThinking(threadId, opts.thinking);
        await threadService.prompt(threadId, text, opts?.images ?? []);
      },
      steer: (threadId, text) => threadService.steer(threadId, text),
      abort: (threadId) => threadService.abort(threadId),
      archiveThread: (threadId) => {
        threadService.archive(threadId);
        return Promise.resolve();
      },
      snoozeThread: (threadId, until) => {
        appService.snoozeThread(threadId, until);
        return Promise.resolve();
      },
      unsnoozeThread: (threadId) => {
        appService.unsnoozeThread(threadId);
        return Promise.resolve();
      },
      markToTest: (threadId) => threadService.markToTest(threadId),
      unmarkToTest: (threadId) => {
        appService.unmarkToTest(threadId);
        return Promise.resolve();
      },
      deleteQueued: (threadId, kind, index) =>
        kind === "steer"
          ? threadService.deleteSteer(threadId, index)
          : threadService.deleteFollowUp(threadId, index),
      createThread: async (projectId, opts) =>
        (await threadService.createThread(projectId, opts)).id,
      createChat: async () => (await threadService.createChat()).id,
      gitCommitPush: (threadId, message) => gitService.commitPush(threadId, message),
      gitPr: (threadId) => gitService.createPr(threadId),
      gitMerge: (threadId) => gitService.mergeToLocal(threadId),
    },
  };
}

// `RelayDeps` (the relay's structural contract) is re-exported from
// relay-host.ts; the data types the adapter shapes onto come straight from
// shared-types, so the factory drags in no second module.
