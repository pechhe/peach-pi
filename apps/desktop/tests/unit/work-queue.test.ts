import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIssueBody,
  isPrdLabels,
  enrichIssues,
  groupWorkQueue,
  mergedClosedIssues,
  openPrIssues,
  extractPrdContext,
  issueBranchName,
  issueWorktreeName,
  buildSeedPrompt,
  type RawIssue,
} from "@peach-pi/shared-types";

// Real issue bodies (trimmed) captured from pechhe/peach-pi, used as fixtures.
const BODY_3 = `## Parent

#2

## What to build

Replace the existing ephemeral launcher overlay with a persistent HUD.

## Acceptance criteria

- [ ] ⌘⇧Space toggles the HUD
- [ ] The HUD does not hide on blur
`;

const BODY_16 = `## Parent

#1 (PRD: Make Loops First-Class) — this is the first manual slice of that PRD.

## Problem Statement

When I have a repo full of ready-for-agent issues...
`;

const BODY_18 = `## Parent

#16

## What to build

Extend the parser.

## Acceptance criteria

- [ ] Issues are grouped under their parent PRD
- [ ] A PRD with no child issues is visibly flagged

## Blocked by

- #17
`;

test("parseIssueBody: extracts parent, blocked-by and acceptance criteria", () => {
  assert.deepEqual(parseIssueBody(BODY_18), {
    parent: 16,
    blockedBy: [17],
    acceptanceCriteria: [
      "Issues are grouped under their parent PRD",
      "A PRD with no child issues is visibly flagged",
    ],
  });
});

test("parseIssueBody: parent header followed by '#1 (PRD ...)' resolves to 1", () => {
  assert.equal(parseIssueBody(BODY_16).parent, 1);
});

test("parseIssueBody: no blocked-by section yields empty list", () => {
  const parsed = parseIssueBody(BODY_3);
  assert.equal(parsed.parent, 2);
  assert.deepEqual(parsed.blockedBy, []);
  assert.equal(parsed.acceptanceCriteria.length, 2);
});

test("parseIssueBody: empty body is all-empty", () => {
  assert.deepEqual(parseIssueBody(""), {
    parent: null,
    blockedBy: [],
    acceptanceCriteria: [],
  });
});

test("isPrdLabels: only the prd label counts", () => {
  assert.equal(isPrdLabels(["prd", "ready-for-agent"]), true);
  assert.equal(isPrdLabels(["ready-for-agent"]), false);
});

// A small DAG mirroring the real structure: PRD #16 with slices #17→#18→#19,
// plus an unparented refactor issue #9.
function raw(over: Partial<RawIssue> & Pick<RawIssue, "number">): RawIssue {
  return {
    title: `Issue ${over.number}`,
    url: `https://github.com/o/r/issues/${over.number}`,
    state: "open",
    stateReason: null,
    labels: [],
    body: "",
    ...over,
  };
}

test("enrichIssues: a closed issue is done (resolved, not actionable)", () => {
  const issues = enrichIssues([
    raw({ number: 17, state: "closed", stateReason: "completed" }),
    raw({ number: 30, state: "closed", stateReason: "not_planned" }),
  ]);
  assert.equal(issues.find((i) => i.number === 17)!.status, "done");
  assert.equal(issues.find((i) => i.number === 30)!.status, "done");
});

test("enrichIssues: blocker satisfied only by a merged PR, not by closure", () => {
  // #17 open → #18 blocked.
  const open17 = enrichIssues([
    raw({ number: 17 }),
    raw({ number: 18, body: "## Blocked by\n\n- #17\n" }),
  ]);
  assert.equal(open17.find((i) => i.number === 18)!.status, "blocked");

  // #17 closed WITHOUT a merged PR → #18 stays blocked (does not unblock).
  const closedUnmerged = enrichIssues([
    raw({ number: 17, state: "closed", stateReason: "completed" }),
    raw({ number: 18, body: "## Blocked by\n\n- #17\n" }),
  ]);
  const i18 = closedUnmerged.find((i) => i.number === 18)!;
  assert.equal(i18.status, "blocked");
  assert.deepEqual(i18.unmetBlockers, [17]);

  // #17's PR merged → #18 flips to ready.
  const merged17 = enrichIssues(
    [
      raw({ number: 17, state: "closed", stateReason: "completed" }),
      raw({ number: 18, body: "## Blocked by\n\n- #17\n" }),
    ],
    { merged: new Set([17]) },
  );
  const ready18 = merged17.find((i) => i.number === 18)!;
  assert.equal(ready18.status, "ready");
  assert.deepEqual(ready18.unmetBlockers, []);
});

