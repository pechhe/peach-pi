<script lang="ts">
  import { onMount } from "svelte";
  import {
    applyTranscriptOps,
    type RemoteHostConfig,
    type RemoteHostConnection,
    type RemoteSessionInfo,
    type RemoteTapFrame,
    type TranscriptItem,
  } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import { playButtonClick } from "../lib/sound/button-click-sound";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Radio from "@lucide/svelte/icons/radio";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Download from "@lucide/svelte/icons/download";
  import CopyButton from "./CopyButton.svelte";
  import StreamingText from "./StreamingText.svelte";

  // ── Master side: host serving status ────────────────────────────────
  let hostStatus = $state<RemoteHostConfig | null>(null);
  let localProjects = $state<{ id: string; name: string; path: string }[]>([]);
  let togglingHost = $state(false);

  // ── Client side: saved master connections ───────────────────────────
  let hosts = $state<RemoteHostConnection[]>([]);
  let sessions = $state<Record<string, RemoteSessionInfo[]>>({});
  let error = $state("");

  // New-host form.
  let showAddHost = $state(false);
  let newName = $state("");
  let newHost = $state("");
  let newPort = $state("");
  let newToken = $state("");

  // ── Attached tap state ──────────────────────────────────────────────
  // A single attached session at a time (v1). The transcript is folded from
  // remote tap frames exactly like the local event:transcript stream.
  let attached = $state<{ hostId: string; threadId: string } | null>(null);
  let remoteTranscript = $state<TranscriptItem[]>([]);
  let remoteSeq = $state(0);
  let lastCheckpoint = $state<string | null>(null);
  let tapStatus = $state("");
  let pulling = $state(false);
  let pullResult = $state<{ worktreePath: string; sha: string } | null>(null);

  async function loadHost() {
    [hostStatus, hosts] = await Promise.all([
      api.invoke("remote:hostStatus"),
      api.invoke("remote:listHosts"),
    ]);
  }

  async function loadLocalProjects() {
    const snap = await api.invoke("app:getSnapshot");
    localProjects = snap.projects.map((p) => ({ id: p.id, name: p.name, path: p.path }));
  }

  async function toggleHost(on: boolean) {
    togglingHost = true;
    try {
      hostStatus = await api.invoke("remote:setHostEnabled", on);
      error = "";
    } catch (e) {
      error = String((e as Error).message ?? e);
    } finally {
      togglingHost = false;
    }
  }

  async function setProjectServed(projectId: string, on: boolean) {
    hostStatus = await api.invoke("remote:setProjectServed", projectId, on);
  }

  async function setServeAll(on: boolean) {
    hostStatus = await api.invoke("remote:setServeAll", on);
  }

  async function regenerateToken() {
    hostStatus = await api.invoke("remote:regenerateToken");
  }

  async function addHost() {
    if (!newName.trim() || !newHost.trim()) return;
    await api.invoke("remote:addHost", {
      name: newName.trim(),
      host: newHost.trim(),
      port: Number(newPort) || 0,
      token: newToken.trim(),
    });
    newName = newHost = newPort = newToken = "";
    showAddHost = false;
    hosts = await api.invoke("remote:listHosts");
  }

  async function removeHost(id: string) {
    if (attached?.hostId === id) detach();
    await api.invoke("remote:removeHost", id);
    hosts = await api.invoke("remote:listHosts");
    delete sessions[id];
  }

  async function listSessions(hostId: string) {
    try {
      sessions[hostId] = await api.invoke("remote:listSessions", hostId);
      error = "";
    } catch (e) {
      error = String((e as Error).message ?? e);
    }
  }

  function attach(hostId: string, threadId: string) {
    if (attached) detach();
    remoteTranscript = [];
    remoteSeq = 0;
    lastCheckpoint = null;
    pullResult = null;
    tapStatus = "connecting…";
    attached = { hostId, threadId };
    api.invoke("remote:attach", hostId, threadId);
  }

  function detach() {
    api.invoke("remote:detach");
    attached = null;
    tapStatus = "";
  }

  async function pullToTest(hostId: string, threadId: string) {
    pulling = true;
    pullResult = null;
    try {
      pullResult = await api.invoke("remote:pullToTest", hostId, threadId);
      error = "";
    } catch (e) {
      error = String((e as Error).message ?? e);
    } finally {
      pulling = false;
    }
  }

  // Fold tap frames into the read-only transcript (reuses the shared model).
  function onFrame(frame: RemoteTapFrame) {
    if (!attached) return;
    if (frame.threadId !== attached.threadId) return;
    if (frame.kind === "backfill") {
      remoteTranscript = [...frame.items];
      remoteSeq = frame.seq;
      tapStatus = "live";
    } else if (frame.kind === "transcript") {
      // Drop frames already folded into the backfill snapshot.
      if (frame.seq <= remoteSeq) return;
      remoteTranscript = applyTranscriptOps(remoteTranscript, frame.ops);
      remoteSeq = frame.seq;
    } else if (frame.kind === "checkpoint") {
      lastCheckpoint = frame.sha;
    } else if (frame.kind === "bye") {
      tapStatus = `disconnected (${frame.reason})`;
    }
  }

  onMount(() => {
    loadHost();
    loadLocalProjects();
    const off = api.on("event:remoteTap", onFrame);
    return off;
  });
