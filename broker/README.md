# peach-pi OAuth broker

A small Cloudflare Worker that holds OAuth `client_secret`s for **confidential**
providers (Notion, GitHub, Slack, Figma, Box, HubSpot, Intercom, Monday) so the
distributed desktop app never ships them. PKCE providers (Linear, Google,
Atlassian, Asana, Xero, Microsoft-365) don't need this — the app handles them
directly with a bundled `client_id`.

## Why

Confidential providers require a `client_secret` at the token endpoint and don't
support PKCE. A desktop app can't ship that secret safely (it's extractable).
The broker keeps the secret server-side and hands the app only the resulting
tokens, via a single-use pickup token.

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /start?provider&app_redirect&state` | Begin: 302 to provider consent (redirect_uri = this Worker's `/callback`). |
| `GET /callback?code&state` | Provider returns here. Exchanges code+secret → tokens, stores under a pickup, 302s to `app_redirect?code=<pickup>&state`. |
| `GET /pickup?token=<pickup>` | App redeems the single-use pickup for the token JSON. |
| `POST /refresh {provider, refresh_token}` | Refresh an access token (needs the secret). |

`app_redirect` is restricted to `peachpi://` and `http://localhost`/`127.0.0.1`
so the broker can't be used as an open relay.

## Deploy

```sh
cd broker
npm install
npx wrangler kv namespace create OAUTH   # paste the id into wrangler.toml
npx wrangler deploy
```

Set each provider's credentials as Worker secrets (uppercased provider, hyphens
→ underscores):

```sh
npx wrangler secret put NOTION_CLIENT_ID
npx wrangler secret put NOTION_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
# … per provider you enable
```

Register each provider's OAuth app with redirect URI:

```
https://<your-worker-domain>/callback
```

## Wire the app to it

Point the desktop app at the deployed Worker via env (non-secret):

```sh
PEACH_OAUTH_BROKER=https://<your-worker-domain>
```

When set, confidential providers become one-click in the catalog (no form, no
local secret). When unset, they fall back to the BYO form.
