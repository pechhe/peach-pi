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

/** A pull request as fetched, reduced to what links it to an issue and tells
 *  us whether it merged. `mergedAt` is null for never-merged PRs. */
export interface RawPull {
  body: string;
  headRefName: string;
  mergedAt: string | null;
}

/** Issue numbers closed by a *merged* PR — the only thing that satisfies a
 *  blocker. Linkage is detected from the PR body (`closes/fixes/resolves #N`)
 *  and from our branch convention (`agent/issue-<n>-…`). Pure — unit-tested. */
export function mergedClosedIssues(pulls: RawPull[]): Set<number> {
  const out = new Set<number>();
  for (const pr of pulls) {
    if (!pr.mergedAt) continue;
    for (const m of pr.body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) {
      out.add(Number(m[1]));
    }
    const b = /^agent\/issue-(\d+)-/.exec(pr.headRefName);
    if (b) out.add(Number(b[1]));
  }
  return out;
}

/** Parse + derive status for every issue against the full set (so blocker
 *  satisfaction can be resolved). A blocker is satisfied only when it is in
 *  `merged` (its PR merged) — an issue merely closed without a merged PR does
 *  not unblock its dependents. An issue's own `done` status means it is closed
 *  (resolved, hence not actionable). Pure — unit-tested. */
export function enrichIssues(
  raw: RawIssue[],
  opts: { merged?: ReadonlySet<number>; inProgress?: ReadonlySet<number> } = {},
): TrackedIssue[] {
  const merged = opts.merged ?? new Set<number>();
  const inProgressNumbers = opts.inProgress ?? new Set<number>();
  return raw.map((r) => {
    const { parent, blockedBy, acceptanceCriteria } = parseIssueBody(r.body);
    const done = r.state === "closed";
    const unmetBlockers = blockedBy.filter((b) => !merged.has(b));
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
      body: r.body,
      inProgress: inProgressNumbers.has(r.number),
    };
  });
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "issue";

/** The agent branch for an issue: `agent/issue-<n>-<slug>`. Pure. */
export function issueBranchName(number: number, title: string): string {
  return `agent/issue-${number}-${slugify(title)}`;
}

/** The worktree record name that links a worktree to its issue. Pure. */
export function issueWorktreeName(number: number): string {
  return `issue-${number}`;
}

/** PRD sections worth handing an implementing agent as standing context. */
const PRD_CONTEXT_SECTIONS = ["User Stories", "Implementation Decisions", "Testing Decisions"];

/** Pull the {@link PRD_CONTEXT_SECTIONS} out of a PRD body and re-render them
 *  as a markdown block. Empty/absent sections are skipped; returns "" when none
 *  are present. Pure — unit-tested. */
export function extractPrdContext(prdBody: string): string {
  return PRD_CONTEXT_SECTIONS.map((heading) => {
    const text = sectionLines(prdBody, heading).join("\n").trim();
    return text ? `### ${heading}\n${text}` : "";
  })
    .filter((s) => s !== "")
    .join("\n\n");
}

/** Build the seed prompt for an agent run: the issue body, the parent PRD's
 *  standing context (User Stories / Implementation Decisions / Testing
 *  Decisions) when launched on a child issue, the acceptance criteria as the
 *  definition of done, and the standing test+PR gate. An issue with no parent
 *  PRD gets only its own context. Pure — unit-tested. */
export function buildSeedPrompt(issue: TrackedIssue, parentPrd?: TrackedIssue | null): string {
  const prdContext = parentPrd ? extractPrdContext(parentPrd.body) : "";
  const prdBlock = prdContext
    ? `\n\n## Parent PRD #${parentPrd!.number}: ${parentPrd!.title}\n\n${prdContext}`
    : "";
  const dod =
    issue.acceptanceCriteria.length > 0
      ? `\n\n## Definition of done\n${issue.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}`
      : "";
  return (
    `You are implementing issue #${issue.number}: ${issue.title}.\n\n` +
    `${issue.body.trim()}${prdBlock}${dod}\n\n` +
    `When the work is complete, run the full test suite. Once it is green, ` +
    `open a pull request and then stop at the human gate for review — do not merge.`
  );
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
