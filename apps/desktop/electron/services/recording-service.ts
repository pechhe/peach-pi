/**
 * RecordingService — single owner of the live desktop recording session in the
 * main process. Wraps the pure capture logic from @peach-pi/record-replay and
 * pushes live state to the renderer via `event:recordingState`.
 *
 * The matching MCP server (`record-and-replay/src/server.ts`) reads/writes the
 * SAME `~/.pi/agent/recordings` + `skills/recorded` dirs, so a recording
 * started from the tray UI is visible to the agent's `stop_recording` /
 * `list_recordings` tools and vice versa.
 */

import { Tray, Menu, nativeImage } from "electron";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { shell } from "electron";
import type { Emit } from "../ipc/registry.ts";
import type { RecordingState, RecordingStopResult } from "@peach-pi/shared-types";

import {
  startCapture,
  stopCapture,
  killCapture,
  captureBinPath,
  type ActiveCapture,
} from "@peach-pi/record-replay/src/capture.ts";
import {
  defaultRoot,
  newRecordingId,
  readEvents,
  saveSkill,
  saveRecording,
  loadRecording,
  skillPath as skillPathFn,
} from "@peach-pi/record-replay/src/store.ts";
import { buildDigest, synthesisSystemPrompt } from "@peach-pi/record-replay/src/synthesize.ts";
import { extractNameFromFrontmatter } from "./recording-util.ts";

const ROOT = defaultRoot();

function idle(): RecordingState {
  return {
    status: "idle",
    recordingId: null,
    startedAt: null,
    eventCount: 0,
    message: null,
    skillPath: null,
  };
}

export class RecordingService {
  private emit: Emit;
  private active: ActiveCapture | null = null;
  private state: RecordingState = idle();
  private eventCount = 0;
  private tray: Tray | null = null;
  /** Set once when an active recording is swapped out for stop processing. */
  private pendingStopId: string | null = null;

  constructor(emit: Emit) {
    this.emit = emit;
  }

  /** Attach a tray icon with Start/Stop/Cancel + live status. */
  attachTray(tray: Tray): void {
    this.tray = tray;
    this.refreshTray();
  }

  private setState(patch: Partial<RecordingState>): void {
    this.state = { ...this.state, ...patch };
    this.emit("event:recordingState", this.state);
    this.refreshTray();
  }

  private refreshTray(): void {
    if (!this.tray) return;
    const s = this.state;
    const menu = Menu.buildFromTemplate([
      { label: this.trayTitle(), enabled: false },
      { type: "separator" },
      {
        label: "Start recording",
        enabled: s.status === "idle" || s.status === "error",
        click: () => this.start(),
      },
      {
        label: "Stop & synthesize",
        enabled: s.status === "recording",
        click: () => void this.stop(),
      },
      {
        label: "Cancel (discard)",
        enabled: s.status === "recording",
        click: () => this.cancel(),
      },
      { type: "separator" },
      { label: "Quit Peach Pi", role: "quit" },
    ]);
    this.tray.setContextMenu(menu);
    this.tray.setToolTip(this.trayTitle());
  }

  private trayTitle(): string {
    const s = this.state;
    if (s.status === "recording" && s.startedAt) {
      const secs = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000);
      return `● REC ${fmtDur(secs)} · ${this.eventCount} events`;
    }
    if (s.status === "error") return `Recorder: ${s.message ?? "error"}`;
    return "Peach Pi Recorder";
  }

  status(): RecordingState {
    return this.state;
  }

  start(): RecordingState {
    if (this.state.status === "recording") return this.state;

    const bin = captureBinPath();
    if (!existsSync(bin)) {
      this.setState({
        ...idle(),
        status: "error",
        message: `Capture binary not found at ${bin}. Run \`pnpm --filter peach-pi-record-replay build:native\`.`,
      });
      return this.state;
    }

    const id = newRecordingId();
    this.eventCount = 0;
    const cap = startCapture(ROOT, id, bin, (evt) => {
      // Count + surface permission/tap-failure notes.
      this.eventCount++;
      if (evt.type === "note") {
        const note = (evt.payload as { note?: string }).note ?? "";
        if (/PERMISSION_DENIED|TAP_FAILED/.test(note)) {
          this.setState({ status: "error", message: note });
        } else {
          this.setState({ eventCount: this.eventCount });
        }
        return;
      }
      // Throttle: only push state every few events to avoid IPC spam.
      if (this.eventCount % 5 === 0 || this.eventCount < 10) {
        this.setState({ eventCount: this.eventCount, status: "recording" });
      }
    });

    // Detect an immediate process exit (e.g. binary crashes on launch).
    if (cap.proc) {
      cap.proc.on("exit", (code) => {
        if (this.state.status === "recording" && code !== 0 && code !== null) {
          this.setState({
            status: "error",
            message: `Capture process exited (code ${code}). Permissions granted to Peach Pi?`,
          });
        }
      });
    }

    this.active = cap;
    const rec = loadRecording(ROOT, id);
    this.setState({
      status: "recording",
      recordingId: id,
      startedAt: rec?.startedAt ?? new Date().toISOString(),
      eventCount: 0,
      message: null,
      skillPath: null,
    });
    return this.state;
  }

  async stop(skillBody?: string): Promise<RecordingStopResult> {
    const id = this.state.recordingId;
    if (!id || !this.active) {
      throw new Error("No active recording to stop");
    }
    this.pendingStopId = id;
    killCapture(this.active);
    this.active = null;

    const { rec } = stopCapture(ROOT, id, "stop");
    const events = readEvents(ROOT, id).map((l) => JSON.parse(l));
    const digest = buildDigest(events);
    const durationMs = rec?.durationMs ?? 0;

    let savedSkillPath: string | null = null;
    if (skillBody) {
      const name = extractNameFromFrontmatter(skillBody) ?? id;
      savedSkillPath = saveSkill(ROOT, name, skillBody);
      if (rec) saveRecording(ROOT, { ...rec, skillPath: savedSkillPath, digest });
    }

    this.setState({ ...idle(), skillPath: savedSkillPath });
    this.pendingStopId = null;

    return {
      recordingId: id,
      eventCount: events.length,
      durationMs,
      digest,
      skillPath: savedSkillPath,
    };
  }

  cancel(): RecordingState {
    const id = this.state.recordingId;
    if (this.active) {
      killCapture(this.active);
      this.active = null;
    }
    if (id) stopCapture(ROOT, id, "cancel");
    this.eventCount = 0;
    this.setState(idle());
    return this.state;
  }

  revealSkill(path: string): void {
    if (existsSync(path)) void shell.showItemInFolder(path);
  }

  /** Build the synthesis prompt for the agent to author a skill (UI affordance). */
  synthesisPromptFor(id: string): string | null {
    const events = readEvents(ROOT, id).map((l) => JSON.parse(l));
    if (!events.length) return null;
    return synthesisSystemPrompt(buildDigest(events), id);
  }

  dispose(): void {
    if (this.active) killCapture(this.active);
    this.active = null;
  }
}

function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export { basename, nativeImage, skillPathFn };
