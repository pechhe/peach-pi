# Graph Report - .  (2026-06-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 688 nodes · 1165 edges · 38 communities (35 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e7c599c7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_AI Session Management|AI Session Management]]
- [[_COMMUNITY_Database & Migrations|Database & Migrations]]
- [[_COMMUNITY_IPC & Extension Registry|IPC & Extension Registry]]
- [[_COMMUNITY_Button Sound Settings|Button Sound Settings]]
- [[_COMMUNITY_Markdown Rendering|Markdown Rendering]]
- [[_COMMUNITY_Composer Attachments|Composer Attachments]]
- [[_COMMUNITY_Thread Service|Thread Service]]
- [[_COMMUNITY_Automation Service|Automation Service]]
- [[_COMMUNITY_Main Process Boot|Main Process Boot]]
- [[_COMMUNITY_App UI Views|App UI Views]]
- [[_COMMUNITY_Sidebar & Thread UI|Sidebar & Thread UI]]
- [[_COMMUNITY_App Desktop Structure|App Desktop Structure]]
- [[_COMMUNITY_Package Configuration|Package Configuration]]
- [[_COMMUNITY_Git Service|Git Service]]
- [[_COMMUNITY_App Service|App Service]]
- [[_COMMUNITY_Coding Agent Package|Coding Agent Package]]
- [[_COMMUNITY_Automation Scheduler Package|Automation Scheduler Package]]
- [[_COMMUNITY_TypeScript Base Config|TypeScript Base Config]]
- [[_COMMUNITY_Graphify Service|Graphify Service]]
- [[_COMMUNITY_Composer UI|Composer UI]]
- [[_COMMUNITY_End-to-End Tests|End-to-End Tests]]
- [[_COMMUNITY_Package Definition|Package Definition]]
- [[_COMMUNITY_Overlay Composer|Overlay Composer]]
- [[_COMMUNITY_Project tsconfig|Project tsconfig]]
- [[_COMMUNITY_Theme Store|Theme Store]]
- [[_COMMUNITY_Build tsconfig|Build tsconfig]]
- [[_COMMUNITY_Electron tsconfig|Electron tsconfig]]
- [[_COMMUNITY_App tsconfig|App tsconfig]]
- [[_COMMUNITY_Terminal Pane|Terminal Pane]]
- [[_COMMUNITY_Settings & Automations UI|Settings & Automations UI]]
- [[_COMMUNITY_Package tsconfig|Package tsconfig]]
- [[_COMMUNITY_Forge Config|Forge Config]]
- [[_COMMUNITY_ADR Forge SQLite|ADR Forge SQLite]]

## God Nodes (most connected - your core abstractions)
1. `ThreadService` - 37 edges
2. `./Sidebar.svelte` - 25 edges
3. `AppDb` - 24 edges
4. `PiSession` - 24 edges
5. `ThreadRepo` - 23 edges
6. `AppService` - 20 edges
7. `ProjectRepo` - 19 edges
8. `AutomationRepo` - 17 edges
9. `AutomationService` - 15 edges
10. `TranscriptRecorder` - 15 edges

## Surprising Connections (you probably didn't know these)
- `ThreadService` --references--> `Thread`  [EXTRACTED]
  apps/desktop/electron/services/thread-service.ts → packages/shared-types/src/entities.ts
- `Window` --references--> `PeachPiApi`  [EXTRACTED]
  apps/desktop/src/global.d.ts → packages/shared-types/src/ipc.ts
- `Toast` --inherits--> `NoticePayload`  [EXTRACTED]
  apps/desktop/src/stores/extension-ui.svelte.ts → packages/shared-types/src/entities.ts
- `apps/desktop` --implements--> `Electron Forge`  [EXTRACTED]
  AGENTS.md → docs/adr/0001-forge-node-sqlite.md
- `apps/desktop` --references--> `apps/desktop/index.html`  [EXTRACTED]
  AGENTS.md → apps/desktop/index.html

## Import Cycles
- None detected.

## Communities (38 total, 3 thin omitted)

