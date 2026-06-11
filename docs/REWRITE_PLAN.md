# peach-pi Rewrite Plan — Local-First macOS GUI for pi

Status: PLAN ONLY. No implementation until reviewed.
Source repo audited: `/Users/admin/Documents/2. coding projects.nosync/peche-pi` (~49k LOC TS/TSX).
Inputs: 3 codebase scout reports + pi.dev/docs/latest research brief (see `~/.pi/artifacts/scout/` and `~/.pi/artifacts/researcher/`).

---

## 1. Existing Repo Audit

### 1.1 Current app structure

pnpm workspace:

| Package | LOC | Role |
|---|---|---|
| `apps/desktop` | ~42k | Electron app (main + preload + React renderer) |
| `packages/pi-sdk-driver` | ~6.4k | Wrapper over `@earendil-works/pi-coding-agent` SDK |
| `packages/session-driver` | ~700 | Pure types: `SessionDriver` interface, events |
| `packages/catalogs` | ~90 | Near-empty interface package |
| `video` | 0 | Declared in workspace, does not exist on disk |

God files (acknowledged in repo's own PRD "Decompose God Files"):
- `electron/app-store.ts` — 3,755 LOC state machine, every feature adds a method
- `src/App.tsx` — 3,252 LOC, 43+ useState, 22+ useEffect
- `electron/main.ts` — 2,134 LOC, all init/IPC registration in one scope
- `pi-sdk-driver/session-supervisor.ts` — 2,291 LOC, pi-event→IPC bridge
- `pi-sdk-driver/runtime-supervisor.ts` — 1,103 LOC, models/skills/extensions
- `src/sidebar.tsx` 1,707 / `src/timeline-item.tsx` 1,411 / `src/surfaces/utility-surface.tsx` 856

### 1.2 Current UI architecture

- **React 19** (not Svelte). No router — view-state switch over `DesktopAppState.activeView`: `new-thread | kanban | settings | skills | extensions | automations | graph | composer-layout` (+ testing, agents inside `utility-surface.tsx`).
- All state lives in **Electron main** (`DesktopAppStore`); renderer is a thin viewer receiving snapshots + patches + transcript deltas over IPC. Good pattern, good coalescing (100ms debounce, rAF transcript batching).
- Timeline: `conversation-timeline.tsx` + `timeline-item.tsx` + `timeline-model.ts` — streaming reveal, collapsible thinking, tool cards, diffs, lightbox.
- ~15 well-factored hooks (keyboard shortcuts, global search, slash menu, scroll) — the *pattern* is good, just inconsistently applied.

### 1.3 Current Electron architecture

- electron-vite (3 targets) + **electron-builder** (not Forge): dmg/zip arm64, notarization, auto-update via GitHub releases, node-pty unpacked, Swift notification helper.
- Single BrowserWindow + `OverlayWindowManager` (PiP/2nd display) + integrated terminal (`TerminalService`, node-pty/xterm).
- Security: contextIsolation on, nodeIntegration off, contextBridge, URL protocol validation.

### 1.4 Typed IPC seam — **best part of the codebase**

- `desktop-ipc-seam.ts` (707 LOC): single contract registry — channel name, direction, kind (invoke/send/event), adapter group, optional validators. No Electron import → testable in plain node.
- `desktop-ipc-seam-main.ts` (55 LOC) registers handlers from contracts; `preload.ts` (32 LOC) generates `window.piApp` from the same map. ~200 channels, 14 adapter groups. No drift possible.

### 1.5 Current model/provider flow

- Models from pi's `ModelRegistry` (bundled catalog + `~/.pi/agent/models.json` + env keys).
- Auth: OAuth, API keys in pi's `auth.json`, env vars — managed via `RuntimeSupervisor`.
- Selector UI: 3 pinned slider slots + dropdown, search, hide-model, ⌘1-4, thinking-level dial. Good component.
- **Why confusing** (confirmed by audit):
  1. Two-tier filtering: `enabledModelPatterns` (visible) × `available` (authenticated) → phantom empty states.
  2. Dual global/project settings with different merge logic per field (`modelSettingsScopeMode`).
  3. No first-class "cheap/helper model" — smart-compact has its own `summaryModel`, subagents their own `model` field; concept is emergent, not unified.
  4. Custom provider wizard: 2-step, auto-discovery, hardcoded defaults.
  5. pi registry merge behaviour opaque/hard to debug.

### 1.6 Current extension bridge

- The app does **not** host extensions itself. pi-mono loads/executes them (`DefaultResourceLoader`, `SettingsManager`, `DefaultPackageManager`) inside the SDK running in Electron main. `session.bindExtensions({ uiContext, ... })` is the bridge point.
- Extension UI requests (`confirm/select/input/editor/questionnaire/status/widget/title/editorText/commandActivity/notify/terminalCustom` — 12 kinds) flow as `hostUiRequest` driver events → renderer `ExtensionDialog` / `QuestionnaireDialog` / widget state / terminal overlay.
- `terminal-custom-overlay.tsx` bridges pi's custom TUI components onto an xterm surface — this is the "terminal-backed extensions run natively" trick.
- **No permission system.** Extensions get whatever pi grants (i.e., everything). Diagnostics per extension exist; compatibility issues learned per workspace; reload via `refreshRuntime`.
- One bundled extension: `apps/desktop/extensions/chassis-reminder.ts` (hooks `before_agent_start` to inject sticky reminders; 11 unit tests).

### 1.7 Current persistence

Three overlapping layers, **no schema versioning, no migrations**:
- `packages/catalogs` — interface only (90 LOC).
- `pi-sdk-driver/json-catalog-store.ts` (404 LOC) — JSON files in `~/.pi/agent/catalogs/` for workspaces/sessions/worktrees.
- `app-store-persistence(.ts/-manager.ts)` — debounced full-state JSON to `~/Library/Application Support/peche-pi/` (filters transient fields). Sidebar/UI state persisted separately.
- Transcripts: pi-owned JSONL session files (`~/.pi/agent/sessions/...`) — source of truth, streamed to renderer as deltas.
- Misc: chassis state at `~/.pi/agent/chassis/state.json`, automations JSON in userData, sound settings in localStorage.

### 1.8 Current automation system

Small and clean (~250 LOC total):
- `automation-store.ts` — JSON file, CRUD, `markRan()` dedupe, skip-missed catch-up, cron generated from simplified schedule (hourly/daily/weekly/monthly + HH:MM).
- `automation-scheduler.ts` — 60s poll, re-entrancy guard, startup catch-up, `fireNow()`.
- Per-automation: prompt, workspace, environment, model, thinkingLevel, enabled.
- **No generic event-hook system** at app level (only pi's `before_agent_start` via extension).

### 1.9 Current testing setup

Mature, worth preserving wholesale:
- Lanes: `tests/core` (37 specs, background-safe), `live` (16, real providers), `native` (2, macOS surfaces), `production` (7, packaged app), `dev` (2), `unit` (node-run). Lane rules documented in `tests/AGENTS.md`.
- Shared helpers (`electron-app.ts`, `macos-ui.ts`, `notification-events.ts`).
- 16+ electron-side `node:test` unit tests (reducer, persistence, scheduler, chassis…).
- Minimal playwright.config (single worker, trace/video on failure).

### 1.10 Composer CSS + sound effects (hard-keep inventory)

**Components/logic** (12 files): `composer-panel.tsx`, `composer-surface.tsx`, `session-composer.tsx` (imperative handle, draft persistence, auto-grow), `composer-attachments.ts`, `composer-mode.ts` (plan/build prompt wrapping), `composer-mode-selector.tsx`, `composer-builtin-units.tsx`, `composer-layout.ts` (grid model, collision detection — pure TS), `composer-layout-renderer.tsx`, `composer-layout-editor.tsx`, `edit-layout-context.tsx`, `composer-commands.ts`, `chassis.ts` + `chassis-action-control.tsx`, `queued-composer-messages.tsx`.

**CSS**:
- `styles/composer-layout.css` + `styles/composer-layout-editor.css` (~350 LOC, clean, grid + editor)
- `styles/main.css` (~12,000 LOC; contains all `.composer*`, `.queued-composer*`, `.slash-menu*`, `.mention-menu*`, `.composer-mode*`, device-mode body classes `.composer-device--cream/--modular/--modular-metal`, plus unrelated timeline/environment styles)
- `styles/sidebar.css` (~2,000 LOC; includes `.done-burst*`, snooze/testing row styles)

**Sounds**: `src/sounds/{click,key-on,key-off,click_01}.mp3` inlined as data: URIs (`?inline`).
- `button-click-sound.ts` — WebAudio, preload, press/release phases, pitch variation, 5 sound categories → variants, settings in localStorage.
- `done-sound.ts` — pure WebAudio synthesis, 6 variants. `done-celebration.ts` — DOM burst effect.
- `use-button-sound.ts` — pointer-event hook.

**Behaviour**: 3 shelves above textarea (attachments, queued messages, screen) + footer row (hint, controls strip, send/stop, execute-plan). Enter send / queue-when-running, Shift+Enter newline, ⌘Enter steer, Esc abort, ⌘B/⌘P mode toggle. Send→Stop morph while running. Disabled until model selected on first run.

### 1.11 Snooze button — actual behaviour (inspected)

- `SnoozePicker` popover on thread rows in `sidebar.tsx` (hover-revealed icon). Amount + unit (hours/days) → sets `SessionRecord.snoozedUntil` (ISO) via `api.snoozeSession()`.
- Effect: thread moves out of active list into collapsible per-workspace "Snoozed" section (`thread-groups.ts` partition). Shows "Xh left". Manual unsnooze restores.
- **It is purely thread-list organization** — no notification, no reminder firing, no automation/run coupling. A "defer this thread" inbox-style gesture.

### 1.12 Thread testing button — actual behaviour (inspected)

- Eye icon on thread rows → sets `SessionRecord.toTestAt` (+ optional `toTestNote`) via `api.markToTestSession()`.
- Thread moves to collapsible "To Test" section; sidebar "Testing" nav item (⇧6) shows aggregate badge and a Testing view listing all marked threads across workspaces.
- **No test execution, no evaluation, no results** — it is a human review queue: "this thread's work needs manual testing." Unmark restores.

### 1.13 Other notable features found (not in the prompt)

- **Git environment widget**: per-thread Location (local vs worktree, ADR-0003 detached-first worktrees), branch, Changes → Workspace Review (diff/stage/undo), commit/push, **Ship**/Auto-ship (commit+push+PR+merge, conflict-resolver thread), `commit-push-service` + `pr-service`.
- **Kanban view**, **GH Loops** sidebar section, **Agents view** (subagent `.md` file manager), **global search** (⌘K), overlay/PiP window, integrated terminal, macOS notifications w/ Swift status helper, auto thread titles (LLM), navigation history, Homebrew release pipeline.

---

## 2. What to Keep

### Port nearly as-is (high value, low coupling)

| Item | Why |
|---|---|
| **IPC contract-registry pattern** (`desktop-ipc-seam*.ts`, generated preload) | Best architecture in repo. Re-implement same pattern, smaller. |
| **Composer pure-TS model layer**: `composer-layout.ts`, `composer-mode.ts`, `chassis.ts`, `composer-attachments.ts` (~90%) | Zero React dependency. Direct port. |
| **Sound system**: 4 mp3s + `button-click-sound.ts` + `done-sound.ts` + `done-celebration.ts` + category settings | Pure WebAudio/DOM. Drop-in. Hard requirement. |
| **Composer CSS**: `composer-layout.css`, `composer-layout-editor.css`, and the `.composer*`/`.slash-menu*`/`.mention-menu*`/`.composer-mode*`/device-mode slices of `main.css` | Hard requirement. Extract into dedicated files during port. |
| **Automation store + scheduler** (~250 LOC) | Clean, small, correct (skip-missed, re-entrancy). Extend, don't rewrite. |
| **Test lane structure + helpers + tests/AGENTS.md conventions** | Mature. Port helpers, rewrite specs against new UI. |
| **Extension UI state model** (`extension-ui-state.ts`, host-UI request kinds, questionnaire tool) | Matches pi's RPC extension-UI protocol exactly. |
| **State-in-main + snapshot/patch/delta streaming pattern** (incl. debounce/rAF coalescing) | Correct architecture for Electron; renderer stays dumb. |
| **Model selector interaction design** (pinned slots, search, hide, thinking dial, ⌘1-4) | Good UX; rebuild in Svelte, keep design. |
| **session-driver pure-type package idea** | Keep as `packages/shared-types`. |
| **ADR/CONTEXT.md discipline + domain language** | Carry the docs habit and most terms over. |
| **chassis-reminder extension** + its tests | Self-contained pi extension; works unchanged. |

### Keep conceptually (redesign implementation)

- Snooze (thread defer + Snoozed section), thread testing (review queue + Testing view), custom chats (chat-workspace-backed), skills two-panel view + pure view-model, sidebar information architecture and ordering, smart-compact auto-trigger settings (thresholds + summary model), subagent env-var integration + agent-file editor, graphify status/build/update IPC + system-prompt injection, automations UI, thread title generation, queued/steer/follow-up message handling, plan→execute-plan flow, draft persistence.

---

## 3. What to Discard

| Item | Why |
|---|---|
| `app-store.ts`, `App.tsx`, `main.ts`, `session-supervisor.ts`, `runtime-supervisor.ts` as shapes | God files; repo's own PRD says decompose. Rewrite as small feature modules. |
| React renderer wholesale | Mandated Svelte rewrite; component code not portable anyway. |
| 12k-line `main.css` as a single file | Keep the *rules* (composer especially), split by feature. |
| `packages/catalogs` + `vendor/*.d.ts` ambient shims | 90 LOC package + type-drift trap. Fold into shared-types; use real imports. |
| Three-layer overlapping persistence, versionless | Replace with one store + schema version + migrations. |
| `video` workspace entry | Phantom. |
| Two-tier model filtering + dual-scope merge logic | Root cause of model confusion. Replace with curated-list + roles model (§4.9). |
| Parallel `commit-push-service`/`pr-service` duplication | Repo PRD already wants consolidation; rewrite behind one git service (if git features kept — Q1). |
| Naive hand-rolled cron walk | Use `croner` (tiny, correct). |
| electron-builder *(per mandate)* | Replaced by Electron Forge. ⚠ See Risks — auto-update + notarization parity must be proven in Phase 0. |

---

## 4. Proposed New Architecture

### 4.1 Stack

Electron Forge (vite plugin) · Svelte 5 (runes) + Vite + TS strict · Tailwind v4 · shadcn-svelte (bits-ui) for generic chrome; custom CSS for composer/sidebar identity · better-sqlite3 · `@earendil-works/pi-coding-agent` SDK in main process.

**pi integration mode: SDK in-process (main), not RPC.** Reasons: current app proves it; full fidelity (custom components, themes, editor hooks vs RPC's `ctx.ui.custom() → undefined`); zero serialization overhead. Crash-isolation path: Phase 2 option to move each session runtime into an Electron `utilityProcess` speaking the same driver-event protocol — the driver interface is designed so this swap is invisible to the renderer.

### 4.2 Folder structure

```
apps/desktop/
  electron/
    main.ts                 # <100 LOC: boot sequence only
    preload.ts              # generated from IPC contracts
    ipc/                    # contract registry, per-domain adapters
    windows/                # main window, overlay (if kept)
    services/               # notifications, theme, shell/pty, git, graphify
    automations/            # store, scheduler, event-bus triggers
    extensions/             # extension host glue, permission gate, logs
    persistence/            # sqlite, migrations, repositories
  src/
    app/                    # root, view router (state-driven, like today)
    features/
      sidebar/  projects/  threads/   # thread = timeline + run states
      composer/             # ported model layer + Svelte components + CSS
      custom-chats/  skills/  models/  extensions/
      automations/  settings/  search/
    components/ui/          # shadcn-svelte
    lib/                    # ipc client (typed window.piApp), formatters
    stores/                 # snapshot store, transcript store, ui state
    styles/                 # composer.css, sidebar.css, theme.css (split!)
    sounds/                 # 4 mp3 + sound engine (ported)
  tests/
    core/ live/ native/ production/ unit/ helpers/   # same lanes
packages/
  shared-types/             # entities, driver events, IPC payloads (pure types)
  pi-client/                # decomposed pi driver (was pi-sdk-driver), unit-tested
  automation-core/          # schedule/trigger logic, pure + deterministic
```

File budget: hard cap 1000 LOC, target <300. Each `features/*` owns its components, store slice, and CSS.

### 4.3 Data model

```
Workspace (implicit, single)
  Project        { id, path?, name, kind: repo|folder, settings, order }
  Thread         { id, projectId, piSessionFile, title, status,
                   snoozedUntil?, toTestAt?, toTestNote?, archivedAt?,
                   modelOverride?, createdAt, lastActivityAt }
  CustomChat     = Thread with projectId=null + chatWorkspaceDir
  Run            { id, threadId, startedAt, endedAt, status, usage/cost }   # derived from pi turn events, indexed for UI states
  Message        → pi JSONL session file (pi owns; we index, never duplicate)
  Artifact       { id, threadId, kind: file|diff|image|export, ref }
  Task           { id, threadId, text, done }                              # from todos/plan output; thin v1
  Automation     { id, name, prompt, trigger: schedule|event, scheduleSpec?,
                   eventSpec?, projectId?, modelRole|model, enabled, lastRunAt }
  ModelSettings  { curatedModels[], roles: { default, helper, scout },
                   perTaskDefaults, providerKeys→pi auth.json }
  ExtensionGrant { extensionId, permission, scope, decision, decidedAt }
  UiState        { sidebar widths/collapse, view, selection }
```

Principle: **pi session files remain the single source of truth for conversation content.** App DB stores identity, organization, settings, and derived indexes only. Threads always recoverable by rescanning `~/.pi/agent/sessions/`.

### 4.4 Renderer architecture

- Svelte 5 runes; no router lib — `viewState` store mirroring today's proven `activeView` switch (fast, no URL semantics needed).
- Renderer owns **zero business logic**: subscribes to `snapshot`, `snapshotPatch`, `transcriptDelta`, `hostUiRequest` events; issues typed commands. Port the debounce/rAF coalescing.
- Stores: `appSnapshot` (read model), `transcript` (active thread, append-optimized), `composer` (draft/attachments/queue per thread), `uiState`.
- Timeline: virtualized list; one `TimelineItem.svelte` per message kind delegating to small renderers (markdown, thinking, tool-card, diff). Svelte's fine-grained reactivity should beat current React diffing during streams — measure in Phase 1.
- Composer: ported CSS + sounds; Svelte components over the ported pure-TS model layer; device-mode body classes via a store-bound `<html>` class; `useButtonSound` → `use:buttonSound` action.

### 4.5 Electron main/preload

- `main.ts` = boot only: create services → open DB → migrate → restore state → create window → start scheduler. Each service self-registers its IPC adapter group.
- Services are plain classes with constructor-injected deps (testable under `node:test` without Electron).
- Preload generated from the contract registry (same as today). contextIsolation on, sandbox on, nodeIntegration off, strict navigation/permission handlers.

### 4.6 IPC/event architecture

- Single contract registry in `packages/shared-types` (channel, direction, kind, payload/result types, validator). Main registrar + preload generator derive from it. Contract drift = compile error; contract test asserts every channel registered.
- Domains: `app`, `projects`, `threads`, `composer`, `chats`, `models`, `extensions`, `automations`, `git?`, `system`.
- Internal **main-process event bus** (typed `AppEvent`): `thread.run.completed`, `thread.run.failed`, `thread.created`, `extension.event`, `file.changed` (chokidar, opt-in per automation), `app.launched`. Consumers: automation triggers, notifications, snapshot publisher. This is the spine that makes event-hook automations cheap later.

### 4.7 Local persistence

**Recommendation: SQLite (better-sqlite3, WAL) for all app entities; pi JSONL untouched for transcripts.**

- Why over current JSON sprawl: atomic writes (no torn debounced full-state files), real queries (search, Testing/Snoozed partitions, run history), one file to back up, `PRAGMA user_version` migrations from day one.
- Trade-off: less `cat`-able than JSON. Mitigate: `Settings → Advanced → Export state as JSON` debug dump, and keep DB schema boring (one table per entity, JSON columns for blobs like composer layouts).
- Sound settings move from localStorage into DB (single source).
- Repository layer in `electron/persistence/` — deterministic unit tests, in-memory SQLite in tests.

### 4.8 Extension execution model

Layered, replacing the implicit "extensions get everything" model:

1. **Execution stays in pi's loader inside main** (Phase 1) — exactly the proven mechanism. `extensions/host.ts` wraps `bindExtensions`, capturing per-extension diagnostics, console output → ring-buffer **logs** (viewable in Extensions UI), and failure states (load error, runtime error, incompatible host UI).
2. **Host UI**: implement all 12 request kinds as native-feeling Svelte surfaces (dialogs, status chips, above/below-composer widgets, notify→toast, editor prefill). This is the documented pi host contract — keeping it exact preserves "any pi extension works."
3. **Terminal-backed extensions**: keep a PTY service (node-pty) in main; `terminalCustom` requests render into an xterm pane in the renderer, as today. PTY creation goes through the permission gate.
4. **Permission gate (new)** — pragmatic, not a sandbox:
   - pi has no manifest permissions, so enforce at the *host seams we control*: PTY/terminal creation, app-DB access, automation-hook registration, secret reads via our auth service, network-touching host services.
   - First use of a gated capability → one native prompt ("Extension X wants terminal access — Allow once / Always for this project / Always / Deny"), persisted as `ExtensionGrant` (extension × permission × scope).
   - pi-level `tool_call` hook used to *observe and log* extension-initiated tool use per extension (debuggability), not to block (would break extensions).
   - Honest framing in UI: extensions are trusted code (same as pi CLI); the gate governs *app-provided* capabilities and gives visibility, not OS-level sandboxing. True isolation = future utilityProcess host (§4.1), which this design doesn't preclude.
5. **Discovery/install/config**: surface pi's own mechanisms (settings.json paths, `~/.pi/agent/extensions/`, npm packages via pi's package manager) in an Extensions view: list with source/diagnostics/enable toggle/logs/reload (`refreshRuntime`), install by path or package name.

### 4.9 Models & provider management

```
Settings → Models
  All Pi Models      # full registry, searchable, provider-grouped, auth status badge
  My Models          # curated list (replaces enabledModelPatterns) — what selectors show
  Roles              # Default · Cheap Helper (titles, summaries, compaction) · Scout/Subagent
  Per-task defaults  # plan mode, custom chats, automations (v1: small fixed set)
  Providers & Keys   # one screen: OAuth sign-in, API key entry, env-detected badge, custom providers
```

- Single mental model: *Catalog → curate → assign roles*. Curated list is explicit model refs, not patterns.
- "Available but not enabled / enabled but not authenticated" collapses into one badge per model: ✓ ready · 🔑 needs key (click → provider screen) · ✎ custom.
- Roles consumed everywhere a cheap model is needed today (compaction summaryModel, subagent model, title generation, scout tasks) — one setting, used by all.
- Per-project defaults: schema supports `projectId` override column from day one; UI in a later phase.
- Keys/OAuth still live in pi's `auth.json`/`models.json` (pi remains source of truth; CLI and GUI stay in sync). Global-only model settings in v1; per-project scope toggle (today's confusing `modelSettingsScopeMode`) dropped until needed.
- Thread level: keep ported selector (pinned slots, search, thinking dial). Per-run override = selector state at send time, recorded on Run.

### 4.10 Automation engine

- `packages/automation-core`: pure functions — `nextFireTime(spec, now)` (croner), `isDue`, skip-missed logic, trigger matching. Deterministic tests with injected clock.
- Main-process engine: scheduler (poll, as today — proven) + **event-trigger subscriber** on the app event bus (§4.6). An automation is `{trigger: schedule|event, action: run prompt in thread/new thread/custom chat, modelRole}`.
- v1 UI ships **scheduled prompts only** (parity), plus "Run now". Event triggers (`run.failed`, `file.changed`, `thread.created`, extension events) are engine-ready; UI exposes them in a later phase. Codex-grade UX: top-level sidebar item, one-screen create form, next-run preview, run history per automation.

### 4.11 First-class features

- **Smart compaction**: pi's `session.compact()` + auto-trigger after runs when context% / token thresholds hit (port settings: autoTrigger, minContextPercent, minTokenThreshold, summary model → Helper role). Live "compacting…" card in timeline; compaction summary message rendered distinctly. Context-usage bar stays in composer.
- **pi-subagents**: keep env-var integration (`PI_SUBAGENT_*`) + agent-file manager (`~/.pi/agent/agents/*.md`, frontmatter editor) + subagent session viewer panel. Scout/Subagent model role feeds default agent model.
- **Graphify**: keep system-prompt injection from `graphify-out/` + status/build/update service (CLI shell-outs) + graph surface (sigma) + freshness indicator on project. Injection becomes a per-project toggle instead of hardcoded.
- **Snooze**: same concept (set `snoozedUntil`, move to Snoozed section, time-left label, unsnooze). Two cheap improvements: auto-return to active when timer expires (today it just sits until manual unsnooze — confirm desired), optional preset durations (later today / tomorrow / next week) Codex-style.
- **Thread testing**: same concept (`toTestAt` + note, To Test section, Testing view with badge, ⇧6). Architecture leaves room for future "attach result/verdict" on the record — not built in v1.

### 4.12 Testing strategy

- `node:test` (or vitest) unit lanes: persistence repos (in-memory SQLite), automation-core (fake clock), model settings resolution, extension permission decisions, IPC contract completeness, composer model layer (port existing collision/parity tests), chassis-reminder.
- Svelte component tests: only where logic-heavy (composer submit/queue states, model selector filtering) — vitest + testing-library; keep thin.
- Playwright lanes ported: core (sidebar, composer, project/thread creation, custom chats, snooze, testing button, model selection, settings), live (real provider streaming, tool calls), native (pickers/clipboard), production (packaged launch smoke + Forge artifact). Port `electron-app.ts`/`macos-ui.ts` helpers and `tests/AGENTS.md` lane rules.

---

## 5. Migration / Build Plan

### Phases

**Phase 0 — Skeleton (gate: packaged app launches fast, IPC round-trip, CI green)**
Forge + vite + Svelte 5 + Tailwind + shadcn-svelte scaffold; typed IPC registry + generated preload; SQLite + migration runner; test lanes wired (1 core spec, unit lanes). **Prove Forge can match electron-builder: signed/notarized dmg/zip + auto-update + node-pty/better-sqlite3 native modules.** This is the riskiest unknown — front-load it.

**Phase 1 — pi core (gate: create thread in a project folder, stream a run, relaunch, resume)**
`packages/pi-client`: decomposed driver (runtime context, session lifecycle, event mapping, title generation, queued delivery — each its own module <400 LOC). Snapshot/patch/delta publishing. Minimal thread view + raw timeline. Perf baseline vs old app.

**Phase 2 — Shell UX (gate: looks/feels like Codex; composer indistinguishable from old app)**
Sidebar (sections, ordering, collapse persistence, moving highlight, drag-reorder), projects/threads, thread states, **composer full port** (model layer → CSS → sounds → Svelte components → slash/mention menus → attachments → queue/steer), timeline polish (markdown/thinking/tools/diffs, virtualization), keyboard shortcuts, global search, empty states.

**Phase 3 — Models + Custom Chats (gate: fresh user signs into provider, curates models, chats without a repo)**
Models settings per §4.9, providers & keys screen, model selector port, roles. Custom chats (chat workspace dirs, sidebar section, lifecycle).

**Phase 4 — Extensions + Skills (gate: arbitrary pi extension loads; all 12 host-UI kinds demoed; permission prompts work)**
Extension host + logs + failure states + reload, host-UI surfaces, permission gate + grants, Extensions view, Skills view (two-panel, ported view-model), prompt-template/skill slash commands, terminal-backed extension path (PTY + xterm overlay).

**Phase 5 — Automations + first-class features (gate: scheduled automation fires from launch; compaction/subagents/graphify/snooze/testing at parity)**
automation-core + engine + UI; event bus; smart-compact auto-trigger; subagents (env + agent manager + viewer); graphify service + surface; snooze + testing button + Testing view.

**Phase 6 — Polish + release (gate: acceptance criteria checklist passes)**
Notifications, done sounds/celebration, theme, perf passes, full Playwright lanes, packaging/auto-update verification, migration/import of existing threads (rescan pi session dir + optional one-shot import of old catalog JSON).

Order rationale: risk first (Forge packaging, pi driver, streaming perf), then the product's soul (composer/sidebar), then breadth.

### Risks

1. **Forge vs electron-builder parity** — notarization, auto-update channel, asar-unpacked native modules. Mitigation: Phase 0 spike; fallback decision point: keep Forge for dev + electron-builder for distribution, or revert mandate (your call if spike fails).
2. **Streaming timeline perf in Svelte** — virtualization + heavy markdown under fast deltas. Mitigation: Phase 1 benchmark vs old app before building polish on top.
3. **pi SDK surface drift** — driver pinned to `@earendil-works/pi-coding-agent`; vendored-type traps bit the old repo. Mitigation: real imports only, pin version, contract tests around event mapping.
4. **Composer CSS extraction** — composer rules interleaved in 12k-line main.css; visual regressions likely. Mitigation: Playwright screenshot specs against old app for composer states.
5. **Permission gate breaking extensions** — over-gating kills "any extension works". Mitigation: gate only app-provided capabilities; default-allow with logging for pi-native behaviour.
6. **Scope creep from undocumented features** (git environment widget, Ship, worktrees, kanban, overlay, GH Loops) — see Decisions.

### Decisions (RESOLVED 2026-06-11)

1. **Git features**: KEEP — Environment widget, worktrees, Workspace Review, Commit/Push, Ship/Auto-ship. Phase 5–6 behind one consolidated git service.
2. **Composer Layout editor**: DEFER editor UI. But port now: layout model (`composer-layout.ts`), layout persistence schema (JSON column), device modes, grid-renderer CSS, control-unit registry — so editor drops in later without migration.
3. **Forge**: agent's call — attempt Forge in Phase 0; fall back to electron-builder if notarization/auto-update parity fails. Decision recorded as ADR when made.
4. **Secondary surfaces**: integrated terminal KEEP; overlay window KEEP — required mode: composer-only overlay floating over desktop. Kanban + GH Loops DEFERRED.
5. **Snooze expiry**: AUTO-RETURN thread to active when `snoozedUntil` passes.
6. **Persistence**: SQLite approved.
7. **Migration**: START CLEAN. No import of old catalogs (pi session files still discoverable).

### Remaining open items (agent resolves during build)

1. **Git feature set**: Environment widget, worktrees (ADR-0003), Workspace Review, Commit/Push, Ship/Auto-ship are a large, central system in the current app but absent from your brief. Include in rewrite (suggest: yes, Phase 5–6, behind one consolidated git service), defer, or drop?
2. **Composer Layout editor + Chassis Actions**: full port of the grid editor/palette/inspector + device modes (cream/metal, ADR-0004/0005), or v1 ships fixed default layout + device modes with editor deferred? (Suggest: defer editor; keep layout model + modes so nothing is lost.)
3. **Forge mandate**: if the Phase 0 spike shows auto-update/notarization pain, OK to fall back to electron-builder?
4. **Secondary surfaces**: kanban view, GH Loops, overlay/PiP window, integrated terminal pane — keep which? (Suggest: integrated terminal yes — extensions need it; kanban/GH Loops/overlay defer.)
5. **Snooze wake behaviour**: should expiry auto-return the thread to active (+ optional notification), or keep today's manual-only behaviour?
6. **SQLite** sign-off vs preference for plain JSON files.
7. **Old-data migration**: import existing threads/catalogs from peche-pi on first launch, or start clean (pi session files visible either way)?
