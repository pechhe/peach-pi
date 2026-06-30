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
  /** Favicon/logo URL. */
  icon?: string;
  /** Whether Executor flags this as a popular/featured preset. */
  featured?: boolean;
}

export const EXECUTOR_PRESETS: readonly ExecPreset[] = [
  { pluginKey: "openapi", id: "stripe", name: "Stripe", summary: "Payments, subscriptions, customers, and invoices.", url: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json", icon: "https://stripe.com/favicon.ico", featured: true },
  { pluginKey: "openapi", id: "github-rest", name: "GitHub REST", summary: "Repos, issues, pull requests, actions, and users.", url: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json", icon: "https://svgl.app/library/github_dark.svg", featured: true },
  { pluginKey: "openapi", id: "vercel", name: "Vercel", summary: "Deployments, domains, projects, and edge config.", url: "https://openapi.vercel.sh", icon: "https://vercel.com/favicon.ico", featured: true },
  { pluginKey: "openapi", id: "cloudflare", name: "Cloudflare", summary: "DNS, workers, pages, R2, and security rules.", url: "https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json", icon: "https://cloudflare.com/favicon.ico", featured: true },
  { pluginKey: "openapi", id: "neon", name: "Neon", summary: "Serverless Postgres: projects, branches, and endpoints.", url: "https://neon.tech/api_spec/release/v2.json", icon: "https://neon.tech/favicon/favicon.ico", featured: true },
  { pluginKey: "openapi", id: "openai", name: "OpenAI", summary: "Models, files, responses, and fine-tuning.", url: "https://app.stainless.com/api/spec/documented/openai/openapi.documented.yml", icon: "https://svgl.app/library/openai_dark.svg", featured: true },
  { pluginKey: "openapi", id: "sentry", name: "Sentry", summary: "Error tracking, performance monitoring, and releases.", url: "https://raw.githubusercontent.com/getsentry/sentry-api-schema/main/openapi-derefed.json", icon: "https://svgl.app/library/sentry.svg", featured: true },
  { pluginKey: "openapi", id: "posthog", name: "PostHog", summary: "Product analytics, events, feature flags, and insights.", url: "https://us.posthog.com/api/schema/", icon: "https://svgl.app/library/posthog.svg", featured: true },
  { pluginKey: "openapi", id: "exa", name: "Exa", summary: "Web search, similar links, content retrieval, and answers.", url: "https://raw.githubusercontent.com/exa-labs/openapi-spec/refs/heads/master/exa-openapi-spec.yaml", icon: "https://exa.ai/images/favicon-32x32.png", featured: true },
  { pluginKey: "openapi", id: "exa-websets", name: "Exa Websets", summary: "Websets, enrichments, webhooks, and monitors.", url: "https://raw.githubusercontent.com/exa-labs/openapi-spec/refs/heads/master/exa-websets-spec.yaml", icon: "https://exa.ai/images/favicon-32x32.png", featured: true },
  { pluginKey: "openapi", id: "axiom", name: "Axiom", summary: "Log ingestion, querying, datasets, and monitors.", url: "https://axiom.co/docs/restapi/versions/v2.json", icon: "https://axiom.co/favicon.ico" },
  { pluginKey: "openapi", id: "asana", name: "Asana", summary: "Tasks, projects, teams, and workspace management.", url: "https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/asana.com/1.0/openapi.yaml", icon: "https://asana.com/favicon.ico" },
  { pluginKey: "openapi", id: "twilio", name: "Twilio", summary: "SMS, voice, video, and messaging APIs.", url: "https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json", icon: "https://twilio.com/favicon.ico" },
  { pluginKey: "openapi", id: "digitalocean", name: "DigitalOcean", summary: "Droplets, Kubernetes, databases, and networking.", url: "https://raw.githubusercontent.com/digitalocean/openapi/main/specification/DigitalOcean-public.v2.yaml", icon: "https://assets.digitalocean.com/favicon.ico" },
  { pluginKey: "openapi", id: "petstore", name: "Petstore", summary: "Classic OpenAPI demo, no auth required.", url: "https://petstore3.swagger.io/api/v3/openapi.json", icon: "https://petstore3.swagger.io/favicon-32x32.png" },
  { pluginKey: "openapi", id: "val-town", name: "Val Town", summary: "Vals, runs, blobs, and email/web endpoints.", url: "https://api.val.town/openapi.json", icon: "https://www.val.town/favicon.svg" },
  { pluginKey: "openapi", id: "resend", name: "Resend", summary: "Transactional email sending and domain management.", url: "https://raw.githubusercontent.com/resend/resend-openapi/main/resend.yaml", icon: "https://resend.com/static/favicons/favicon.ico" },
  { pluginKey: "openapi", id: "spotify", name: "Spotify", summary: "Tracks, albums, playlists, library, and playback.", url: "https://raw.githubusercontent.com/sonallux/spotify-web-api/refs/heads/main/official-spotify-open-api.yml", icon: "https://svgl.app/library/spotify.svg" },
  { pluginKey: "graphql", id: "github-graphql", name: "GitHub GraphQL", summary: "Repos, issues, PRs, and users via GitHub's GraphQL API.", url: "https://api.github.com/graphql", icon: "https://svgl.app/library/github_dark.svg", featured: true },
  { pluginKey: "graphql", id: "gitlab", name: "GitLab", summary: "Projects, merge requests, pipelines, and users.", url: "https://gitlab.com/api/graphql", icon: "https://gitlab.com/favicon.ico", featured: true },
  { pluginKey: "graphql", id: "linear", name: "Linear", summary: "Issues, projects, teams, and cycles.", url: "https://api.linear.app/graphql", icon: "https://linear.app/favicon.ico", featured: true },
  { pluginKey: "graphql", id: "monday", name: "Monday.com", summary: "Boards, items, columns, and workspace automation.", url: "https://api.monday.com/v2", icon: "https://monday.com/favicon.ico" },
  { pluginKey: "graphql", id: "anilist", name: "AniList", summary: "Anime and manga database  no auth required.", url: "https://graphql.anilist.co", icon: "https://anilist.co/img/icons/favicon-32x32.png" },
  { pluginKey: "mcp", id: "emulate-mcp", name: "Emulate MCP", summary: "Deterministic MCP fixtures for validating native text and image content.", url: "https://emulators.dev/mcp/query/mcp?token=demo-token", icon: "https://emulators.dev/favicon.ico" },
  { pluginKey: "mcp", id: "deepwiki", name: "DeepWiki", summary: "Search and read documentation from any GitHub repo.", url: "https://mcp.deepwiki.com/mcp", icon: "https://deepwiki.com/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "context7", name: "Context7", summary: "Up-to-date docs and code examples for any library.", url: "https://mcp.context7.com/mcp", icon: "https://context7.com/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "browserbase", name: "Browserbase", summary: "Cloud browser sessions for web scraping and automation.", url: "https://mcp.browserbase.com/mcp", icon: "https://www.browserbase.com/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "firecrawl", name: "Firecrawl", summary: "Crawl and scrape websites into structured data.", url: "https://mcp.firecrawl.dev/mcp", icon: "https://www.firecrawl.dev/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "neon", name: "Neon", summary: "Serverless Postgres  branches, queries, and management.", url: "https://mcp.neon.tech/mcp", icon: "https://neon.tech/favicon/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "axiom", name: "Axiom", summary: "Query, analyze, and monitor your logs and event data.", url: "https://mcp.axiom.co/mcp", icon: "https://axiom.co/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "stripe", name: "Stripe", summary: "Manage payments, subscriptions, and billing via MCP.", url: "https://mcp.stripe.com", icon: "https://stripe.com/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "linear", name: "Linear", summary: "Issues, projects, teams, and cycles via MCP.", url: "https://mcp.linear.app/mcp", icon: "https://linear.app/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "notion", name: "Notion", summary: "Databases, pages, blocks, and search via MCP.", url: "https://mcp.notion.com/mcp", icon: "https://www.notion.com/front-static/favicon.ico", featured: true },
  { pluginKey: "mcp", id: "sentry", name: "Sentry", summary: "Error monitoring, issues, and performance data.", url: "https://mcp.sentry.dev/mcp", icon: "https://svgl.app/library/sentry.svg" },
  { pluginKey: "mcp", id: "cloudflare", name: "Cloudflare", summary: "Workers, KV, D1, R2, and DNS management via MCP.", url: "https://mcp.cloudflare.com/mcp", icon: "https://cloudflare.com/favicon.ico" },
  { pluginKey: "mcp", id: "chrome-devtools", name: "Chrome DevTools", summary: "Debug a live Chrome browser session via local stdio.", icon: "https://www.google.com/chrome/static/images/favicons/favicon-32x32.png", featured: true },
];
