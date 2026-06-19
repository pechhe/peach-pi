import { SvelteMap } from "svelte/reactivity";
import type { SubagentRow, SubagentStatus, TranscriptItem } from "@peach-pi/shared-types";
import type { FleetAgent } from "./fleet";

// ── Data model ──────────────────────────────────────────────────────────────
//
// An "agent entity" is the single persistent thing the user cares about. It is
// reconstructed by grouping every `subagent` / `subagent_resume` transcript
// item by agent *name*. The first launch for a name owns the entity; later
// launches (resume, or a fresh re-spawn after a stall) fold in as additional
// events on the same entity instead of spawning new cards.

type SubagentItem = Extract<TranscriptItem, { kind: "subagent" }>;

/** A single launch event (spawn or resume) on an agent entity. */
export interface AgentEvent extends SubagentRow {
  readonly callId: string;
  readonly createdAt: string;
  readonly verb: "Spawn" | "Resume";
}

export interface AgentEntity {
  readonly name: string;
  agent?: string;
  /** id of the launch that first introduced this name (owns the card). */
  readonly primaryCallId: string;
  readonly events: AgentEvent[];
}

/** Group every subagent launch in the transcript into one entity per name. */
export function collectAgents(items: readonly TranscriptItem[]): {
  entities: Map<string, AgentEntity>;
  primaryNamesByCall: Map<string, string[]>;
} {
  const entities = new Map<string, AgentEntity>();
  const primaryNamesByCall = new Map<string, string[]>();

  for (const item of items) {
    if (item.kind !== "subagent") continue;
    const sub = item as SubagentItem;
    const verb: AgentEvent["verb"] = sub.verb === "resume" ? "Resume" : "Spawn";
    for (const row of sub.rows) {
      const event: AgentEvent = { ...row, callId: sub.id, createdAt: sub.createdAt, verb };
      let entity = entities.get(row.name);
      if (!entity) {
        entity = { name: row.name, agent: row.agent, primaryCallId: sub.id, events: [] };
        entities.set(row.name, entity);
        const names = primaryNamesByCall.get(sub.id) ?? [];
        names.push(row.name);
        primaryNamesByCall.set(sub.id, names);
      }
      if (!entity.agent && row.agent) entity.agent = row.agent;
      entity.events.push(event);
    }
  }
  return { entities, primaryNamesByCall };
}

// ── Live activity log (client-side, ephemeral) ────────────────────────────────
//
// The fleet widget only reports the *current* activity. To draw the journey we
// record each distinct activity string with the time we first saw it, keyed by
// agent name, in a reactive map that survives card remounts within a session.

interface ActivityEntry {
  readonly activity: string;
  readonly at: number;
}

class ActivityLog {
  private byName = new SvelteMap<string, ActivityEntry[]>();

  /** Append `activity` for `name` if it differs from the last recorded one. */
  record(name: string, activity: string | undefined): void {
    if (!activity) return;
    const log = this.byName.get(name) ?? [];
    if (log[log.length - 1]?.activity === activity) return;
    this.byName.set(name, [...log, { activity, at: Date.now() }]);
  }

  logFor(name: string): ActivityEntry[] {
    return this.byName.get(name) ?? [];
  }
}

export const activityLog = new ActivityLog();

// ── Node model ────────────────────────────────────────────────────────────────

export type NodeTone = "done" | "active" | "blocked" | "failed" | "cancelled";

export interface TimelineNode {
  readonly id: string;
  readonly tone: NodeTone;
  readonly title: string;
  readonly subtitle?: string;
  readonly at: string;
}

