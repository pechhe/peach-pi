/**
 * Settings navigation model — one entry per rendered section, grouped into a
 * handful of areas that drive the Cloudflare-style in-page sidebar (jump,
 * don't switch views). `keywords` powers the search filter; an empty query
 * shows everything. Exported so the search palette (SearchOverlay) and other
 * surfaces can mirror the section list without coupling to the view.
 */
export type NavItem = { id: string; label: string; keywords: string };
export type NavGroup = { id: string; label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    id: "account",
    label: "Account",
    items: [
      { id: "providers", label: "Providers & login", keywords: "providers login account sign in oauth subscription api key anthropic claude openai chatgpt codex copilot github auth credentials logout token model provider" },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    items: [
      { id: "playroom", label: "Playroom", keywords: "appearance playroom live stage tune look feel messages done animation alerts chassis" },
      { id: "theme", label: "Theme", keywords: "theme appearance applies to every window colors" },
      { id: "composer", label: "Composer", keywords: "composer light silver dark anodized chassis auto follows your theme" },
      { id: "sidebar", label: "Sidebar engraving", keywords: "sidebar engraving metal surface letterpress text tune sidebar-device" },
      { id: "caveman", label: "Caveman intensity", keywords: "caveman intensity level composer toggle" },
      { id: "hud", label: "HUD auto-reveal", keywords: "hud auto-reveal expand chat thread finishes" },
      { id: "doneAnimation", label: "Done animation", keywords: "done animation mark done card animation preview play" },
      { id: "loaders", label: "Loaders", keywords: "loaders dot matrix spinner square hex triangle sidebar chat agents hourglass neon drift glow bloom animate" },
      { id: "streaming", label: "Streaming", keywords: "streaming text assistant replies reveal stream" },
    ],
  },
  {
    id: "sounds",
    label: "Sounds",
    items: [
      { id: "sounds", label: "Sounds", keywords: "sounds button clicks done chime mute" },
      { id: "doneChime", label: "Done chime", keywords: "done chime celebration cue thread finishes preview" },
      { id: "threadDoneSound", label: "Thread done sound", keywords: "thread done sound mark done archive click precision archive latch metallic preview" },
      { id: "testBenchSound", label: "Test bench sound", keywords: "test bench sound mark to test relay tick diagnostic chirp stamp flask inspection preview" },
      { id: "testAnimation", label: "Test bench animation", keywords: "test animation mark to test card animation preview play bench stamp scan relay" },
    ],
  },
  {
    id: "behavior",
    label: "Behavior",
    items: [
      { id: "autoCompact", label: "Auto-compaction", keywords: "auto-compaction compact context usage threshold tokens percentage" },
      { id: "retry", label: "Retry on error", keywords: "retry on error network drop transient exponential backoff wait doubles" },
      { id: "messageDelivery", label: "Message delivery", keywords: "message delivery steering mode follow-up mode" },
      { id: "extensions", label: "Extensions", keywords: "extensions auto update packages pi update periodic refresh" },
      { id: "insomnia", label: "Keep awake", keywords: "insomnia sleep idle caffeinate prevent mac awake while running" },
      { id: "topbar", label: "Topbar", keywords: "topbar top bar widgets devtap fallow customization show hide chip" },
      { id: "subagents", label: "Subagents", keywords: "subagents agents scouting research verification cheap model roster subagent roster" },
    ],
  },
  {
    id: "models",
    label: "Models",
    items: [
      { id: "utilityModel", label: "Utility model", keywords: "utility model background tasks thread titles commit messages fast inexpensive" },
      { id: "scopedModels", label: "Scoped models", keywords: "scoped models scopedmodels enable disable model scope composer selector enabled models available list" },
      { id: "visionProxy", label: "Vision proxy", keywords: "vision proxy images description describe blind text-only model fallback always off consent claude gemini qwen" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "computerUse", label: "Computer use", keywords: "computer use agent browser cua driver native desktop automation accessibility permissions install setup" },
      { id: "about", label: "About", keywords: "about peach-pi version" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
export const itemById = new Map(NAV_ITEMS.map((it) => [it.id, it] as const));
