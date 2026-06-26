import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  enrichIssues,
  mergedClosedIssues,
  openPrIssues,
  type CloseIssueResult,
  type RawIssue,
  type RawPull,
  type WorkQueueOpenCountResult,
  type WorkQueueResult,
} from "@peach-pi/shared-types";

/** Worktree record names of the form `issue-<n>` → the set of in-progress issue
 *  numbers. Non-matching names (e.g. "Worktree 2") are ignored. */
function inProgressFrom(worktreeNames: string[]): Set<number> {
  const nums = new Set<number>();
  for (const name of worktreeNames) {
    const m = /^issue-(\d+)$/.exec(name);
    if (m) nums.add(Number(m[1]));
  }
  return nums;
}

const run = promisify(execFile);

/** Parse a git remote (ssh or https) into a GitHub owner/repo. Returns null for
 *  non-GitHub hosts or unrecognised formats. Pure — unit-tested. */
export function parseGithubRepo(remote: string): { owner: string; repo: string } | null {
  const trimmed = remote.trim();
  // git@github.com:owner/repo(.git)
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
  // https://github.com/owner/repo(.git) — tolerates an embedded credential
  const https = /^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (https) return { owner: https[1]!, repo: https[2]! };
  return null;
}

/** Shape of a GitHub REST issue (the subset we read). PRs also appear on the
 *  issues endpoint and carry `pull_request`; those are filtered out. */
interface RestIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  state_reason: string | null;
  body: string | null;
  labels: Array<{ name: string } | string>;
  pull_request?: unknown;
}

/** Map a GitHub REST issue to a RawIssue, or null if it is actually a PR.
 *  Pure — unit-tested. */
export function mapRestIssue(raw: RestIssue): RawIssue | null {
  if (raw.pull_request) return null;
  return {
    number: raw.number,
    title: raw.title,
    url: raw.html_url,
    state: raw.state === "closed" ? "closed" : "open",
    stateReason: raw.state_reason ?? null,
    labels: raw.labels.map((l) => (typeof l === "string" ? l : l.name)),
    body: raw.body ?? "",
  };
}

/** Reads a project's tracker issues for the Work Queue view. GitHub only:
 *  prefers the `gh` CLI when present, otherwise the REST API with a token from
 *  the git credential helper. Fetches all issues (open + closed) so blocker
 *  satisfaction can be resolved, then enriches them (parse + status) in main.
 *  The renderer renders the returned snapshot via the typed `workQueue:list`
 *  contract. */
export class IssuesService {
  private getProjectPath: (projectId: string) => string | null;
  private getWorktreeNames: (projectId: string) => string[];

  constructor(
    getProjectPath: (projectId: string) => string | null,
    getWorktreeNames: (projectId: string) => string[] = () => [],
  ) {
    this.getProjectPath = getProjectPath;
    this.getWorktreeNames = getWorktreeNames;
  }

