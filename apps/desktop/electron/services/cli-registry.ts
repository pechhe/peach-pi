/**
 * Static registry of the CLIs peach-pi can detect + help authenticate. These
 * are surfaced as a "CLIs" category in the Connections view; the agent uses
 * them through its normal shell tool + per-CLI skills (no generic `cli_run`).
 *
 * Adding a CLI = one entry here. Detection runs `versionCmd`; auth runs
 * `authCmd` and treats a clean exit (optionally matching `authedRegex`) as
 * logged-in. `loginCmd` is run in a Terminal window so interactive prompts
 * (gh) and browser-opening flows (vercel/fly/wrangler) both work.
 */
export interface CliDescriptor {
  /** Stable id (also the binary name probed on PATH). */
  id: string;
  /** Display name shown in the UI. */
  name: string;
  /** Args passed to the binary to read its version (stdout parsed). */
  versionArgs: string[];
  /** Pull a version out of the version command's stdout. */
  versionRegex: RegExp;
  /** Args for the auth-check command (e.g. `whoami`). */
  authArgs: string[];
  /** When set, stdout/stderr must match for the CLI to count as authed; when
   *  omitted, a zero exit code alone means authed. */
  authedRegex?: RegExp;
  /** The interactive login command line, run in a Terminal window. */
  loginCmd: string;
  /** Install hint shown when the binary is missing. */
  installHint: string;
  /** Docs URL for the row's link. */
  docsUrl: string;
}

export const KNOWN_CLIS: CliDescriptor[] = [
  {
    id: "vercel",
    name: "Vercel CLI",
    versionArgs: ["--version"],
    versionRegex: /([0-9]+\.[0-9]+\.[0-9]+)/,
    authArgs: ["whoami"],
    loginCmd: "vercel login",
    installHint: "npm i -g vercel",
    docsUrl: "https://vercel.com/docs/cli",
  },
  {
    id: "gh",
    name: "GitHub CLI",
    versionArgs: ["--version"],
    versionRegex: /([0-9]+\.[0-9]+\.[0-9]+)/,
    authArgs: ["auth", "status"],
    loginCmd: "gh auth login",
    installHint: "brew install gh",
    docsUrl: "https://cli.github.com",
  },
  {
    id: "fly",
    name: "Fly.io CLI",
    versionArgs: ["version"],
    versionRegex: /([0-9]+\.[0-9]+\.[0-9]+)/,
    authArgs: ["auth", "whoami"],
    loginCmd: "fly auth login",
    installHint: "brew install flyctl",
    docsUrl: "https://fly.io/docs/flyctl",
  },
  {
    id: "supabase",
    name: "Supabase CLI",
    versionArgs: ["--version"],
    versionRegex: /([0-9]+\.[0-9]+\.[0-9]+)/,
    authArgs: ["projects", "list"],
    loginCmd: "supabase login",
    installHint: "brew install supabase/tap/supabase",
    docsUrl: "https://supabase.com/docs/guides/cli",
  },
  {
    id: "wrangler",
    name: "Cloudflare Wrangler",
    versionArgs: ["--version"],
    versionRegex: /([0-9]+\.[0-9]+\.[0-9]+)/,
    authArgs: ["whoami"],
    authedRegex: /associated with the email|account/i,
    loginCmd: "wrangler login",
    installHint: "npm i -g wrangler",
    docsUrl: "https://developers.cloudflare.com/workers/wrangler",
  },
];
