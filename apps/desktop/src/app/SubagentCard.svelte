<script lang="ts">
  import type { Component } from "svelte";
  import { slide, fly } from "svelte/transition";
  import Compass from "@lucide/svelte/icons/compass";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import Wrench from "@lucide/svelte/icons/wrench";
  import Telescope from "@lucide/svelte/icons/telescope";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import X from "@lucide/svelte/icons/x";
  import FileText from "@lucide/svelte/icons/file-text";
  import BrailleSpinner from "./BrailleSpinner.svelte";
  import type { FleetAgent } from "../lib/subagent/fleet";
  import {
    activityLog,
    buildNodes,
    headState,
    isEntityLive,
    type AgentEntity,
  } from "../lib/subagent/journey.svelte";

  let { entity, live }: { entity: AgentEntity; live: FleetAgent | undefined } = $props();

  interface AgentKind {
    kind: string;
    label: string;
    accent: string;
    Icon: Component;
  }
  const AGENT_KINDS: Record<string, AgentKind> = {
    scout: { kind: "scout", label: "Scout", accent: "#7c5cff", Icon: Compass },
    verifier: { kind: "verifier", label: "Verifier", accent: "#18a058", Icon: ShieldCheck },
    implementer: { kind: "implementer", label: "Implementer", accent: "#f08c2e", Icon: Wrench },
    researcher: { kind: "researcher", label: "Researcher", accent: "#06b6d4", Icon: Telescope },
  };
  function agentKind(agent: string | undefined): AgentKind {
    const key = agent?.trim().toLowerCase();
    if (key && AGENT_KINDS[key]) return AGENT_KINDS[key];
    const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : "Agent";
    return { kind: "default", label, accent: "var(--color-accent)", Icon: Sparkles };
  }

  let showInstructions = $state(false);

  const kindInfo = $derived(agentKind(entity.agent));
  const live_ = $derived(isEntityLive(entity, live));
  // Record each distinct live activity into the shared log so the journey
  // accumulates steps over time rather than only showing the latest.
  $effect(() => {
    if (live_ && live?.activity) activityLog.record(entity.name, live.activity);
  });
  const nodes = $derived(
    buildNodes(entity, activityLog.logFor(entity.name), live_, live?.activity),
  );
  const state = $derived(headState(entity, live_));
  const stateLabel = $derived(
    state === "running"
      ? "Active"
      : state === "completed"
        ? "Completed"
        : state === "failed"
          ? "Failed"
          : state === "cancelled"
            ? "Cancelled"
            : "Idle",
  );
  const stats = $derived(live_ ? (live?.stats ?? []) : []);
  const latest = $derived(entity.events[entity.events.length - 1]!);
  const task = $derived(latest.task ?? entity.events[0]!.task);
</script>