  async list(projectId: string): Promise<WorkQueueResult> {
    const cwd = this.getProjectPath(projectId);
    if (!cwd) return { ok: false, reason: "error", message: "Unknown project" };

    let remote: string;
    try {
      remote = (await run("git", ["remote", "get-url", "origin"], { cwd })).stdout.trim();
    } catch {
      return { ok: false, reason: "no-remote" };
    }

    const gh = parseGithubRepo(remote);
    if (!gh) return { ok: false, reason: "not-github" };

    try {
      const useGh = await ghAvailable();
      const [raw, pulls] = useGh
        ? await Promise.all([this.viaGh(gh, cwd), this.viaGhPulls(gh, cwd)])
        : await Promise.all([this.viaRest(gh), this.viaRestPulls(gh)]);
      const merged = mergedClosedIssues(pulls);
      const openPrs = openPrIssues(pulls);
      const inProgress = inProgressFrom(this.getWorktreeNames(projectId));
      return {
        ok: true,
        source: useGh ? "gh" : "rest",
        issues: enrichIssues(raw, { merged, inProgress, openPrs }),
      };
    } catch (e) {
      return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }

  private async viaGh(gh: { owner: string; repo: string }, cwd: string): Promise<RawIssue[]> {
    const { stdout } = await run(
      "gh",
      [
        "issue",
        "list",
        "--repo",
        `${gh.owner}/${gh.repo}`,
        "--state",
        "all",
        "--limit",
        "200",
        "--json",
        "number,title,url,state,stateReason,labels,body",
      ],
      { cwd, maxBuffer: 20 * 1024 * 1024 },
    );
    const rows = JSON.parse(stdout) as Array<{
      number: number;
      title: string;
      url: string;
      state: string;
      stateReason: string | null;
      labels: Array<{ name: string }>;
      body: string | null;
    }>;
    return rows.map((r) => ({
      number: r.number,
      title: r.title,
      url: r.url,
      state: r.state.toLowerCase() === "closed" ? "closed" : "open",
      stateReason: r.stateReason ?? null,
      labels: r.labels.map((l) => l.name),
      body: r.body ?? "",
    }));
  }

  private async viaGhPulls(gh: { owner: string; repo: string }, cwd: string): Promise<RawPull[]> {
    const { stdout } = await run(
      "gh",
      [
        "pr",
        "list",
        "--repo",
        `${gh.owner}/${gh.repo}`,
        "--state",
        "all",
        "--limit",
        "200",
        "--json",
        "body,headRefName,state,mergedAt",
      ],
      { cwd, maxBuffer: 20 * 1024 * 1024 },
    );
    const rows = JSON.parse(stdout) as Array<{
      body: string | null;
      headRefName: string;
      state: string;
      mergedAt: string | null;
    }>;
    return rows.map((r) => ({
      body: r.body ?? "",
      headRefName: r.headRefName,
      state: r.state.toLowerCase() === "closed" ? "closed" : "open",
      mergedAt: r.mergedAt,
    }));
  }

  private async viaRest(gh: { owner: string; repo: string }): Promise<RawIssue[]> {
    const token = await githubToken();
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "peach-pi",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/issues?state=all&per_page=100`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const raw = (await res.json()) as RestIssue[];
    return raw.map(mapRestIssue).filter((i): i is RawIssue => i !== null);
  }

  private async viaRestPulls(gh: { owner: string; repo: string }): Promise<RawPull[]> {
    const token = await githubToken();
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "peach-pi",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/pulls?state=all&per_page=100`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const raw = (await res.json()) as Array<{
      body: string | null;
      state: string;
      merged_at: string | null;
      head: { ref: string };
    }>;
    return raw.map((p) => ({
      body: p.body ?? "",
      headRefName: p.head.ref,
      state: p.state.toLowerCase() === "closed" ? "closed" : "open",
      mergedAt: p.merged_at,
    }));
  }

  /** Resolve owner/repo for a project's GitHub origin, or null if the project
   *  is unknown, has no origin, or origin is not a GitHub remote. */
  private async resolveGithub(
    projectId: string,
  ): Promise<{ owner: string; repo: string; cwd: string } | { ok: false; reason: "error"; message?: string }> {
    const cwd = this.getProjectPath(projectId);
    if (!cwd) return { ok: false, reason: "error", message: "Unknown project" };
    let remote: string;
    try {
      remote = (await run("git", ["remote", "get-url", "origin"], { cwd })).stdout.trim();
    } catch {
      return { ok: false, reason: "error", message: "No origin remote" };
    }
    const gh = parseGithubRepo(remote);
    if (!gh) return { ok: false, reason: "error", message: "Not a GitHub remote" };
    return { ...gh, cwd };
  }

  /** Close a tracker issue. Escape hatch for shipped-but-not-auto-closed
   *  issues: the primary path is `Closes #N` on a merged PR; this is for the
   *  long tail that slipped through. */
  async close(
    projectId: string,
    issueNumber: number,
    reason: "completed" | "not_planned",
  ): Promise<CloseIssueResult> {
    const gh = await this.resolveGithub(projectId);
    if ("ok" in gh) return gh;
    try {
      const useGh = await ghAvailable();
      if (useGh) {
        // gh CLI uses "not planned" (space); REST API uses "not_planned" (underscore).
        const ghReason = reason === "not_planned" ? "not planned" : reason;
        await run(
          "gh",
          ["issue", "close", String(issueNumber), "--repo", `${gh.owner}/${gh.repo}`, "--reason", ghReason],
          { cwd: gh.cwd },
        );
      } else {
        await restUpdateIssue(gh, issueNumber, { state: "closed", state_reason: reason });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Reopen a previously closed tracker issue. */
  async reopen(projectId: string, issueNumber: number): Promise<CloseIssueResult> {
    const gh = await this.resolveGithub(projectId);
    if ("ok" in gh) return gh;
    try {
      const useGh = await ghAvailable();
      if (useGh) {
        await run(
          "gh",
          ["issue", "reopen", String(issueNumber), "--repo", `${gh.owner}/${gh.repo}`],
          { cwd: gh.cwd },
        );
      } else {
        await restUpdateIssue(gh, issueNumber, { state: "open" });
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Count of OPEN issues for a project (the sidebar badge). Lightweight: no
   *  PR fetch, no enrichment — just `gh issue list --state open` (or the REST
   *  issues endpoint). Returns `{ ok: false, count: 0 }` for non-GitHub /
   *  no-remote projects. */
  async openCount(projectId: string): Promise<WorkQueueOpenCountResult> {
    const gh = await this.resolveGithub(projectId);
    if ("ok" in gh) return { ok: false, count: 0 };
    try {
      const useGh = await ghAvailable();
      if (useGh) {
        const { stdout } = await run(
          "gh",
          [
            "issue",
            "list",
            "--repo",
            `${gh.owner}/${gh.repo}`,
            "--state",
            "open",
            "--limit",
            "200",
            "--json",
            "number",
          ],
          { cwd: gh.cwd, maxBuffer: 20 * 1024 * 1024 },
        );
        return { ok: true, count: (JSON.parse(stdout) as unknown[]).length };
      }
      const token = await githubToken();
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "peach-pi",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/issues?state=open&per_page=100`;
      const res = await fetch(url, { headers });
      if (!res.ok) return { ok: false, count: 0 };
      const raw = (await res.json()) as Array<{ pull_request?: unknown }>;
      return { ok: true, count: raw.filter((i) => !i.pull_request).length };
    } catch {
      return { ok: false, count: 0 };
    }
  }
}

/** Whether the `gh` CLI is on PATH. */
async function ghAvailable(): Promise<boolean> {
  try {
    await run("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort GitHub token from the git credential helper. Returns null when
 *  unavailable; the REST call then proceeds unauthenticated (public repos). */
async function githubToken(): Promise<string | null> {
  try {
    const child = execFile("git", ["credential", "fill"]);
    child.stdin?.end("protocol=https\nhost=github.com\n\n");
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    await new Promise<void>((resolve) => child.on("close", () => resolve()));
    const m = /^password=(.+)$/m.exec(out);
    return m && m[1] ? m[1].trim() : null;
  } catch {
    return null;
  }
}

/** PATCH the issues endpoint to update state/state_reason (close/reopen).
 *  Used only when `gh` is unavailable. */
async function restUpdateIssue(
  gh: { owner: string; repo: string },
  issueNumber: number,
  patch: { state: "open" | "closed"; state_reason?: string },
): Promise<void> {
  const token = await githubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "peach-pi",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/issues/${issueNumber}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
}