test("mergedClosedIssues: links via PR body keywords and branch convention", () => {
  const set = mergedClosedIssues([
    { body: "This closes #17 and fixes #5.", headRefName: "feature/x", state: "closed", mergedAt: "2026-01-01" },
    { body: "no keyword here", headRefName: "agent/issue-19-start-agent", state: "closed", mergedAt: "2026-01-02" },
    { body: "resolves #99", headRefName: "agent/issue-99-x", state: "open", mergedAt: null }, // not merged
  ]);
  assert.deepEqual([...set].sort((a, b) => a - b), [5, 17, 19]);
});

test("openPrIssues: links via PR body keywords and branch convention", () => {
  const set = openPrIssues([
    { body: "Closes #17.", headRefName: "feature/x", state: "open", mergedAt: null },
    { body: "no keyword here", headRefName: "agent/issue-19-start-agent", state: "open", mergedAt: null },
    { body: "resolves #99", headRefName: "agent/issue-99-x", state: "closed", mergedAt: "2026-01-02" }, // merged → not open
    { body: "fixes #5", headRefName: "agent/issue-5-x", state: "closed", mergedAt: null }, // closed-unmerged → not open
  ]);
  assert.deepEqual([...set].sort((a, b) => a - b), [17, 19]);
});

test("enrichIssues: hasOpenPr mirrors the openPrs set", () => {
  const issues = enrichIssues([raw({ number: 17 }), raw({ number: 18 }), raw({ number: 19 })], {
    openPrs: new Set([17, 19]),
  });
  assert.equal(issues.find((i) => i.number === 17)!.hasOpenPr, true);
  assert.equal(issues.find((i) => i.number === 18)!.hasOpenPr, false);
  assert.equal(issues.find((i) => i.number === 19)!.hasOpenPr, true);
});

test("enrichIssues: no blockers means ready", () => {
  const [i] = enrichIssues([raw({ number: 17 })]);
  assert.equal(i!.status, "ready");
});

test("groupWorkQueue: groups under PRD, lists Unparented, flags childless", () => {
  const issues = enrichIssues([
    raw({ number: 16, labels: ["prd"], body: "## Parent\n\n#1\n" }),
    raw({ number: 17, body: "## Parent\n\n#16\n" }),
    raw({ number: 18, body: "## Parent\n\n#16\n\n## Blocked by\n\n- #17\n" }),
    raw({ number: 40, labels: ["prd"] }), // PRD with no children
    raw({ number: 9 }), // unparented refactor issue
  ]);
  const groups = groupWorkQueue(issues);

  const prd16 = groups.find((g) => g.prd?.number === 16)!;
  assert.deepEqual(
    prd16.issues.map((i) => i.number),
    [17, 18],
  );
  assert.equal(prd16.childless, false);

  const prd40 = groups.find((g) => g.prd?.number === 40)!;
  assert.equal(prd40.childless, true);

  const unparented = groups.find((g) => g.prd === null)!;
  assert.deepEqual(
    unparented.issues.map((i) => i.number),
    [9],
  );
});

test("issueBranchName / issueWorktreeName: deterministic slugged identifiers", () => {
  assert.equal(
    issueBranchName(19, "One-click Start agent (gated!)"),
    "agent/issue-19-one-click-start-agent-gated",
  );
  assert.equal(issueWorktreeName(19), "issue-19");
});

test("enrichIssues: marks in-progress issues from the worktree set", () => {
  const issues = enrichIssues([raw({ number: 17 }), raw({ number: 18 })], {
    inProgress: new Set([17]),
  });
  assert.equal(issues.find((i) => i.number === 17)!.inProgress, true);
  assert.equal(issues.find((i) => i.number === 18)!.inProgress, false);
});

