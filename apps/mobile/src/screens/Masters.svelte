<script lang="ts">
  import { onMount } from "svelte";
  import { store, hostLabel, type Master } from "../lib/store.svelte.ts";
  import { health } from "../lib/api.ts";
  import Icon from "../components/Icon.svelte";

  // Swipe-to-delete: per-master horizontal offset (px). Negative = revealing
  // the delete action behind the card.
  let dragX = $state<Record<string, number>>({});
  let dragId = $state<string | null>(null);
  let startX = 0;
  let startOffset = 0;
  let moved = false;

  async function probe(m: Master): Promise<void> {
    store.setReach(m.id, { state: "unknown" });
    const ok = await health(m);
    store.setReach(m.id, ok ? { state: "online", at: Date.now() } : { state: "unreachable", at: Date.now() });
  }

  function probeAll(): void {
    for (const m of store.masters) probe(m);
  }

  onMount(probeAll);

  function reachOf(id: string) {
    return store.reach[id] ?? { state: "unknown" as const };
  }

  function runningCount(id: string): number {
    return (store.sessions[id] ?? []).filter((s) => s.status === "running").length;
  }

  function sinceLabel(at: number): string {
    const mins = Math.max(1, Math.round((Date.now() - at) / 60000));
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  }

  function open(m: Master): void {
    if (moved || (dragX[m.id] ?? 0) < 0) {
      dragX = { ...dragX, [m.id]: 0 }; // a swipe/closed card swallows the tap
      return;
    }
    // Switching machines re-roots the app at that machine's thread list.
    store.resetTo({ name: "sessions", masterId: m.id });
  }

  function onDown(e: PointerEvent, id: string): void {
    dragId = id;
    startX = e.clientX;
    startOffset = dragX[id] ?? 0;
    moved = false;
  }
  function onMove(e: PointerEvent, id: string): void {
    if (dragId !== id) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 6) moved = true;
    dragX = { ...dragX, [id]: Math.max(-88, Math.min(0, startOffset + dx)) };
  }
  function onUp(id: string): void {
    if (dragId !== id) return;
    dragId = null;
    const dx = dragX[id] ?? 0;
    dragX = { ...dragX, [id]: dx < -44 ? -80 : 0 };
  }
</script>

<header class="px-5 pt-3 pb-3.5">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-0.5">
      {#if store.stack.length > 1}
        <button
          class="-ml-2.5 flex h-8 w-8 items-center justify-center text-accent"
          onclick={() => store.pop()}
          aria-label="Back"
        >
          <Icon name="chevron-left" size={20} sw={2.4} />
        </button>
      {/if}
      <h1 class="text-[28px] font-bold tracking-[-0.02em]">Machines</h1>
    </div>
    <button
      class="flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-surface-2 text-muted"
      onclick={() => store.push({ name: "add-master" })}
      aria-label="Add master"
    >
      <Icon name="plus" size={18} sw={1.6} />
    </button>
  </div>
  <p class="mt-px text-[13px] text-faint">Watch a pi session over your tailnet</p>
</header>

<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
  <div class="flex flex-col gap-2.5">
    {#each store.masters as m (m.id)}
      {@const r = reachOf(m.id)}
      <div class="relative overflow-hidden rounded-[14px]">
        <!-- delete action revealed behind the card on swipe -->
        <button
          class="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-danger text-white"
          onclick={() => store.removeMaster(m.id)}
          aria-label="Delete master"
        >
          <Icon name="trash" size={18} />
        </button>
        <div
          class="relative rounded-[14px] border border-border bg-surface p-3.5"
          style="transform: translateX({dragX[m.id] ?? 0}px); transition: {dragId === m.id
            ? 'none'
            : 'transform 0.18s ease'};"
          onpointerdown={(e) => onDown(e, m.id)}
          onpointermove={(e) => onMove(e, m.id)}
          onpointerup={() => onUp(m.id)}
          onpointercancel={() => onUp(m.id)}
          onclick={() => open(m)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === "Enter" && open(m)}
        >
          <div class="flex items-center gap-2">
            <span class="text-[15px] font-semibold">{m.name}</span>
            {#if r.state === "online"}
              <span class="ml-auto flex items-center gap-1.5 text-[11px] text-success">
                <span class="h-[7px] w-[7px] rounded-full bg-success"></span>online
              </span>
            {:else if r.state === "unreachable"}
              <span class="ml-auto flex items-center gap-1.5 text-[11px] text-faint">
                <span class="h-[7px] w-[7px] rounded-full bg-fainter"></span>unreachable
              </span>
            {:else}
              <span class="ml-auto flex items-center gap-1.5 text-[11px] text-faint">
                <span class="h-[7px] w-[7px] rounded-full bg-fainter pp-pulse"></span>checking…
              </span>
            {/if}
          </div>
          <div class="mt-1.5 font-mono text-[12px] text-faint">{hostLabel(m)}</div>
          <div class="mt-2.5 flex items-center gap-2 border-t border-border/60 pt-2.5">
            {#if r.state === "unreachable"}
              <span class="text-[12px] text-faint">last seen {sinceLabel(r.at)}</span>
              <button class="ml-auto text-[12px] text-accent" onclick={(e) => { e.stopPropagation(); probe(m); }}>
                Retry
              </button>
            {:else if store.sessions[m.id]}
              <span class="text-[12px] text-muted">{store.sessions[m.id]!.length} sessions</span>
              {#if runningCount(m.id) > 0}
                <span class="text-border-strong">·</span>
                <span class="flex items-center gap-1 text-[12px] text-accent">
                  <span class="h-1.5 w-1.5 rounded-full bg-accent pp-pulse"></span>{runningCount(m.id)} running
                </span>
              {/if}
            {:else}
              <span class="text-[12px] text-muted">Tap to view sessions</span>
            {/if}
          </div>
        </div>
      </div>
    {/each}

    <button
      class="flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-border-strong p-3.5 text-[14px] text-muted"
      onclick={() => store.push({ name: "add-master" })}
    >
      <Icon name="plus" size={16} sw={1.6} /> Add master
    </button>

    <div class="mt-1.5 flex items-start gap-2 px-1">
      <span class="mt-0.5 shrink-0 text-fainter"><Icon name="shield" size={14} sw={1.6} /></span>
      <p class="text-[11.5px] leading-[1.5] text-faint">
        Visible only on your tailnet. Transcripts carry source &amp; secrets — keep this device on
        the trust boundary.
      </p>
    </div>
  </div>
</div>
