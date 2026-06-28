<script lang="ts">
  import type { Project, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import Eye from "@lucide/svelte/icons/eye";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";

  let {
    projects,
    threads,
    projectId,
    onSelectThread,
  }: {
    projects: Project[];
    threads: Thread[];
    projectId: string | null;
    onSelectThread: (threadId: string) => void;
  } = $props();

  const project = $derived(projectId ? (projects.find((p) => p.id === projectId) ?? null) : null);

  /** Threads parked for testing under this project, most-recent first. */
  const toTest = $derived(
    threads
      .filter((t) => t.projectId === projectId && t.toTestAt && !t.archivedAt)
      .sort((a, b) => (a.toTestAt! < b.toTestAt! ? 1 : -1)),
  );

  interface Row {
    feature: string;
    test: string;
  }

  /** The parked-for-testing prompt asks for a one-row `| Feature | Test |`
   *  markdown table; parse it, falling back to the raw note as the feature. */
  function parseNote(note: string | undefined): Row | null {
    if (!note) return null;
    const cells = note
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && l.endsWith("|"))
      .filter((l) => !/^\|[\s|:-]+\|$/.test(l)) // drop separator rows
      .map((l) => l.slice(1, -1).split("|").map((c) => c.trim()));
    const data = cells.filter((c) => c.length >= 2);
    if (data.length === 0) return { feature: note, test: "" };
    // Last data row wins (the prompt asks for one row; take the newest if more).
    const [feature, test] = data[data.length - 1]!;
    return { feature, test };
  }

  const fmt = (iso: string | undefined) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  // Reject flow: capture what went wrong, send it back to the thread as a new
  // message, drop the to-test mark (so it returns to the active list), and
  // open the thread in the main area.
  let rejectingId = $state<string | null>(null);
  let rejectText = $state("");

  function accept(thread: Thread) {
    void api.invoke("threads:archive", thread.id);
  }
  function openReject(thread: Thread) {
    rejectingId = thread.id;
    rejectText = "";
  }
  function cancelReject() {
    rejectingId = null;
    rejectText = "";
  }
  async function submitReject(thread: Thread) {
    const text = rejectText.trim();
    if (!text) return;
    await api.invoke("threads:prompt", thread.id, `Testing failed:\n\n${text}`);
    await api.invoke("threads:unmarkToTest", thread.id);
    rejectingId = null;
    rejectText = "";
    onSelectThread(thread.id);
  }
</script>

<main class="flex h-full flex-1 flex-col" data-testid="testing-view">
  <header class="titlebar-drag flex h-12 shrink-0 items-center justify-between px-6">
    <h1 class="text-sm font-medium text-fg-soft">
      Testing{#if project}<span class="text-faint"> · {project.name}</span>{/if}
    </h1>
    {#if toTest.length > 0}
      <span class="text-xs text-faint">{toTest.length} marked for test</span>
    {/if}
  </header>

  <div class="flex-1 overflow-y-auto px-6 pb-6">
    <div class="mx-auto flex max-w-3xl flex-col gap-3">
      {#each toTest as thread (thread.id)}
        {@const row = parseNote(thread.toTestNote)}
        <div class="rounded-lg border border-border bg-surface/50 px-4 py-3" data-testid="testing-card">
          <div class="flex items-center justify-between gap-3">
            <button
              class="min-w-0 text-left"
              onclick={() => onSelectThread(thread.id)}
              title="Open thread"
            >
              <span class="block truncate text-sm text-fg hover:text-accent">{thread.title || "Untitled"}</span>
            </button>
            <div class="flex shrink-0 items-center gap-2">
              <span class="text-xs text-faint">{fmt(thread.toTestAt)}</span>
              <button
                class="flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/25"
                title="Accept — move to Done"
                data-testid="testing-accept"
                onclick={() => accept(thread)}
              ><Check size={13} /> Accept</button>
              <button
                class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-danger"
                title="Reject — send feedback to the thread"
                data-testid="testing-reject"
                onclick={() => openReject(thread)}
              ><X size={13} /> Reject</button>
            </div>
          </div>
          {#if row}
            <div class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <span class="font-medium text-faint">Feature</span>
              <span class="text-fg-soft">{row.feature}</span>
              <span class="font-medium text-faint">Test</span>
              <span class="text-fg-soft">{row.test}</span>
            </div>
          {:else}
            <p class="mt-2 flex items-center gap-1.5 text-xs text-faint">
              <Eye size={12} /> Generating runthrough…
            </p>
          {/if}
          {#if rejectingId === thread.id}
            <div class="mt-3 flex flex-col gap-2" data-testid="testing-reject-box">
              <textarea
                bind:value={rejectText}
                rows="3"
                placeholder="What went wrong?"
                class="w-full resize-none rounded-md border border-border bg-surface px-2.5 py-2 text-xs text-fg placeholder:text-fainter focus:border-border-focus focus:outline-none"
                onkeydown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReject(thread);
                  if (e.key === "Escape") cancelReject();
                }}
              ></textarea>
              <div class="flex justify-end gap-2">
                <button
                  class="rounded-md px-2.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
                  onclick={cancelReject}
                >Cancel</button>
                <button
                  class="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
                  disabled={!rejectText.trim()}
                  data-testid="testing-reject-send"
                  onclick={() => submitReject(thread)}
                >Send & reopen</button>
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <p class="mt-8 text-center text-sm text-fainter">
          Nothing marked for testing in {project ? project.name : "this project"}.
        </p>
      {/each}
    </div>
  </div>
</main>