### Community 0 - "AI Session Management"
Cohesion: 0.06
Nodes (26): generateCommitMessage(), PREFERRED, SYSTEM_PROMPT, ImagePayload, ModelInfo, ThinkingLevel, ToolMode, createUiBridge() (+18 more)

### Community 1 - "Database & Migrations"
Cohesion: 0.07
Nodes (23): better-sqlite3, Emit, node:sqlite, AppDb, migrate(), openDb(), Migration, migrations (+15 more)

### Community 2 - "IPC & Extension Registry"
Cohesion: 0.05
Nodes (33): api, eventChannels, invokeChannels, IpcHandlers, AppView, ExtensionInfo, ExtensionStatusPayload, ExtensionUiRequest (+25 more)

### Community 3 - "Button Sound Settings"
Cohesion: 0.07
Nodes (38): BUTTON_CATEGORY_DESCRIPTIONS, BUTTON_CATEGORY_LABELS, BUTTON_CLICK_VARIANTS, ButtonCategory, ButtonClickVariant, ButtonSoundSettings, CLICK_RATE, ClickKind (+30 more)

### Community 4 - "Markdown Rendering"
Cohesion: 0.05
Nodes (40): dependencies, dompurify, @earendil-works/pi-coding-agent, @lucide/svelte, marked, node-pty, @peach-pi/automation-core, @peach-pi/pi-client (+32 more)

### Community 5 - "Composer Attachments"
Cohesion: 0.07
Nodes (32): ComposerAttachment, ComposerFileAttachment, ComposerImageAttachment, ComposerImageMimeType, dedupeFiles(), extractFilesFromDataTransfer(), extractImageFilePathsFromClipboardData(), extractImageFilesFromClipboardData() (+24 more)

### Community 6 - "Thread Service"
Cohesion: 0.10
Nodes (5): ThreadService, CommandInfo, SessionMeta, sessionMetas, SessionMetaStore

### Community 7 - "Automation Service"
Cohesion: 0.11
Nodes (9): AutomationRepo, toAutomation(), AutomationService, Automation, AutomationRun, computeNextFire(), CRON_PRESETS, isDue() (+1 more)

### Community 8 - "Main Process Boot"
Cohesion: 0.13
Nodes (17): boot(), IMAGE_MIME_BY_EXT, createEmitter(), registerIpcHandlers(), CavemanFile, CONFIG_PATH, getCavemanState(), readFileConfig() (+9 more)

### Community 9 - "App UI Views"
Cohesion: 0.19
Nodes (15): ./ExtensionDialog.svelte, ./ExtensionsView.svelte, ./GraphView.svelte, ./SearchOverlay.svelte, ./SkillsView.svelte, ./TestingView.svelte, ./ThreadView.svelte, ./Toasts.svelte (+7 more)

### Community 10 - "Sidebar & Thread UI"
Cohesion: 0.11
Nodes (17): @lucide/svelte/icons/alarm-clock, ./Sidebar.svelte, ./SnoozePicker.svelte, @lucide/svelte/icons/archive, @lucide/svelte/icons/archive-restore, @lucide/svelte/icons/book-open, @lucide/svelte/icons/bot, @lucide/svelte/icons/chevron-right (+9 more)

### Community 11 - "App Desktop Structure"
Cohesion: 0.11
Nodes (18): apps/desktop, Automation Store & Scheduler, Composer Layout Model, electron-builder, Electron Forge, Extension UI State Model, apps/desktop/index.html, JSONL Session Files (+10 more)

### Community 12 - "Package Configuration"
Cohesion: 0.11
Nodes (18): devDependencies, typescript, license, name, yauzl, packageManager, pnpm, overrides (+10 more)

### Community 13 - "Git Service"
Cohesion: 0.23
Nodes (9): makeRepo(), execFileAsync, git(), gitOk(), GitService, slug(), GitChangedFile, GitCommitPushResult (+1 more)

### Community 14 - "App Service"
Cohesion: 0.18
Nodes (4): AppService, AppSnapshot, snapshot, SnapshotStore