<article class="agent-entity" data-agent-kind={kindInfo.kind} style="--ae-accent: {kindInfo.accent}" data-testid="subagent-card">
  <header class="agent-entity__header">
    <span class="agent-entity__badge" aria-hidden="true">
      <kindInfo.Icon size={19} />
    </span>
    <div class="agent-entity__id">
      <div class="agent-entity__title-line">
        <span class="agent-entity__type">{kindInfo.label}</span>
        <span class="agent-entity__name">{entity.name}</span>
      </div>
      <div class="agent-entity__sub">
        <span class="agent-entity__state agent-entity__state--{state}">
          {stateLabel}
        </span>
        {#if stats.length > 0}<span class="agent-entity__stats">{stats.join(" · ")}</span>{/if}
      </div>
    </div>
    {#if task}
      <button class="agent-entity__action agent-entity__action--top" type="button" aria-expanded={showInstructions} onclick={() => (showInstructions = !showInstructions)}>
        <FileText size={14} />
        View instructions
      </button>
    {/if}
  </header>

  <ol class="agent-entity__journey">
    {#each nodes as node (node.id)}
      {#key node.id}
      <li
        class="agent-entity__node agent-entity__node--{node.tone}"
        in:slide={{ duration: 320, axis: "y" }}
        out:slide={{ duration: 200, axis: "y" }}
      >
        <span class="agent-entity__marker agent-entity__marker--{node.tone}" aria-hidden="true">
          {#if node.tone === "active"}<BrailleSpinner class="agent-entity__node-spinner" shape="triangle" />{:else if node.tone === "failed" || node.tone === "cancelled"}<X size={11} />{:else if node.tone === "blocked"}<span class="agent-entity__node-bang" aria-hidden="true">!</span>{/if}
        </span>
        <div class="agent-entity__body" in:fly={{ duration: 300, y: 4, delay: 40 }}>
          <span class="agent-entity__node-title" title={node.fullTitle ?? node.title}>{node.title}</span>
          {#if node.subtitle}<p class="agent-entity__node-sub" title={node.subtitle}>{node.subtitle}</p>{/if}
        </div>
      </li>
      {/key}
    {/each}
  </ol>

  {#if showInstructions && task}
    <div class="agent-entity__instructions">
      <div class="agent-entity__section-label">Instructions</div>
      <pre class="agent-entity__pre">{task}</pre>
    </div>
  {/if}
</article>

<style>
  .agent-entity {
    --ae-accent: var(--color-accent);
    display: grid;
    gap: 12px;
    max-width: 720px;
    padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--ae-accent) 26%, var(--color-border));
    border-radius: 14px;
    background: color-mix(in srgb, var(--ae-accent) 4%, var(--color-surface));
  }

  .agent-entity__header { display: flex; align-items: flex-start; gap: 12px; }

  .agent-entity__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 38px;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    color: var(--ae-accent);
    background: color-mix(in srgb, var(--ae-accent) 16%, transparent);
  }

  .agent-entity__id { display: grid; gap: 3px; min-width: 0; flex: 1 1 auto; }

  .agent-entity__title-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 14px;
    line-height: 1.2;
  }
  .agent-entity__type { font-weight: 700; color: var(--ae-accent); }
  .agent-entity__name { font-weight: 700; color: var(--color-fg); }

  .agent-entity__sub {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 12px;
    color: var(--color-muted);
  }

  .agent-entity__state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    color: var(--ae-accent);
  }
  .agent-entity__state--completed { color: var(--color-success); }
  .agent-entity__state--failed,
  .agent-entity__state--cancelled { color: var(--color-danger); }
  .agent-entity__state--idle { color: var(--color-muted); }

  :global(.agent-entity__spinner) { width: 14px; height: 14px; color: var(--ae-accent); }

  .agent-entity__stats:not(:first-child)::before { content: "· "; margin-right: 2px; }

  /* ── Journey: vertical execution graph ── */
  .agent-entity__journey {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .agent-entity__node {
    position: relative;
    display: grid;
    grid-template-columns: 22px 1fr;
    column-gap: 12px;
    align-items: start;
    padding: 6px 0;
  }
  /* connector to the next node — centered on the marker column (11px = half
     marker). Hidden on the last node; fades in via opacity when a node stops
     being last, so a freshly-appended step links up gracefully. Leaves a small
     gap around each marker. */
  .agent-entity__node::before {
    content: "";
    position: absolute;
    left: 11px;
    top: 32px;    /* marker bottom (28) + 4px gap */
    bottom: -8px; /* next marker top (12 from this node's bottom) - 4px gap */
    width: 2px;
    transform: translateX(-50%);
    background: color-mix(in srgb, var(--ae-accent) 45%, var(--color-border));
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .agent-entity__node:not(:last-child)::before { opacity: 1; }

  /* plain nodes — no colored boxes */
  .agent-entity__marker {
    grid-column: 1;
    justify-self: center;
    align-self: start;
    margin-top: 2px;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--color-muted);
    transition: color 0.2s ease, transform 0.2s ease;
  }
  /* completed step = solid dot */
  .agent-entity__marker--done {
    color: var(--ae-accent);
  }
  .agent-entity__marker--done::after {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.55;
  }
  .agent-entity__marker--active { color: var(--ae-accent); }
  .agent-entity__marker--blocked { color: #f08c2e; }
  .agent-entity__marker--failed,
  .agent-entity__marker--cancelled { color: var(--color-danger); }
  .agent-entity__node-bang { font-size: 11px; font-weight: 700; }

  :global(.agent-entity__node-spinner) {
    width: 16px;
    height: 16px;
    color: var(--ae-accent);
  }

  .agent-entity__body { grid-column: 2; min-width: 0; }
  .agent-entity__node-title {
    font-size: 13px;
    font-weight: 600;
    line-height: 20px;
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.2s ease;
  }
  .agent-entity__node--blocked .agent-entity__node-title { color: #c2691a; }
  .agent-entity__node--active .agent-entity__node-title { color: var(--ae-accent); }
  .agent-entity__node-sub {
    margin: 1px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--color-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }

  .agent-entity__action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    align-self: center;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--ae-accent);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--ae-accent) 32%, transparent);
    border-radius: 7px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .agent-entity__action:hover { background: color-mix(in srgb, var(--ae-accent) 12%, transparent); }

  .agent-entity__instructions {
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--ae-accent) 6%, var(--color-surface));
    border: 1px solid color-mix(in srgb, var(--ae-accent) 16%, var(--color-border));
  }
  .agent-entity__section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted);
    margin-bottom: 4px;
  }
  .agent-entity__pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-fg);
  }
</style>