function formatRelativeTime(value: string): string {
  if (!value) return "";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function eventTime(ev: AgentEvent, seq: number): number {
  const t = Date.parse(ev.createdAt);
  return Number.isNaN(t) ? seq : t;
}

function relAt(t: number): string {
  const rel = formatRelativeTime(new Date(t).toISOString());
  return rel === "now" ? "Now" : rel === "" ? "" : `${rel} ago`;
}

/**
 * Build the ordered execution journey for an entity by merging launch events
 * with the recorded activity log, then classifying the tail by live state.
 */
export function buildNodes(
  entity: AgentEntity,
  log: ActivityEntry[],
  isLive: boolean,
  liveActivity?: string,
): TimelineNode[] {
  type U =
    | { t: number; kind: "event"; ev: AgentEvent }
    | { t: number; kind: "activity"; a: ActivityEntry };
  const merged: U[] = [];
  entity.events.forEach((ev, i) => merged.push({ t: eventTime(ev, i), kind: "event", ev }));
  log.forEach((a) => merged.push({ t: a.at, kind: "activity", a }));
  merged.sort((x, y) => x.t - y.t);

  const nodes: TimelineNode[] = [];
  let eventSeen = 0;
  let prevCompleted = false;
  let lastActivityIdx = -1;

  for (const u of merged) {
    if (u.kind === "event") {
      eventSeen += 1;
      const ev = u.ev;
      // A resume / re-spawn implies the prior thread paused. If it had not
      // cleanly completed, surface the pause as an explicit blocker node.
      if (eventSeen > 1 && !prevCompleted) {
        nodes.push({
          id: `${ev.callId}-block`,
          tone: "blocked",
          title: "Paused — awaiting input",
          at: relAt(u.t),
        });
      }
      const first = eventSeen === 1;
      const title = ev.verb === "Resume" ? "Resumed by user" : first ? "Spawned" : "Relaunched";
      const subtitle =
        ev.verb === "Resume"
          ? ev.task
            ? `“${ev.task}”`
            : undefined
          : first
            ? ev.task
            : ev.summary ?? ev.task;
      nodes.push({ id: `${ev.callId}-${eventSeen}`, tone: "done", title, subtitle, at: relAt(u.t) });
      prevCompleted = ev.status === "completed";
    } else {
      lastActivityIdx = nodes.length;
      nodes.push({ id: `act-${u.t}`, tone: "done", title: u.a.activity, at: relAt(u.t) });
    }
  }

  // Tail: reflect the live / terminal state.
  if (isLive) {
    const raw = liveActivity ?? "Working…";
    // Don't surface generic placeholders as a separate step, but always
    // surface an active node so the spinner has somewhere to live.
    const current = /^(?:thinking|working)/i.test(raw) ? "Working…" : raw;
    if (lastActivityIdx >= 0 && nodes[lastActivityIdx]!.title === current) {
      nodes[lastActivityIdx] = { ...nodes[lastActivityIdx]!, tone: "active", at: "Now" };
    } else {
      nodes.push({ id: "act-now", tone: "active", title: current, at: "Now" });
    }
  } else {
    const last = entity.events[entity.events.length - 1];
    if (last && (last.status === "failed" || last.status === "cancelled")) {
      nodes.push({
        id: `${last.callId}-term`,
        tone: last.status,
        title: last.status === "failed" ? "Failed" : "Cancelled",
        subtitle: last.summary,
        at: relAt(eventTime(last, entity.events.length)),
      });
    } else if (last?.status === "completed") {
      nodes.push({
        id: `${last.callId}-done`,
        tone: "done",
        title: "Completed",
        subtitle: last.summary,
        at: relAt(eventTime(last, entity.events.length)),
      });
    }
  }
  return nodes;
}

/** Whether the entity's latest launch is still in flight given the live feed. */
export function isEntityLive(entity: AgentEntity, live: FleetAgent | undefined): boolean {
  const latest = entity.events[entity.events.length - 1]!;
  return (latest.status === "running" || latest.status === "started") && live !== undefined;
}

export function headState(entity: AgentEntity, isLive: boolean): SubagentStatus | "idle" {
  if (isLive) return "running";
  const status = entity.events[entity.events.length - 1]?.status;
  if (status === "failed" || status === "cancelled" || status === "completed") return status;
  return "idle";
}
