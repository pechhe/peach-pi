<script lang="ts">
  import type { Thread } from "@peach-pi/shared-types";
  import { api } from "../../lib/ipc";
  import { remoteClient } from "../../stores/remote-client.svelte";
  import { piSettings } from "../../stores/pi-settings.svelte";
  import { extensionUi } from "../../stores/extension-ui.svelte";
  import { terminal } from "../../stores/terminal.svelte";
  import { workQueue } from "../../stores/work-queue.svelte";
  import { fmtTokens, fmtCost } from "./lib/group-prep-runs";
  import type { ForkTurn } from "../../lib/transcript/turns";
  import GitWidget from "../../app/GitWidget.svelte";
  import DevTapWidget from "../../app/DevTapWidget.svelte";
  import FallowWidget from "../../app/FallowWidget.svelte";
  import Tooltip from "../../app/Tooltip.svelte";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import GitPullRequest from "@lucide/svelte/icons/git-pull-request";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Play from "@lucide/svelte/icons/play";

  let {
    thread,
    isEmpty,
    sessionUsage,
    turns,
    onOpenForkPicker,
    onSelectThread,
  }: {
    thread: Thread;
    /** Brand-new (unsent) thread: header shows the title only. */
    isEmpty: boolean;
    sessionUsage: { input: number; cacheRead: number; output: number; cost: number; hasCost: boolean };
    turns: ForkTurn[];
    onOpenForkPicker: () => void;
    onSelectThread?: (threadId: string) => void;
  } = $props();

  // Fetch this machine's client identity once (used by control indicator).
  $effect(() => { remoteClient.init(); });

  // ── Copy session info on title click ────────────────────────────────
  let copiedToast = $state(false);
  function copySessionInfo() {
    if (!thread?.piSessionFile) return;
    const sessionId = thread.piSessionFile.replace(/^.*\//, '').replace(/\.jsonl$/, '');
    const text = `Session: ${sessionId}\nPath: ${thread.piSessionFile}`;
    void navigator.clipboard.writeText(text).then(() => {
      copiedToast = true;
      setTimeout(() => { copiedToast = false; }, 1500);
    });
  }

  // ── Per-thread dev server + merge affordances (issue-agent workflow) ─
  let devRunning = $state(false);
  let merging = $state(false);
  let mergeMsg = $state("");

  async function runDevServer() {
    if (!thread.projectId || devRunning) return;
    devRunning = true;
    mergeMsg = "";
    try {
      const script = await api.invoke("dev:detectCommand", thread.projectId);
      if (!script) {
        mergeMsg = "No dev script in package.json";
        return;
      }
      await api.invoke("terminal:runCommand", thread.id, `pnpm ${script}`);
      terminal.visible = true;
    } catch (e) {
      mergeMsg = `Couldn’t run dev server: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      devRunning = false;
    }
  }

  async function mergePr() {
    if (merging) return;
    merging = true;
    mergeMsg = "";
    try {
      const res = await api.invoke("git:mergePr", thread.id);
      if (!res.ok) {
        mergeMsg = `Merge failed: ${res.error}`;
        return;
      }
      // The PR’s `Closes #N` body auto-closes the linked issue on GitHub;
      // archive this worktree now that its branch is merged + deleted.
      if (thread.worktreeId) await api.invoke("worktrees:archive", thread.worktreeId);
      await workQueue.load(thread.projectId ?? null);
      onSelectThread?.(thread.id);
    } catch (e) {
      mergeMsg = `Merge failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      merging = false;
    }
  }
</script>

<header class="titlebar-drag flex h-12 shrink-0 items-center gap-2 px-4">
  {#if isEmpty}
    <span class="truncate text-sm font-medium text-fg-soft">{thread.title}</span>
  {:else}
  <button
    type="button"
    class="truncate text-sm font-medium text-fg-soft cursor-pointer hover:text-accent transition-colors"
    onclick={copySessionInfo}
    title={thread.piSessionFile ? 'Click to copy session ID and path' : thread.title}
  >
    {thread.title}
  </button>
  {#if copiedToast}
    <span class="shrink-0 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] text-muted animate-fade-in">
      Copied!
    </span>
  {/if}
  {#if sessionUsage.input > 0 || sessionUsage.output > 0}
    <span
      class="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] text-muted"
      style="font-variant-numeric: tabular-nums"
      data-testid="session-usage"
      title={`${fmtTokens(sessionUsage.input)} input (of which ${fmtTokens(sessionUsage.cacheRead)} cached reads) · ${fmtTokens(sessionUsage.output)} output this session${sessionUsage.hasCost ? ` · ${fmtCost(sessionUsage.cost)} estimated equivalent API cost` : ""}`}
    >
      <span class="inline-flex items-center gap-0.5"><ArrowUp size={10} />{fmtTokens(sessionUsage.input)}</span>
      <span class="inline-flex items-center gap-0.5"><ArrowDown size={10} />{fmtTokens(sessionUsage.output)}</span>
      {#if sessionUsage.hasCost}<span>· {fmtCost(sessionUsage.cost)}</span>{/if}
    </span>
  {/if}
  {#each extensionUi.statusesFor(thread.id) as status (status)}
    <span class="shrink-0 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] text-muted">
      {status}
    </span>
  {/each}
  {#if thread.remoteHostId}
    {@const inControl = !!remoteClient.id && thread.remoteControllerId === remoteClient.id}
    {@const controllerName = thread.remoteControllerName ?? "another client"}
    <span
      class="shrink-0 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] {inControl ? 'text-accent' : 'text-muted'}"
      title={inControl
        ? `You're steering on ${thread.remoteHostName ?? 'another machine'}`
        : `Steered by ${controllerName} on ${thread.remoteHostName ?? 'another machine'}`}
    >
      ⦿ {thread.remoteHostName ?? "remote"} · {inControl ? "in control" : controllerName}
    </span>
    {#if thread.remoteThreadId}
      <Tooltip text={inControl ? "Hand back control" : "Take control"}>
        <button
          class="rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft"
          onclick={() =>
            void api.invoke(
              inControl ? "remote:releaseControl" : "remote:takeControl",
              thread.remoteHostId!,
              thread.remoteThreadId!,
            )}
          data-testid="control-toggle"
        >{inControl ? "Hand back" : "Take control"}</button
        >
      </Tooltip>
    {/if}
  {/if}
  <div class="ml-auto flex items-center gap-1">
    {#if !thread.remoteHostId}
      <GitWidget {thread} />
    {/if}
    {#if thread.projectId}
      {#if piSettings.topbar.devtap}
        <DevTapWidget {thread} {onSelectThread} />
      {/if}
      {#if piSettings.topbar.fallow}
        <FallowWidget {thread} {onSelectThread} />
      {/if}
    {/if}
    {#if !thread.remoteHostId}
      <Tooltip text="Open in Finder">
        <button
          class="rounded px-2 py-0.5 text-faint hover:bg-surface hover:text-fg-soft"
          onclick={() => api.invoke('app:openFolder', thread.id)}
          data-testid="open-folder"
        ><FolderOpen size={14} /></button
        >
      </Tooltip>
      <Tooltip text="Fork thread (new thread from a past turn)">
        <button
          class="rounded px-2 py-0.5 text-faint hover:bg-surface hover:text-fg-soft disabled:opacity-50"
          onclick={onOpenForkPicker}
          disabled={!thread.piSessionFile || turns.length === 0}
          data-testid="fork-thread"
        ><GitBranch size={14} /></button
        >
      </Tooltip>
      <Tooltip text="Terminal (⌃`)">
        <button
          class="rounded px-2 py-0.5 font-mono text-[11px] {terminal.visible
            ? 'bg-surface-2 text-fg'
            : 'text-faint hover:bg-surface hover:text-fg-soft'}"
          onclick={() => terminal.toggle()}
          data-testid="terminal-toggle">&gt;_</button
        >
      </Tooltip>
      {#if thread.worktreeId}
        <Tooltip text="Run dev server in this worktree">
          <button
            class="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft disabled:opacity-50"
            onclick={runDevServer}
            disabled={devRunning}
            data-testid="run-dev-server"
          ><Play size={13} /> {devRunning ? "Starting…" : "Dev"}</button
          >
        </Tooltip>
        <Tooltip text="Merge this worktree's PR (squash + delete branch)">
          <button
            class="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft disabled:opacity-50"
            onclick={mergePr}
            disabled={merging || thread.status === 'running'}
            data-testid="merge-pr"
          ><GitPullRequest size={13} /> {merging ? "Merging…" : "Merge PR"}</button
          >
        </Tooltip>
      {/if}
      {#if mergeMsg}
        <span class="text-[10px] text-red-500" data-testid="merge-msg">{mergeMsg}</span>
      {/if}
    {/if}
  </div>
  {/if}
</header>

<style>
  .animate-fade-in {
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
