import { spawn, type ChildProcess } from "node:child_process";

/**
 * Native port of pi-insomnia (jvm/pi-mono, MIT). Prevents macOS idle sleep
 * while agent runs are active by holding a `caffeinate -i -w <pid>` assertion.
 *
 * Ref-counted across concurrent runs (acquire/release pairs) and gated by the
 * persisted `insomnia` PiSetting so the user can turn it on/off in Settings.
 * On non-macOS platforms it silently no-ops.
 */

const DEFAULT_CAFFEINATE_PATH = "/usr/bin/caffeinate";

export class MacSleepInhibitor {
  private readonly platform: NodeJS.Platform;
  private readonly pid: number;
  private readonly caffeinatePath: string;
  private child: ChildProcess | undefined;
  private activeRequests = 0;

  constructor(options: { platform?: NodeJS.Platform; pid?: number; caffeinatePath?: string } = {}) {
    this.platform = options.platform ?? process.platform;
    this.pid = options.pid ?? process.pid;
    this.caffeinatePath = options.caffeinatePath ?? DEFAULT_CAFFEINATE_PATH;
  }

  get isSupported(): boolean {
    return this.platform === "darwin";
  }

  get isActive(): boolean {
    return this.activeRequests > 0;
  }

  get isInhibiting(): boolean {
    return this.child !== undefined;
  }

  acquire(): boolean {
    if (!this.isSupported) return false;
    this.activeRequests += 1;
    this.start();
    return this.isInhibiting;
  }

  release(): void {
    if (!this.isSupported) return;
    if (this.activeRequests > 0) this.activeRequests -= 1;
    if (this.activeRequests === 0) this.stop();
  }

  forceStop(): void {
    this.activeRequests = 0;
    this.stop();
  }

  private start(): void {
    if (this.child) return;
    try {
      const child = spawn(this.caffeinatePath, ["-i", "-w", String(this.pid)], {
        stdio: "ignore",
      });
      this.child = child;
      child.once("error", () => {
        if (this.child === child) this.child = undefined;
      });
      child.once("exit", () => {
        if (this.child === child) this.child = undefined;
      });
      child.unref();
    } catch {
      this.child = undefined;
    }
  }

  private stop(): void {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    if (!child.killed) child.kill("SIGTERM");
  }
}

/**
 * Owns sleep-inhibition lifecycle for the whole app. Ref-counts across runs so
 * two concurrent threads share one assertion, and releases the moment the last
 * run goes idle. Toggling the setting off mid-run immediately tears the
 * assertion down (and stays down until re-enabled).
 */
export class InsomniaService {
  private inhibitor = new MacSleepInhibitor();
  private enabled = false;
  private activeRuns = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.inhibitor.forceStop();
  }

  onRunStart(): void {
    if (!this.enabled) return;
    this.activeRuns += 1;
    this.inhibitor.acquire();
  }

  onRunEnd(): void {
    if (this.activeRuns > 0) this.activeRuns -= 1;
    if (this.activeRuns === 0) this.inhibitor.release();
  }

  dispose(): void {
    this.inhibitor.forceStop();
  }
}
