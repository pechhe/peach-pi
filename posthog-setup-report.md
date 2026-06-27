# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Peach Pi's Electron renderer. A new `captureEvent` helper was added to the existing `telemetry.ts` module, which already provided a consent-gated PostHog foundation. Thirteen business-critical events were wired into `Composer.svelte`, `App.svelte`, and `ImportThemeDialog.svelte` — covering message sending, model interactions, thread lifecycle, and theme imports. Environment variables `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` were written to `.env`. All events are guarded by the existing telemetry opt-in consent flow and contain no PII.

| Event | Description | File |
|---|---|---|
| `message_sent` | User submits a new prompt message to a thread. | `apps/desktop/src/app/Composer.svelte` |
| `message_steered` | User steers a currently-running agent session with a new message. | `apps/desktop/src/app/Composer.svelte` |
| `composer_mode_switched` | User toggles the composer between Build and Plan modes. | `apps/desktop/src/app/Composer.svelte` |
| `model_changed` | User selects a different AI model in the composer. | `apps/desktop/src/app/Composer.svelte` |
| `thinking_level_changed` | User adjusts the reasoning/thinking level for the current model. | `apps/desktop/src/app/Composer.svelte` |
| `slash_command_run` | User runs an extension or prompt slash command from the composer. | `apps/desktop/src/app/Composer.svelte` |
| `connection_pinned` | User pins an @-connection (custom HTTP or Composio toolkit) to a message. | `apps/desktop/src/app/Composer.svelte` |
| `side_chat_opened` | User opens the /btw side conversation panel. | `apps/desktop/src/app/Composer.svelte` |
| `file_attached` | User attaches one or more files to a composer message. | `apps/desktop/src/app/Composer.svelte` |
| `context_compacted` | User manually triggers context compaction on a thread. | `apps/desktop/src/app/Composer.svelte` |
| `thread_created` | User creates a new thread in a project. | `apps/desktop/src/app/App.svelte` |
| `thread_cloned` | User clones an existing thread into a new thread. | `apps/desktop/src/app/App.svelte` |
| `theme_imported` | User successfully imports a new theme via name, URL, or screenshot. | `apps/desktop/src/app/ImportThemeDialog.svelte` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://eu.posthog.com/project/210897/dashboard/777691)
- [Daily Active Users (wizard)](https://eu.posthog.com/project/210897/insights/cZ5ER0lO)
- [Messages Sent per Day (wizard)](https://eu.posthog.com/project/210897/insights/5yHGSEkG)
- [Thread Activity (wizard)](https://eu.posthog.com/project/210897/insights/jJ0P4Xvi)
- [Composer Mode Switches (wizard)](https://eu.posthog.com/project/210897/insights/xjIXaVcb)
- [Feature Usage (wizard)](https://eu.posthog.com/project/210897/insights/YX8urjN0)

## Verify before merging

- [ ] Run a full production build (`pnpm make` or `electron-forge package`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite (`pnpm test`) — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or equivalent) into your CI release workflow so production renderer stack traces de-minify in PostHog.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-python/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
