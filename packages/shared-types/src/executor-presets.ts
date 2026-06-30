// ─────────────────────────────────────────────────────────────────────────────
// Executor curated integration presets — the "Popular integrations" catalogue
// shown in the Connect dialog. Mirrors the curated preset arrays baked into the
// Executor web UI (extracted from the bundled binary, pinned in
// apps/desktop/scripts/fetch-executor.mjs — currently v1.5.25). Re-extract when
// bumping that pin: the lists live in the SPA's integrations index chunk.
//
// Selecting a preset opens Executor's signed-in add page at
// /integrations/add/<pluginKey>?preset=<id>&url=<url>, where Executor resolves
// the spec/endpoint and the user enters the credential. We never install or
// hold secrets ourselves.
// ─────────────────────────────────────────────────────────────────────────────

/** Executor plugin namespaces that back catalogue presets. */
export type ExecPluginKey = "openapi" | "mcp" | "graphql";

/** A curated catalogue entry in the Connect dialog. */
export interface ExecPreset {
  /** Executor plugin that installs this entry. */
  pluginKey: ExecPluginKey;
  /** Preset id Executor's add page resolves (e.g. "stripe", "github-rest"). */
  id: string;
  /** Display name. */
  name: string;
  /** One-line summary. */
  summary: string;
  /** Spec/endpoint URL passed to the add page (absent for stdio presets). */
  url?: string;
  /** Brand domain for the favicon (rendered via Google's favicon service). */
  domain?: string;
  /** Whether Executor flags this as a popular/featured preset. */
  featured?: boolean;
}

