import { BrowserWindow, Notification } from "electron";
import { homedir } from "node:os";
import path from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  PORTABLE_PI_CONFIG_FILES,
  PORTABLE_PI_DIRS,
} from "@peach-pi/shared-types";
import { openDb } from "./persistence/db.ts";
import type { Emit } from "./ipc/registry.ts";
import { AppService } from "./services/app-service.ts";
import { ThreadService } from "./services/thread-service.ts";
import { AutomationService } from "./services/automation-service.ts";
import { TerminalService } from "./services/terminal-service.ts";
import { GitService } from "./services/git-service.ts";
import { SubagentService, setupSubagentEnvironment } from "./services/subagent-service.ts";
import { IssuesService } from "./services/issues-service.ts";
import { SideChatService } from "./services/side-chat-service.ts";
import { DevTapInstallService } from "./services/devtap-install-status.ts";
import { getPiSettings, setPiSettings } from "./services/pi-settings.ts";
import { InsomniaService } from "./services/insomnia.ts";
import { PiUpdateService } from "./services/pi-update-service.ts";
import { setDevTapStateProvider } from "./services/devtap-control.ts";
import { RecordingService } from "./services/recording-service.ts";
import { ConnectorService } from "./services/connector-service.ts";
import { BwsService } from "./services/bws-service.ts";
import { CustomConnectionService } from "./services/custom-connection-service.ts";
import { ConnectionSetupService } from "./services/connection-setup-service.ts";
import { McpService } from "./services/mcp-service.ts";
import { CuaDriverService } from "./services/cua-driver-service.ts";
import { AgentBrowserService } from "./services/agent-browser-service.ts";
import { UsageService } from "./services/usage/usage-service.ts";
import { ConnectorResolver } from "./services/connector-resolver.ts";
import { ensureConnectorExtension } from "./services/connector-extension.ts";
import { ensurePeachVisionConsentExtension } from "./services/peach-vision-consent-extension.ts";
import {
  RemoteHostService,
  RemoteClientService,
  recordCheckpoint,
  originUrl as originUrlOf,
  enableServe,
  listTailnetPeersDefault,
} from "./services/served-session/index.ts";
import { createHandoffService } from "./services/movable-execution/index.ts";

/**
 * Recursive directory listing used by the pi-config pull (ADR-0011): relative
 * posix paths under `root`, skipping node_modules/.cache/lockfiles so each
 * machine keeps its own regenerable install state. The relay blind-overwrites
 * the extensions/ + skills/ trees.
 */