test("buildSeedPrompt: includes body + acceptance criteria + test/PR gate", () => {
  const [issue] = enrichIssues([
    raw({
      number: 19,
      title: "Start agent",
      body: "## What to build\n\nDo the thing.\n\n## Acceptance criteria\n\n- [ ] It works\n",
    }),
  ]);
  const seed = buildSeedPrompt(issue!);
  assert.match(seed, /issue #19: Start agent/);
  assert.match(seed, /Do the thing\./);
  assert.match(seed, /## Definition of done/);
  assert.match(seed, /- \[ \] It works/);
  assert.match(seed, /Closes #19/);
  assert.match(seed, /stop at the human gate/);
});

const PRD_BODY = `## Problem Statement

Some problem.

## User Stories

- As a user I want X.

## Implementation Decisions

- Use the typed IPC seam.

## Testing Decisions

- Cover the parser with unit tests.

## Out of Scope

- Everything else.
`;

test("extractPrdContext: pulls only the three context sections, in order", () => {
  const ctx = extractPrdContext(PRD_BODY);
  assert.match(ctx, /### User Stories\n- As a user I want X\./);
  assert.match(ctx, /### Implementation Decisions\n- Use the typed IPC seam\./);
  assert.match(ctx, /### Testing Decisions\n- Cover the parser with unit tests\./);
  // Non-context sections are excluded.
  assert.doesNotMatch(ctx, /Problem Statement|Out of Scope/);
});

test("extractPrdContext: empty when none of the sections are present", () => {
  assert.equal(extractPrdContext("## Problem Statement\n\nx\n"), "");
});

test("buildSeedPrompt: folds in parent PRD context when launched on a child", () => {
  const [child, prd] = enrichIssues([
    raw({ number: 17, title: "Slice", body: "## What to build\n\nBuild it.\n" }),
    raw({ number: 16, title: "Work Queue", labels: ["prd"], body: PRD_BODY }),
  ]);
  const seed = buildSeedPrompt(child!, prd!);
  assert.match(seed, /## Parent PRD #16: Work Queue/);
  assert.match(seed, /### User Stories/);
  assert.match(seed, /### Implementation Decisions/);
  assert.match(seed, /### Testing Decisions/);
  assert.match(seed, /Build it\./);
});

test("buildSeedPrompt: no parent PRD launches with only its own context", () => {
  const [child] = enrichIssues([raw({ number: 9, title: "Refactor", body: "Just do it.\n" })]);
  const withNull = buildSeedPrompt(child!, null);
  assert.equal(withNull, buildSeedPrompt(child!));
  assert.doesNotMatch(withNull, /Parent PRD/);
});

test("startAllReady selection: only ready, not-in-progress children of the PRD", () => {
  // Mirrors the server-side filter in workQueue:startAllReady.
  const issues = enrichIssues(
    [
      raw({ number: 16, labels: ["prd"] }),
      raw({ number: 17, body: "## Parent\n\n#16\n" }), // ready
      raw({ number: 18, body: "## Parent\n\n#16\n" }), // ready
      raw({ number: 19, body: "## Parent\n\n#16\n" }), // in-progress -> skip
      raw({ number: 20, body: "## Parent\n\n#16\n\n## Blocked by\n\n- #17\n" }), // blocked -> skip
      raw({ number: 9 }), // different parent -> skip
    ],
    { inProgress: new Set([19]) },
  );
  const ready = issues.filter(
    (i) => i.parent === 16 && i.status === "ready" && !i.inProgress,
  );
  assert.deepEqual(
    ready.map((i) => i.number),
    [17, 18],
  );
});

test("groupWorkQueue: done issues drop out of displayed lists", () => {
  const issues = enrichIssues([
    raw({ number: 16, labels: ["prd"] }),
    raw({ number: 17, state: "closed", stateReason: "completed", body: "## Parent\n\n#16\n" }),
    raw({ number: 18, body: "## Parent\n\n#16\n" }),
  ]);
  const prd16 = groupWorkQueue(issues).find((g) => g.prd?.number === 16)!;
  assert.deepEqual(
    prd16.issues.map((i) => i.number),
    [18],
  );
  // #17 still exists as a child, so the PRD is not flagged childless.
  assert.equal(prd16.childless, false);
});