export const EXECUTOR_PRESETS: readonly ExecPreset[] = [
  { pluginKey: "openapi", id: "stripe", name: "Stripe", summary: "Payments, subscriptions, customers, and invoices.", url: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json", domain: "stripe.com", featured: true },
  { pluginKey: "openapi", id: "github-rest", name: "GitHub REST", summary: "Repos, issues, pull requests, actions, and users.", url: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json", domain: "github.com", featured: true },
  { pluginKey: "openapi", id: "vercel", name: "Vercel", summary: "Deployments, domains, projects, and edge config.", url: "https://openapi.vercel.sh", domain: "vercel.com", featured: true },
  { pluginKey: "openapi", id: "cloudflare", name: "Cloudflare", summary: "DNS, workers, pages, R2, and security rules.", url: "https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json", domain: "cloudflare.com", featured: true },
  { pluginKey: "openapi", id: "neon", name: "Neon", summary: "Serverless Postgres: projects, branches, and endpoints.", url: "https://neon.tech/api_spec/release/v2.json", domain: "neon.tech", featured: true },
  { pluginKey: "openapi", id: "openai", name: "OpenAI", summary: "Models, files, responses, and fine-tuning.", url: "https://app.stainless.com/api/spec/documented/openai/openapi.documented.yml", domain: "openai.com", featured: true },
  { pluginKey: "openapi", id: "sentry", name: "Sentry", summary: "Error tracking, performance monitoring, and releases.", url: "https://raw.githubusercontent.com/getsentry/sentry-api-schema/main/openapi-derefed.json", domain: "sentry.io", featured: true },
  { pluginKey: "openapi", id: "posthog", name: "PostHog", summary: "Product analytics, events, feature flags, and insights.", url: "https://us.posthog.com/api/schema/", domain: "posthog.com", featured: true },
  { pluginKey: "openapi", id: "exa", name: "Exa", summary: "Web search, similar links, content retrieval, and answers.", url: "https://raw.githubusercontent.com/exa-labs/openapi-spec/refs/heads/master/exa-openapi-spec.yaml", domain: "exa.ai", featured: true },
  { pluginKey: "openapi", id: "exa-websets", name: "Exa Websets", summary: "Websets, enrichments, webhooks, and monitors.", url: "https://raw.githubusercontent.com/exa-labs/openapi-spec/refs/heads/master/exa-websets-spec.yaml", domain: "exa.ai", featured: true },
  { pluginKey: "openapi", id: "axiom", name: "Axiom", summary: "Log ingestion, querying, datasets, and monitors.", url: "https://axiom.co/docs/restapi/versions/v2.json", domain: "axiom.co" },
  { pluginKey: "openapi", id: "asana", name: "Asana", summary: "Tasks, projects, teams, and workspace management.", url: "https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/asana.com/1.0/openapi.yaml", domain: "asana.com" },
  { pluginKey: "openapi", id: "twilio", name: "Twilio", summary: "SMS, voice, video, and messaging APIs.", url: "https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json", domain: "twilio.com" },
  { pluginKey: "openapi", id: "digitalocean", name: "DigitalOcean", summary: "Droplets, Kubernetes, databases, and networking.", url: "https://raw.githubusercontent.com/digitalocean/openapi/main/specification/DigitalOcean-public.v2.yaml", domain: "digitalocean.com" },
  { pluginKey: "openapi", id: "petstore", name: "Petstore", summary: "Classic OpenAPI demo, no auth required.", url: "https://petstore3.swagger.io/api/v3/openapi.json", domain: "swagger.io" },
  { pluginKey: "openapi", id: "val-town", name: "Val Town", summary: "Vals, runs, blobs, and email/web endpoints.", url: "https://api.val.town/openapi.json", domain: "val.town" },
  { pluginKey: "openapi", id: "resend", name: "Resend", summary: "Transactional email sending and domain management.", url: "https://raw.githubusercontent.com/resend/resend-openapi/main/resend.yaml", domain: "resend.com" },
  { pluginKey: "openapi", id: "spotify", name: "Spotify", summary: "Tracks, albums, playlists, library, and playback.", url: "https://raw.githubusercontent.com/sonallux/spotify-web-api/refs/heads/main/official-spotify-open-api.yml", domain: "spotify.com" },
  { pluginKey: "graphql", id: "github-graphql", name: "GitHub GraphQL", summary: "Repos, issues, PRs, and users via GitHub's GraphQL API.", url: "https://api.github.com/graphql", domain: "github.com", featured: true },
  { pluginKey: "graphql", id: "gitlab", name: "GitLab", summary: "Projects, merge requests, pipelines, and users.", url: "https://gitlab.com/api/graphql", domain: "gitlab.com", featured: true },
  { pluginKey: "graphql", id: "linear", name: "Linear", summary: "Issues, projects, teams, and cycles.", url: "https://api.linear.app/graphql", domain: "linear.app", featured: true },
  { pluginKey: "graphql", id: "monday", name: "Monday.com", summary: "Boards, items, columns, and workspace automation.", url: "https://api.monday.com/v2", domain: "monday.com" },
  { pluginKey: "graphql", id: "anilist", name: "AniList", summary: "Anime and manga database  no auth required.", url: "https://graphql.anilist.co", domain: "anilist.co" },
  { pluginKey: "mcp", id: "emulate-mcp", name: "Emulate MCP", summary: "Deterministic MCP fixtures for validating native text and image content.", url: "https://emulators.dev/mcp/query/mcp?token=demo-token", domain: "emulators.dev" },
  { pluginKey: "mcp", id: "deepwiki", name: "DeepWiki", summary: "Search and read documentation from any GitHub repo.", url: "https://mcp.deepwiki.com/mcp", domain: "deepwiki.com", featured: true },
  { pluginKey: "mcp", id: "context7", name: "Context7", summary: "Up-to-date docs and code examples for any library.", url: "https://mcp.context7.com/mcp", domain: "context7.com", featured: true },
  { pluginKey: "mcp", id: "browserbase", name: "Browserbase", summary: "Cloud browser sessions for web scraping and automation.", url: "https://mcp.browserbase.com/mcp", domain: "browserbase.com", featured: true },
  { pluginKey: "mcp", id: "firecrawl", name: "Firecrawl", summary: "Crawl and scrape websites into structured data.", url: "https://mcp.firecrawl.dev/mcp", domain: "firecrawl.dev", featured: true },
  { pluginKey: "mcp", id: "neon", name: "Neon", summary: "Serverless Postgres  branches, queries, and management.", url: "https://mcp.neon.tech/mcp", domain: "neon.tech", featured: true },
  { pluginKey: "mcp", id: "axiom", name: "Axiom", summary: "Query, analyze, and monitor your logs and event data.", url: "https://mcp.axiom.co/mcp", domain: "axiom.co", featured: true },
  { pluginKey: "mcp", id: "stripe", name: "Stripe", summary: "Manage payments, subscriptions, and billing via MCP.", url: "https://mcp.stripe.com", domain: "stripe.com", featured: true },
  { pluginKey: "mcp", id: "linear", name: "Linear", summary: "Issues, projects, teams, and cycles via MCP.", url: "https://mcp.linear.app/mcp", domain: "linear.app", featured: true },
  { pluginKey: "mcp", id: "notion", name: "Notion", summary: "Databases, pages, blocks, and search via MCP.", url: "https://mcp.notion.com/mcp", domain: "notion.com", featured: true },
  { pluginKey: "mcp", id: "sentry", name: "Sentry", summary: "Error monitoring, issues, and performance data.", url: "https://mcp.sentry.dev/mcp", domain: "sentry.io" },
  { pluginKey: "mcp", id: "cloudflare", name: "Cloudflare", summary: "Workers, KV, D1, R2, and DNS management via MCP.", url: "https://mcp.cloudflare.com/mcp", domain: "cloudflare.com" },
  { pluginKey: "mcp", id: "chrome-devtools", name: "Chrome DevTools", summary: "Debug a live Chrome browser session via local stdio.", domain: "google.com", featured: true },
];
