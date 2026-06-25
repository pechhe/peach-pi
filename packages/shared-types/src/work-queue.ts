import type { TrackedIssue, IssueStatus } from "./entities.ts";

/** A tracker issue as fetched, before structure parsing or status derivation.
 *  `stateReason` mirrors GitHub's `state_reason` ("completed" | "not_planned"). */
export interface RawIssue {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  stateReason: string | null;
  labels: string[];
  body: string;
}

/** Whether a label set marks an issue as a PRD (single source of truth). */
export function isPrdLabels(labels: string[]): boolean {
  return labels.includes("prd");
}

/** A markdown body is a sequence of `## Section` blocks. Pull out the lines
 *  belonging to one named section (case-insensitive), excluding its header. */
function sectionLines(body: string, heading: string): string[] {
  const lines = body.split(/\r?\n/);
  const want = heading.trim().toLowerCase();
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const header = /^#{1,6}\s+(.*)$/.exec(line);
    if (header) {
      inSection = header[1]!.trim().toLowerCase() === want;
      continue;
    }
    if (inSection) out.push(line);
  }
  return out;
}

/** All `#<number>` issue references in a block of text, in order, de-duped. */
function issueRefs(lines: string[]): number[] {
  const seen = new Set<number>();
  for (const line of lines) {
    for (const m of line.matchAll(/#(\d+)\b/g)) seen.add(Number(m[1]));
  }
  return [...seen];
}

/** Parse the structured sections from an issue body. Pure — unit-tested. */
export function parseIssueBody(body: string): {
  parent: number | null;
  blockedBy: number[];
  acceptanceCriteria: string[];
} {
  const parentRefs = issueRefs(sectionLines(body, "Parent"));
  const blockedBy = issueRefs(sectionLines(body, "Blocked by"));
  const acceptanceCriteria = sectionLines(body, "Acceptance criteria")
    .map((l) => /^\s*[-*]\s*\[[ xX]\]\s*(.+?)\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]!);
  return { parent: parentRefs[0] ?? null, blockedBy, acceptanceCriteria };
}

/** An issue is `done` when closed as completed. A merged PR closes its issue
 *  as completed, so this also captures the "PR merged" case; issues closed as
 *  `not_planned` (duplicate / won't-do) are deliberately not treated as done. */
function isDone(raw: RawIssue): boolean {
  return raw.state === "closed" && raw.stateReason === "completed";
}

/** Parse + derive status for every issue against the full set (so blocker
 *  satisfaction can be resolved). Pure — unit-tested. */
export function enrichIssues(raw: RawIssue[]): TrackedIssue[] {
  const doneNumbers = new Set(raw.filter(isDone).map((r) => r.number));
  return raw.map((r) => {
    const { parent, blockedBy, acceptanceCriteria } = parseIssueBody(r.body);
    const done = doneNumbers.has(r.number);
    const unmetBlockers = blockedBy.filter((b) => !doneNumbers.has(b));
    const status: IssueStatus = done ? "done" : unmetBlockers.length === 0 ? "ready" : "blocked";
    return {
      number: r.number,
      title: r.title,
      url: r.url,
      state: r.state,
      labels: r.labels,
      isPrd: isPrdLabels(r.labels),
      parent,
      blockedBy,
      acceptanceCriteria,
      status,
      unmetBlockers,
    };
  });
}

/** A display group in the Work Queue: a PRD with its direct child issues, or
 *  the catch-all Unparented group (`prd` is null). `childless` flags a PRD with
 *  no children at all (needs breakdown). */
export interface WorkQueueGroup {
  prd: TrackedIssue | null;
  childless: boolean;
  issues: TrackedIssue[];
}

/** Group enriched issues for display: one group per PRD (listing its direct,
 *  not-done children) followed by an Unparented group of non-PRD issues with no
 *  PRD parent. Done issues are omitted from the displayed lists but still inform
 *  childless detection and blocker gating. Pure — unit-tested. */
export function groupWorkQueue(issues: TrackedIssue[]): WorkQueueGroup[] {
  const prds = issues.filter((i) => i.isPrd);
  const prdNumbers = new Set(prds.map((p) => p.number));
  const visible = (i: TrackedIssue) => i.status !== "done";

  const groups: WorkQueueGroup[] = prds
    .filter(visible)
    .sort((a, b) => a.number - b.number)
    .map((prd) => {
      const children = issues.filter((i) => i.parent === prd.number);
      return {
        prd,
        childless: children.length === 0,
        issues: children.filter(visible).sort((a, b) => a.number - b.number),
      };
    });

  const unparented = issues
    .filter((i) => !i.isPrd && (i.parent === null || !prdNumbers.has(i.parent)))
    .filter(visible)
    .sort((a, b) => a.number - b.number);
  if (unparented.length > 0) {
    groups.push({ prd: null, childless: false, issues: unparented });
  }
  return groups;
}