async function collectTreeFiles(root: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
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

/** All constructed services + collaborators. The IPC table and HUD lifecycle
 *  read from this bag; `boot()` keeps the start/stop/teardown sequencing. */
export interface ServiceComposition {
  db: ReturnType<typeof openDb>;
  emit: Emit;
  appService: AppService;
  threadService: ThreadService;
  automationService: AutomationService;
  terminalService: TerminalService;
  recordingService: RecordingService;
  gitService: GitService;
  handoffService: ReturnType<typeof createHandoffService>;
  remoteHost: RemoteHostService;
  remoteClient: RemoteClientService;
  issuesService: IssuesService;
  piUpdateService: PiUpdateService;
  insomniaService: InsomniaService;
  subagentService: SubagentService;
  sideChatService: SideChatService;
  devTapInstallService: DevTapInstallService;
  connectorService: ConnectorService;
  bwsService: BwsService;
  customConnectionService: CustomConnectionService;
  connectionSetupService: ConnectionSetupService;
  mcpService: McpService;
  cuaDriverService: CuaDriverService;
  agentBrowserService: AgentBrowserService;
  usageService: UsageService;
  connectorResolver: ConnectorResolver;
  listTailnetPeersDefault: typeof listTailnetPeersDefault;
  enableServe: typeof enableServe;
  /** Refresh the App↔Thread cycle ownership predicate (used by boot's
   *  notification routing, which needs to know when the HUD owns finish cues). */
  setHudUpPredicate: (fn: () => boolean) => void;
  /** Show the main window (created lazily). Boot wires this to the
   *  HudLifecycle so the thread-finished notification click can surface the
   *  app without compose-services depending on the HUD module. */
  setShowMainWindow: (fn: () => void) => void;
}

/**
 * Construct every service + wire the App↔Thread / handoff / remote-host / config
 * collaborators. One-shot: the post-#26 wiring sequence (setGitService →
 * initAppCollaborator → setTeardownCollaborators → setHandoffService) is load-
 * bearing and `initAppCollaborator` throws on double-wire.
 *
 * `userData` is the Electron `app.getPath("userData")` root used for the sqlite
 * db + chats/worktrees dirs. The HUD-up predicate (handed back via
 * `setHudUpPredicate`) lets finish cues route to the HUD instead of a system
 * notification when the HUD is on screen.
 */
export function composeServices(userData: string, emit: Emit): ServiceComposition {
  const db = openDb(path.join(userData, "peach-pi.sqlite"));
  const appService = new AppService(db, emit);
  // Movable execution / remote-first mode (docs/remote-handoff.md). Distinct
  // from the ADR-0009 RemoteHostService below; shares the same kv db handle.
  // handoff-service now imports the typed `Emit` from shared-types (pure type,
  // no electron at runtime), so the typed emitter passes straight through —
  // no `as never` payload cast.
  const handoffService = createHandoffService(db, emit);
  setDevTapStateProvider(() => ({ app: appService.snapshot() }));

  // HUD-up predicate injected by boot() once the HudLifecycle is built, so the
  // thread-finished notification knows whether the HUD is owning finish cues.
  let hudUpPredicate: () => boolean = () => false;
  const setHudUpPredicate = (fn: () => boolean): void => {
    hudUpPredicate = fn;
  };
  // Show-main-window hook injected by boot(); the thread-finished notification
  // click surfaces the app. Kept as a callback so compose-services doesn't import
  // the HUD module (avoids a cycle: HudLifecycle takes AppService/ThreadService).
  let showMainWindowFn: () => void = () => undefined;
  const setShowMainWindow = (fn: () => void): void => {
    showMainWindowFn = fn;
  };

  const threadService = new ThreadService(
    db,
    emit,
    () => emit("event:snapshot", appService.snapshot()),
    path.join(userData, "chats"),
    (thread) => {
      // HUD up → route to the HUD as an ambient cue instead of a system
      // notification (the renderer decides pulse/expand/badge via routeFinishCue).
      if (hudUpPredicate()) {
        emit("event:hudFinish", { threadId: thread.id });
        return;
      }
      // Run finished while the app is in the background → notify (Phase 6).
      if (BrowserWindow.getFocusedWindow() || !Notification.isSupported()) return;
      const note = new Notification({
        title: thread.title || "Thread finished",
        body: "Run complete — click to open.",
        silent: true, // app has its own done sound
      });
      note.on("click", () => {
        showMainWindowFn();
        emit("event:focusThread", thread.id);
      });
      note.show();
    },
    () => appService.getUtilityModel(),
    () => appService.getAutoCompact(),
    (running) => {
      if (running) insomniaService.onRunStart();
      else {
        insomniaService.onRunEnd();
        // Flush any update queued while runs were active. Safe to call even
        // when no update is queued; piUpdateService re-checks hasActiveRuns.
        piUpdateService.onRunsIdle();
      }
    },
  );
  const automationService = new AutomationService(
    db,
    threadService,
    () => emit("event:snapshot", appService.snapshot()),
    async (projectId) => {
      const dir = await gitService.createWorktree(projectId);
      const wt = appService.addWorktree(projectId, dir);
      return { worktreeId: wt.id, worktreeDir: wt.dir };
    },
  );
  const terminalService = new TerminalService(db, emit);
  const recordingService = new RecordingService(emit);
  recordingService.setPrompter((threadId, text) =>
    threadService.prompt(threadId, text, [], "all"),
  );
  const gitService = new GitService(
    db,
    path.join(userData, "worktrees"),
    () => appService.getUtilityModel(),
  );
  // Sink the App↔Thread cycle into ThreadService (issue #15 / #26).
  // Order is load-bearing: gitService is set, then the AppThreadCollaborator
  // is wired (one-shot, throws on double-wire), then teardown collaborators
  // are sunk into AppService, then the handoff beforePrompt hook.
  threadService.setGitService(gitService);
  threadService.initAppCollaborator(appService);
  appService.setTeardownCollaborators({
    threadService,
    gitService,
  });
  threadService.setHandoffService({
    beforePrompt: async (threadId, task) => {
      const before = await handoffService.statusForThread(threadId);
      const after = await handoffService.ensureRemoteForThread(threadId, task);
      if (before.owner !== after.owner && after.owner === "remote") {
        return `handed off to ${after.remoteMachine ?? "remote"}`;
      }
      return null;
    },
  });

  // Remote session hosting (ADR-0009). The master relay taps the same
  // transcript flush the renderer gets; checkpoints fire on run-idle. Both
  // are off until a thread is served / a host is attached.
  const remoteHost: RemoteHostService = new RemoteHostService({
    transcript: (threadId) => threadService.getTranscript(threadId),
    threads: () =>
      appService.snapshot().threads.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        projectId: t.projectId,
        archivedAt: t.archivedAt,
      })),
    threadCwd: (threadId) => gitService.cwdFor(threadId),
    projects: () =>
      appService
        .snapshot()
        .projects.filter((p) => !p.archivedAt)
        .map((p) => ({ id: p.id, name: p.name })),
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
    actions: {
      message: (threadId, text) => threadService.prompt(threadId, text),
      steer: (threadId, text) => threadService.steer(threadId, text),
      abort: (threadId) => threadService.abort(threadId),
      archiveThread: (threadId) => {
        threadService.archive(threadId);
        return Promise.resolve();
      },
      deleteQueued: (threadId, kind, index) =>
        kind === "steer"
          ? threadService.deleteSteer(threadId, index)
          : threadService.deleteFollowUp(threadId, index),
      createThread: async (projectId) => (await threadService.createThread(projectId)).id,
      createChat: async () => (await threadService.createChat()).id,
      gitCommitPush: (threadId, message) => gitService.commitPush(threadId, message),
      gitPr: (threadId) => gitService.createPr(threadId),
      gitMerge: (threadId) => gitService.mergeToLocal(threadId),
    },
  });
  void remoteHost.load();
  remoteHost.setHostHooks({
    enableServe,
    onStatusChange: () => emit("event:remoteHostStatus", undefined),
  });
  threadService.subscribe((frame) => {
    switch (frame.kind) {
      case "transcript":
        remoteHost.forwardTranscript(frame);
        break;
      case "status":
        remoteHost.forwardStatus(frame.threadId, frame.status);
        break;
      case "queue":
        remoteHost.forwardQueue(frame.threadId, frame.steering, frame.followUp);
        break;
      case "idle": {
        const { threadId, cwd } = frame;
        if (!cwd || !remoteHost.isActive() || !remoteHost.isServedThread(threadId)) return;
        void recordCheckpoint(cwd, threadId).then((ckpt) => {
          if (ckpt) remoteHost.forwardCheckpoint(threadId, ckpt.sha);
        });
        break;
      }
    }
  });
  const remoteClient = new RemoteClientService(
    emit,
    async (origin) => {
      for (const p of appService.snapshot().projects) {
        if ((await originUrlOf(p.path)) === origin) return p.path;
      }
      return null;
    },
    path.join(userData, "worktrees"),
  );
  appService.setRemoteThreadsProvider(() => remoteClient.remoteThreadsSnapshot());
  remoteClient.onChange = () => emit("event:snapshot", appService.snapshot());
  remoteClient.applySettings = async (settings) => {
    await setPiSettings(settings.piSettings);
    appService.setAutoCompact(settings.autoCompact);
    if (settings.utilityModel) {
      try {
        const known = (await import("@peach-pi/pi-client").then((m) => m.listAvailableModels()))
          .map((m) => `${m.provider}:${m.id}`);
        if (known.includes(`${settings.utilityModel.provider}:${settings.utilityModel.id}`)) {
          appService.setUtilityModel(settings.utilityModel);
        }
      } catch {
        // Model list unreadable — leave the local utility model untouched.
      }
    }
    emit("event:snapshot", appService.snapshot());
  };
  remoteClient.applyPiConfig = async (payload) => {
    const dir = path.join(homedir(), ".pi", "agent");
    await mkdir(dir, { recursive: true });
    for (const [name, contents] of Object.entries(payload)) {
      if (contents == null) continue;
      const dest = path.join(dir, name);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, contents, "utf8");
    }
  };
  void remoteClient.load().then(() => remoteClient.ensurePolling());
  remoteClient.clientIdentity = () => appService.getRemoteClientId();

  const subagentService = new SubagentService(db);
  const sideChatService = new SideChatService(db, emit, threadService, gitService);
  const devTapInstallService = new DevTapInstallService(db);
  const issuesService = new IssuesService(
    (id) => appService.snapshot().projects.find((p) => p.id === id)?.path ?? null,
    (id) =>
      appService.snapshot().worktrees
        .filter((w) => w.projectId === id && w.archivedAt == null)
        .map((w) => w.name),
  );
  const piUpdateService = new PiUpdateService(db, emit, () =>
    appService.snapshot().threads.some((t) => t.status === "running"),
    () => appService.snapshot().projects.map((p) => p.path),
    () => void threadService.reloadIdleSessions(),
  );
  setupSubagentEnvironment(userData);

  const insomniaService = new InsomniaService();
  void getPiSettings().then((s) => insomniaService.setEnabled(s.insomnia));

  const connectorService = new ConnectorService(emit);
  const bwsService = new BwsService(emit);
  const customConnectionService = new CustomConnectionService(emit);
  const connectionSetupService = new ConnectionSetupService(
    emit,
    () => appService.getUtilityModel(),
    customConnectionService,
  );
  const mcpService = new McpService();
  const cuaDriverService = new CuaDriverService();
  const agentBrowserService = new AgentBrowserService();
  const usageService = new UsageService(emit);
  void cuaDriverService.init();
  void (async () => {
    if (!(await agentBrowserService.state()).installed) {
      await agentBrowserService.install((channel, payload) => emit(channel, payload));
    }
  })();

  const connectorResolver = new ConnectorResolver(connectorService, customConnectionService, bwsService);
  void connectorResolver.start().then(() => connectorResolver.writeBootstrap());
  void ensureConnectorExtension();
  void ensurePeachVisionConsentExtension();

  return {
    db,
    emit,
    appService,
    threadService,
    automationService,
    terminalService,
    recordingService,
    gitService,
    handoffService,
    remoteHost,
    remoteClient,
    issuesService,
    piUpdateService,
    insomniaService,
    subagentService,
    sideChatService,
    devTapInstallService,
    connectorService,
    bwsService,
    customConnectionService,
    connectionSetupService,
    mcpService,
    cuaDriverService,
    agentBrowserService,
    usageService,
    connectorResolver,
    listTailnetPeersDefault,
    enableServe,
    setHudUpPredicate,
    setShowMainWindow,
  };
}