</script>

<div class="flex h-full flex-col">
  <header class="flex items-center justify-between border-b border-border px-6 py-3">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-fg">
      <Radio size={15} /> Remote Sessions
    </h2>
    <button
      class="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
      onclick={() => { loadHost(); loadLocalProjects(); }}
      title="Refresh"
    >
      <RefreshCw size={14} />
    </button>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
    {#if error}
      <div class="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        {error}
      </div>
    {/if}

    <!-- ── Master side: serve your sessions ─────────────────────── -->
    <section class="mb-6">
      <h3 class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-faint uppercase">
        <Monitor size={13} /> Host — serve this machine
      </h3>
      <div class="rounded-lg border border-border bg-surface-2 p-3">
        {#if hostStatus}
          <div class="mb-2 flex items-center gap-2 text-[13px]">
            <button
              class="rounded-md px-2.5 py-1 text-xs font-medium {hostStatus?.enabled
                ? 'bg-green-600 text-white'
                : 'bg-surface-3 text-muted hover:text-fg'}"
              onclick={() => toggleHost(!hostStatus!.enabled)}
              disabled={togglingHost}
            >
              {hostStatus.enabled ? "● Serving" : "○ Off"}
            </button>
            {#if hostStatus.enabled && hostStatus.bindIp}
              <span class="text-xs text-faint">
                listening on <span class="font-mono text-fg">{hostStatus.bindIp}:{hostStatus.port}</span>
              </span>
            {:else if hostStatus.enabled}
              <span class="text-xs text-amber-400">starting…</span>
            {/if}
          </div>

          {#if hostStatus.token}
            <div class="mb-3 flex items-center gap-2">
              <span class="text-xs text-faint">token:</span>
              <code class="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                {hostStatus.token.slice(0, 8)}…{hostStatus.token.slice(-4)}
              </code>
              <CopyButton text={hostStatus.token} />
              <button class="text-xs text-muted hover:text-fg" onclick={regenerateToken}>regenerate</button>
            </div>
          {/if}

          <p class="mb-1.5 text-xs text-faint">
            Serve a project so another peach-pi can attach to any of its threads:
          </p>
          <div class="max-h-40 overflow-y-auto space-y-1">
            <label class="flex items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-surface-3">
              <input
                type="checkbox"
                checked={hostStatus.serveAll}
                onchange={(e) => setServeAll(e.currentTarget.checked)}
              />
              <span class="font-medium text-fg">All projects</span>
              <span class="ml-auto text-[10px] text-faint">includes future</span>
            </label>
            {#each localProjects as p (p.id)}
              <label
                class="flex items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-surface-3"
                class:opacity-50={hostStatus.serveAll}
              >
                <input
                  type="checkbox"
                  checked={hostStatus.serveAll || hostStatus.servedProjects.includes(p.id)}
                  disabled={hostStatus.serveAll}
                  onchange={(e) => setProjectServed(p.id, e.currentTarget.checked)}
                />
                <span class="truncate text-fg">{p.name}</span>
                <span class="ml-auto truncate text-[10px] text-faint" title={p.path}>{p.path}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- ── Client side: attach to a master ──────────────────────── -->
    <section class="mb-6">
      <h3 class="mb-2 flex items-center justify-between text-xs font-semibold tracking-wide text-faint uppercase">
        <span class="flex items-center gap-1.5"><Radio size={13} /> Attach — watch a master</span>
        <button
          class="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
          onclick={() => (showAddHost = !showAddHost)}
          title="Add master"
        >
          <Plus size={13} />
        </button>
      </h3>

      {#if showAddHost}
        <div class="mb-3 rounded-lg border border-border bg-surface-2 p-3">
          <div class="grid grid-cols-2 gap-2 text-[13px]">
            <input bind:value={newName} placeholder="Name (master-mac)" class="rounded border border-border bg-surface px-2 py-1 text-fg" />
            <input bind:value={newHost} placeholder="tailnet host / IP" class="rounded border border-border bg-surface px-2 py-1 text-fg" />
            <input bind:value={newPort} placeholder="port" class="rounded border border-border bg-surface px-2 py-1 text-fg" />
            <input bind:value={newToken} placeholder="shared token" class="rounded border border-border bg-surface px-2 py-1 text-fg" />
          </div>
          <button class="mt-2 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white" onclick={addHost}>
            Save
          </button>
        </div>
      {/if}

      {#each hosts as h (h.id)}
        <div class="mb-2 rounded-lg border border-border bg-surface-2 p-3">
          <div class="mb-2 flex items-center gap-2">
            <span class="text-[13px] font-medium text-fg">{h.name}</span>
            <span class="font-mono text-[11px] text-faint">{h.host}:{h.port}</span>
            <button
              class="ml-auto rounded p-1 text-muted hover:bg-surface-3 hover:text-fg"
              onclick={() => listSessions(h.id)}
              title="List sessions"
            >
              <RefreshCw size={12} />
            </button>
            <button
              class="rounded p-1 text-muted hover:bg-red-500/20 hover:text-red-400"
              onclick={() => removeHost(h.id)}
              title="Remove"
            >
              <Trash2 size={12} />
            </button>
          </div>

          {#each sessions[h.id] ?? [] as s (s.threadId)}
            <div class="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-surface-3">
              <button
                class="truncate text-left text-fg hover:text-accent"
                onclick={() => attach(h.id, s.threadId)}
              >
                {s.title || s.threadId}
              </button>
              <span class="text-[10px] text-faint">{s.status}</span>
              {#if s.lastCheckpointSha}
                <button
                  class="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted hover:bg-surface-3 hover:text-fg"
                  onclick={() => pullToTest(h.id, s.threadId)}
                  disabled={pulling}
                  title="Pull checkpoint into a worktree"
                >
                  <Download size={11} /> Pull to test
                </button>
              {/if}
            </div>
          {/each}
          {#if sessions[h.id] && (sessions[h.id]?.length ?? 0) === 0}
            <p class="px-2 py-1 text-xs text-faint">No sessions served.</p>
          {/if}
          {#if pullResult && attached?.hostId === h.id}
            <div class="mt-2 rounded border border-green-500/30 bg-green-500/10 px-2 py-1.5 text-[11px] text-green-400">
              Pulled <span class="font-mono">{pullResult.sha.slice(0, 8)}</span> →
              <span class="font-mono">{pullResult.worktreePath}</span>
            </div>
          {/if}
        </div>
      {/each}
    </section>

    <!-- ── Attached read-only transcript ────────────────────────── -->
    {#if attached}
      <section>
        <h3 class="mb-2 flex items-center justify-between text-xs font-semibold tracking-wide text-faint uppercase">
          <span>Attached — {attached.threadId.slice(0, 8)}</span>
          <span class="flex items-center gap-2">
            <span class="text-faint normal-case">{tapStatus}</span>
            <button class="rounded-md px-2 py-0.5 text-[11px] text-muted hover:bg-surface-3 hover:text-fg" onclick={detach}>
              detach
            </button>
          </span>
        </h3>
        <div class="rounded-lg border border-border bg-surface p-3">
          {#each remoteTranscript as item (item.id)}
            {#if item.kind === "user"}
              <div class="mb-2 text-[13px] text-fg">
                <span class="text-xs text-faint">you</span>
                <p class="whitespace-pre-wrap">{item.text}</p>
              </div>
            {:else if item.kind === "assistant"}
              <div class="mb-2 text-[13px] text-fg">
                <StreamingText text={item.text} streaming={item.streaming} revealKey={item.id} />
              </div>
            {:else if item.kind === "tool"}
              <div class="mb-2 rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted">
                <span class="font-mono text-accent">{item.toolName}</span> {item.argsSummary}
              </div>
            {:else if item.kind === "notice"}
              <div class="mb-2 text-[11px] text-faint">{item.text}</div>
            {/if}
          {/each}
          {#if remoteTranscript.length === 0}
            <p class="text-xs text-faint">No transcript yet — waiting for the master…</p>
          {/if}
        </div>
      </section>
    {/if}
  </div>
</div>
