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

export type NodeTone = "done" | "active" | "blocked" | "failed" | "cancelled" | "pending";

export interface TimelineNode {
  readonly id: string;
  readonly tone: NodeTone;
  readonly title: string;
  readonly fullTitle?: string;
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

/** Normalize a free-form activity string into a step label.
 *  No longer truncates to a fixed length: the card wraps long activity
 *  titles across multiple lines instead of clipping them mid-word. */
function shortenTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(/[…\.\s]+$/u, "");
}

const TOOL_ACTION_WORDS = [
  "reading",
  "running command",
  "editing",
  "writing",
  "searching",
  "finding files",
  "listing",
];

function isSingleToolActivity(s: string): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  for (const word of TOOL_ACTION_WORDS) {
    if (lower === word) return true;
    if (lower.startsWith(`${word} `)) {
      const rest = s.slice(word.length + 1).trim();
      if (/^\d+\s+(?:files?|patterns?)\b/i.test(rest)) return true;
    }
  }
  // Raw tool identifiers (snake_case / dotted) optionally with a count,
  // e.g. "cymbal_search", "cymbal_search 2 files", "web_search 3 patterns".
  // Requires an underscore so single prose words ("done", "found") never
  // get misclassified as tool churn.
  if (
    /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:\.[a-z0-9_]+)*\s*(?:\d+\s+(?:files?|patterns?))?$/i.test(s)
  ) {
    return true;
  }
  return false;
}

/** Detect tool-derived "grunt" activity lines the fleet widget rotates
 *  through (e.g. "reading 3 files…", "running command…", "cymbal_search…",
 *  and composites like "cymbal_search 4 files…, running command" where the
 *  extension joined several pending tools with ", "). These advance the
 *  agent's work but rarely say anything useful as a standalone timeline
 *  step, so the journey folds them in as a subtitle on the latest narration
 *  node instead.
 *
 *  Narration prose (assistant sentences like "Found X. Now let me…") is NOT
 *  matched here — those are the real milestones we keep as nodes. */
function isToolActivity(raw: string): boolean {
  const s = raw.replace(/…+$/u, "").trim();
  if (!s) return false;
  // Composite (comma-joined) tool activity emitted by the extension when
  // multiple tools are pending at once. Treat as churn only if EVERY part is
  // a tool activity on its own.
  const parts = s.split(/,\s+/);
  if (parts.length > 1) return parts.every(isSingleToolActivity);
  return isSingleToolActivity(s);
}

/** Set or replace the subtitle of the last node. Returns false if there's no
 *  suitable node to attach to (e.g. no nodes yet, or last is a tombstone). */
function attachAsSubtitle(nodes: TimelineNode[], subtitle: string): boolean {
  const n = nodes[nodes.length - 1];
  if (!n) return false;
  if (n.tone === "failed" || n.tone === "cancelled" || n.tone === "blocked") return false;
  nodes[nodes.length - 1] = { ...n, subtitle };
  return true;
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
  verbose = false,
): TimelineNode[] {
  // When verbose, keep every tool activity as its own step instead of folding
  // it into a subtitle — used by the expanded journey so the user sees all
  // steps that actually happened.
  const fold = !verbose;
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
  // Index of a first-spawn shimmer placeholder. Swapped out (same slot, but
  // a different node id) the instant the first real activity arrives, so
  // the crossfade transition reads as "shimmer → first title".
  let pendingShimmerIdx = -1;

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
      // While the entity is live and we've seen no activity yet, the first
      // spawn event renders as a shimmering placeholder rather than the
      // literal label "Spawned". As soon as the first real activity arrives
      // we rotate this slot into the activity title (see activity branch).
      if (first && ev.verb === "Spawn" && isLive) {
        pendingShimmerIdx = nodes.length;
        nodes.push({
          id: `${ev.callId}-pending`,
          tone: "pending",
          title: "",
          at: relAt(u.t),
        });
        prevCompleted = ev.status === "completed";
        continue;
      }
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
      // Skip generic placeholders from pi-subagents — they aren't useful steps.
      const raw = u.a.activity;
      if (/^(?:thinking|working)[.……]$/i.test(raw)) continue;
      // First real activity. If it's tool churn, fold it as a subtitle on
      // the shimmer slot and keep the shimmer pending — the first *narration*
      // line is what should become the first real title, not a tool status.
      if (fold && pendingShimmerIdx >= 0 && isToolActivity(raw)) {
        attachAsSubtitle(nodes, raw);
        continue;
      }
      if (pendingShimmerIdx >= 0) {
        nodes[pendingShimmerIdx] = {
          id: `act-${u.t}`,
          tone: "done",
          title: shortenTitle(raw),
          fullTitle: raw,
          at: relAt(u.t),
        };
        lastActivityIdx = pendingShimmerIdx;
        pendingShimmerIdx = -1;
      } else if (fold && isToolActivity(raw)) {
        // Tool churn (reading, running command, cymbal_search, …) is low
        // signal as a standalone step: fold it as a subtitle onto the
        // latest narration node rather than adding another timeline row.
        attachAsSubtitle(nodes, raw);
        lastActivityIdx = Math.max(lastActivityIdx, nodes.length - 1);
      } else {
        lastActivityIdx = nodes.length;
        nodes.push({ id: `act-${u.t}`, tone: "done", title: shortenTitle(raw), fullTitle: raw, at: relAt(u.t) });
      }
    }
  }

  // Tail: reflect the live / terminal state.
  if (isLive) {
    // While the shimmer placeholder still holds (no activity yet) it is the
    // live indicator too — nothing else to append.
    if (pendingShimmerIdx >= 0) {
      const cur = nodes[pendingShimmerIdx]!;
      nodes[pendingShimmerIdx] = { ...cur, tone: "pending", at: "Now" };
      return nodes;
    }
    const raw = liveActivity ?? "Working…";
    // Don't surface generic placeholders as a separate step, but always
    // surface an active node so the spinner has somewhere to live.
    const isPlaceholder = /^(?:thinking|working)/i.test(raw);
    const current = isPlaceholder ? "Working…" : shortenTitle(raw);
    // Tool churn as the live activity: fold it as a subtitle on the latest
    // narration node and mark that node active, instead of pushing a noisy
    // standalone row.
    if (fold && !isPlaceholder && isToolActivity(raw) && lastActivityIdx >= 0) {
      const n = nodes[lastActivityIdx]!;
      nodes[lastActivityIdx] = { ...n, tone: "active", at: "Now", subtitle: raw, fullTitle: n.fullTitle ?? n.title };
    } else if (lastActivityIdx >= 0 && nodes[lastActivityIdx]!.title === current) {
      const n = nodes[lastActivityIdx]!;
      nodes[lastActivityIdx] = { ...n, tone: "active", at: "Now", title: current, fullTitle: n.fullTitle ?? n.title };
    } else {
      nodes.push({ id: "act-now", tone: "active", title: current, fullTitle: raw, at: "Now" });
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
