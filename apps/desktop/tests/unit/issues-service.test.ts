import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGithubRepo, mapRestIssue } from "../../electron/services/issues-service.ts";

test("parseGithubRepo: https remote", () => {
  assert.deepEqual(parseGithubRepo("https://github.com/pechhe/peach-pi.git"), {
    owner: "pechhe",
    repo: "peach-pi",
  });
});

test("parseGithubRepo: https remote without .git suffix", () => {
  assert.deepEqual(parseGithubRepo("https://github.com/pechhe/peach-pi"), {
    owner: "pechhe",
    repo: "peach-pi",
  });
});

test("parseGithubRepo: ssh remote", () => {
  assert.deepEqual(parseGithubRepo("git@github.com:pechhe/peach-pi.git"), {
    owner: "pechhe",
    repo: "peach-pi",
  });
});

test("parseGithubRepo: tolerates an embedded credential in https", () => {
  assert.deepEqual(parseGithubRepo("https://x-access-token:abc@github.com/o/r.git"), {
    owner: "o",
    repo: "r",
  });
});

test("parseGithubRepo: non-GitHub host returns null", () => {
  assert.equal(parseGithubRepo("git@gitlab.com:o/r.git"), null);
  assert.equal(parseGithubRepo("https://gitlab.com/o/r.git"), null);
});

test("parseGithubRepo: garbage returns null", () => {
  assert.equal(parseGithubRepo("not a url"), null);
});

test("mapRestIssue: maps fields and normalises labels", () => {
  const mapped = mapRestIssue({
    number: 7,
    title: "HUD finish-cue routing",
    html_url: "https://github.com/pechhe/peach-pi/issues/7",
    state: "open",
    labels: [{ name: "ready-for-agent" }, "prd"],
  });
  assert.deepEqual(mapped, {
    number: 7,
    title: "HUD finish-cue routing",
    url: "https://github.com/pechhe/peach-pi/issues/7",
    state: "open",
    labels: ["ready-for-agent", "prd"],
  });
});

test("mapRestIssue: filters out pull requests", () => {
  const mapped = mapRestIssue({
    number: 99,
    title: "a PR",
    html_url: "https://github.com/pechhe/peach-pi/pull/99",
    state: "open",
    labels: [],
    pull_request: { url: "..." },
  });
  assert.equal(mapped, null);
});
