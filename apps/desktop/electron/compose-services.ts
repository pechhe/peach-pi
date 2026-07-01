import { app, BrowserWindow, Notification } from "electron";
import { homedir } from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { openDb } from "./persistence/db.ts";
import type { Emit } from "./ipc/registry.ts";
import { AppService } from "./services/app-service.ts";
import { ThreadService } from "./services/thread-service.ts";
import { AutomationService } from "./services/automation-service.ts";
import { TerminalService } from "./services/terminal-service.ts";
import { GitService } from "./services/git-service.ts";
import { SubagentService, setupSubagentEnvironment } from "./services/subagent-service.ts";
import { IssuesService } from "./services/issues-service.ts";
import { WorkQueueService } from "./services/work-queue-service.ts";
import { SideChatService } from "./services/side-chat-service.ts";
import { DevTapInstallService } from "./services/devtap-install-status.ts";
import { FallowService } from "./services/fallow-service.ts";
import { getPiSettings, setPiSettings } from "./services/pi-settings.ts";
import { InsomniaService } from "./services/insomnia.ts";
import { PiUpdateService } from "./services/pi-update-service.ts";
import { AutoUpdateService, initMainSentry } from "./services/telemetry-service.ts";
import { setDevTapStateProvider, emitDevTapEvent } from "@devtap/electron";
import { RecordingService } from "./services/recording-service.ts";
import { ClipService } from "./services/clip-service.ts";
import { BwsService } from "./services/bws-service.ts";
import { CliService } from "./services/cli-service.ts";
import { McpService } from "./services/mcp-service.ts";
import { ExecutorService } from "./services/executor-service.ts";
import { ensureExecutorDaemon } from "./services/executor-daemon.ts";
import { CuaDriverService } from "./services/cua-driver-service.ts";
import { AgentBrowserService } from "./services/agent-browser-service.ts";
import { UsageService } from "./services/usage/usage-service.ts";
import { AuthService } from "./services/auth-service.ts";
import { BwsResolver } from "./services/bws-resolver.ts";
import { ensureBwsExtension } from "./services/bws-extension.ts";
import { ensureExecutorSkill } from "./services/executor-skill.ts";
import { ensurePeachVisionConsentExtension } from "./services/peach-vision-consent-extension.ts";
import {
  RemoteHostService,
  RemoteClientService,
  makeRemoteHostDeps,
  recordCheckpoint,
  originUrl as originUrlOf,
  enableServe,
  listTailnetPeersDefault,
} from "./services/served-session/index.ts";
import { createHandoffService } from "./services/movable-execution/index.ts";

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
  clipService: ClipService;
  gitService: GitService;
  handoffService: ReturnType<typeof createHandoffService>;
  remoteHost: RemoteHostService;
  remoteClient: RemoteClientService;
  issuesService: IssuesService;
  workQueueService: WorkQueueService;
  piUpdateService: PiUpdateService;
  autoUpdateService: AutoUpdateService;
  insomniaService: InsomniaService;
  subagentService: SubagentService;
  sideChatService: SideChatService;
  devTapInstallService: DevTapInstallService;
  fallowService: FallowService;
  bwsService: BwsService;
  cliService: CliService;
  mcpService: McpService;
  executorService: ExecutorService;
  cuaDriverService: CuaDriverService;
  agentBrowserService: AgentBrowserService;
  usageService: UsageService;
  authService: AuthService;
  bwsResolver: BwsResolver;
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
    () => appService.notify(),
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
    () => appService.notify(),
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
  const clipService = new ClipService(emit);
  clipService.setSender((threadId, text, images) =>
    threadService.prompt(threadId, text, images, "all"),
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
  // are off until a thread is served / a host is attached. The dependency
  // adapter (app+thread+git → relay shape) is built by the served-session
  // factory (ADR-0012: the seam owns its own surface).
  const remoteHost: RemoteHostService = new RemoteHostService(
    makeRemoteHostDeps({ appService, threadService, gitService, getPiSettings }),
  );
  // Auto-resume serving if the user had it on last run (persisted intent in
  // peach-remote-host.json). Hooks are set first (synchronously) so
  // onStatusChange fires during the auto-resumed setHostEnabled(true).
  void remoteHost.load().then(() => {
    if (!remoteHost.hostEnabledIntent()) return;
    // Auto-resume serving. If start() rejects (e.g. the Tailscale daemon
    // hasn't published the tailnet interface in the first second after boot),
    // intent stays persisted-true and the next launch tries again — surface
    // the failure rather than swallowing an unhandled rejection.
    void remoteHost.setHostEnabled(true).catch((err) => {
      emitDevTapEvent({
        area: "lifecycle",
        event: "remoteHost.autoResumeFailed",
        message: String(err),
      });
    });
  });
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
  remoteClient.onChange = () => appService.notify();
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
    appService.notify();
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
  const fallowService = new FallowService(db);
  const issuesService = new IssuesService(
    (id) => appService.snapshot().projects.find((p) => p.id === id)?.path ?? null,
    (id) =>
      appService.snapshot().worktrees
        .filter((w) => w.projectId === id && w.archivedAt == null)
        .map((w) => w.name),
  );
  const workQueueService = new WorkQueueService({
    emit,
    appService,
    threadService,
    gitService,
    issuesService,
  });
  const piUpdateService = new PiUpdateService(db, emit, () =>
    appService.snapshot().threads.some((t) => t.status === "running"),
    () => appService.snapshot().projects.map((p) => p.path),
    () => void threadService.reloadIdleSessions(),
  );
  const autoUpdateService = new AutoUpdateService(emit);
  setupSubagentEnvironment(userData);

  const insomniaService = new InsomniaService();
  void getPiSettings().then((s) => insomniaService.setEnabled(s.insomnia));
  // Init Sentry main if consent already granted. Revocation is rare; main
  // process Sentry can't be cleanly torn down per-launch, so a revoked user
  // is honored on next launch (no new crashes are sent once disabled).
  void getPiSettings().then((s) => initMainSentry(s.telemetryConsent));

  const bwsService = new BwsService(emit);
  const cliService = new CliService(emit);
  const mcpService = new McpService();
  // Register the bundled Executor as an MCP server. Absolute path: a
  // Finder-launched app has no shell PATH, so a bare `executor` won't resolve.
  // ensureExecutorDaemon runs the one app-owned daemon pinned to a stable scope
  // (and the one-time tenant migration); ensureExecutorServer then registers
  // its HTTP MCP endpoint — the `executor mcp` stdio bridge is broken (drops
  // the daemon MCP session), so we bypass it.
  const executorBin = app.isPackaged
    ? path.join(process.resourcesPath, "executor", "executor")
    : path.join(app.getAppPath(), "build", "executor", "executor");
  void (async () => {
    await ensureExecutorDaemon(executorBin);
    await mcpService.ensureExecutorServer();
  })();
  const executorService = new ExecutorService(executorBin, emit);
  const cuaDriverService = new CuaDriverService();
  const agentBrowserService = new AgentBrowserService();
  const usageService = new UsageService(emit);
  const authService = new AuthService(emit);
  void cuaDriverService.init();
  void (async () => {
    if (!(await agentBrowserService.state()).installed) {
      await agentBrowserService.install((channel, payload) => emit(channel, payload));
    }
  })();

  const bwsResolver = new BwsResolver(bwsService);
  void bwsResolver.start().then(() => bwsResolver.writeBootstrap());
  void ensureBwsExtension();
  void ensureExecutorSkill();
  void ensurePeachVisionConsentExtension();

  return {
    db,
    emit,
    appService,
    threadService,
    automationService,
    terminalService,
    recordingService,
    clipService,
    gitService,
    handoffService,
    remoteHost,
    remoteClient,
    issuesService,
    workQueueService,
    piUpdateService,
    autoUpdateService,
    insomniaService,
    subagentService,
    sideChatService,
    devTapInstallService,
    fallowService,
    bwsService,
    cliService,
    mcpService,
    executorService,
    cuaDriverService,
    agentBrowserService,
    usageService,
    authService,
    bwsResolver,
    listTailnetPeersDefault,
    enableServe,
    setHudUpPredicate,
    setShowMainWindow,
  };
}
