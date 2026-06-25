import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { enrichIssues, type RawIssue, type WorkQueueResult } from "@peach-pi/shared-types";

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

  constructor(getProjectPath: (projectId: string) => string | null) {
    this.getProjectPath = getProjectPath;
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
      const raw = useGh ? await this.viaGh(gh, cwd) : await this.viaRest(gh);
      return { ok: true, source: useGh ? "gh" : "rest", issues: enrichIssues(raw) };
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