### Community 15 - "Coding Agent Package"
Cohesion: 0.12
Nodes (16): dependencies, @earendil-works/pi-ai, @earendil-works/pi-coding-agent, @peach-pi/shared-types, devDependencies, @types/node, typescript, main (+8 more)

### Community 16 - "Automation Scheduler Package"
Cohesion: 0.13
Nodes (14): dependencies, croner, devDependencies, @types/node, typescript, main, name, private (+6 more)

### Community 17 - "TypeScript Base Config"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noFallthroughCasesInSwitch (+6 more)

### Community 18 - "Graphify Service"
Cohesion: 0.28
Nodes (4): execFileAsync, findGraphifyBin(), GraphifyService, GraphifyStatus

### Community 19 - "Composer UI"
Cohesion: 0.17
Nodes (10): ./composer/ModelSelector.svelte, ./composer/ReasoningDial.svelte, angle, @lucide/svelte/icons/file-text, svelte/reactivity, ../lib/composer/attachments, ../lib/composer/mode, ../stores/caveman.svelte (+2 more)

### Community 21 - "Package Definition"
Cohesion: 0.18
Nodes (10): devDependencies, typescript, main, name, private, scripts, typecheck, type (+2 more)

### Community 22 - "Overlay Composer"
Cohesion: 0.29
Nodes (5): onKeydown(), submit(), target, theme, app

### Community 23 - "Project tsconfig"
Cohesion: 0.25
Nodes (7): compilerOptions, allowImportingTsExtensions, lib, noEmit, types, extends, include

### Community 24 - "Theme Store"
Cohesion: 0.36
Nodes (5): applyToDocument(), readStored(), ThemeOption, THEMES, ThemeStore

### Community 25 - "Build tsconfig"
Cohesion: 0.29
Nodes (6): compilerOptions, allowImportingTsExtensions, noEmit, types, extends, include

### Community 26 - "Electron tsconfig"
Cohesion: 0.29
Nodes (6): compilerOptions, allowImportingTsExtensions, noEmit, types, extends, include

### Community 27 - "App tsconfig"
Cohesion: 0.29
Nodes (6): compilerOptions, allowImportingTsExtensions, noEmit, types, extends, include

### Community 28 - "Terminal Pane"
Cohesion: 0.33
Nodes (5): @xterm/addon-fit, @lucide/svelte/icons/chevron-down, @lucide/svelte/icons/x, @xterm/xterm, @xterm/xterm/css/xterm.css

### Community 29 - "Settings & Automations UI"
Cohesion: 0.33
Nodes (6): ./AutomationsView.svelte, ./SettingsView.svelte, @lucide/svelte/icons/trash-2, ../lib/sound/button-click-sound, ../lib/sound/sound-prefs, ../lib/theme.svelte

### Community 30 - "Package tsconfig"
Cohesion: 0.33
Nodes (5): compilerOptions, allowImportingTsExtensions, noEmit, extends, include

## Knowledge Gaps
- **200 isolated node(s):** `IpcHandlers`, `IMAGE_MIME_BY_EXT`, `Migration`, `ProjectRow`, `ThreadRow` (+195 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `./composer/ModelSelector.svelte` connect `Composer UI` to `App UI Views`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Why does `TranscriptItem` connect `AI Session Management` to `Database & Migrations`, `IPC & Extension Registry`, `Thread Service`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `QueueState` connect `Composer Attachments` to `IPC & Extension Registry`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `IpcHandlers`, `IMAGE_MIME_BY_EXT`, `Migration` to the rest of the system?**
  _200 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Session Management` be split into smaller, more focused modules?**
  _Cohesion score 0.06240084611316764 - nodes in this community are weakly interconnected._
- **Should `Database & Migrations` be split into smaller, more focused modules?**
  _Cohesion score 0.06610169491525424 - nodes in this community are weakly interconnected._
- **Should `IPC & Extension Registry` be split into smaller, more focused modules?**
  _Cohesion score 0.05101327742837177 - nodes in this community are weakly interconnected._