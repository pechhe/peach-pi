<script lang="ts">
  import { onDestroy } from "svelte";
  import { isNewThread, type Thread, type TranscriptItem } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;
  type Row =
    | { type: "item"; item: TranscriptItem }
    | { type: "group"; id: string; items: ToolItem[] };
  import { transcripts } from "../stores/transcripts.svelte";
  import { drafts } from "../stores/composer.svelte";
  import { mapTurns } from "../lib/transcript/turns";
  import { playClick } from "../lib/sound/button-click-sound";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import Composer from "./Composer.svelte";
  import GitWidget from "./GitWidget.svelte";
  import DevTapWidget from "./DevTapWidget.svelte";
  import Workflow from "@lucide/svelte/icons/workflow";
  import ArrowDownToDot from "@lucide/svelte/icons/arrow-down-to-dot";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Circle from "@lucide/svelte/icons/circle";
  import { parseSkillInvocation } from "../lib/composer/skill-message";
  import { skillViewer } from "../stores/skill-viewer.svelte";
  import Markdown from "./Markdown.svelte";
  import StreamingText from "./StreamingText.svelte";
  import CopyButton from "./CopyButton.svelte";
  import RewindDialog from "./RewindDialog.svelte";
  import { codeCopy } from "../lib/code-copy";
  import WorkingLabel from "./WorkingLabel.svelte";
  import BrailleSpinner from "./BrailleSpinner.svelte";
  import SubagentCard from "./SubagentCard.svelte";
  import { collectAgents } from "../lib/subagent/journey.svelte";
  import { FLEET_WIDGET_KEY, parseFleet, type FleetAgent } from "../lib/subagent/fleet";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { recording } from "../stores/recording.svelte";
  import { lightbox } from "../stores/lightbox.svelte";
  import { terminal } from "../stores/terminal.svelte";
  import FindBar from "./FindBar.svelte";

  let { thread, onSetEnvironment, onOpenGraph, onSelectThread, onNewThread, pendingFind, onFindConsumed }: {
    thread: Thread;
    /** Flip a brand-new (unsent) thread between its project dir and a worktree. */
    onSetEnvironment?: (threadId: string, worktree: boolean) => void | Promise<void>;
    onOpenGraph: () => void;
    /** Navigate to a thread (used by the DevTap install action). */
    onSelectThread?: (threadId: string) => void;
    /** Start a new thread in the current project (`/new` system command). */
    onNewThread?: () => void;
    /** Set when the search overlay passes a body-match query through. ThreadView
     *  opens its FindBar pre-filled and calls `onFindConsumed` once applied. */
    pendingFind?: string | null;
    onFindConsumed?: () => void;
  } = $props();


  // ── Environment toggle (Local ⇄ Worktree) ──────────────────────────
  // The real flip (git worktree add/remove + session respawn) takes a beat,
  // and the button label only reflects `thread.worktreeDir` after the snapshot
  // refreshes. Optimistically flip the label on click, keyed to this thread id,
  // and let the snapshot catch up — reverting if the IPC call rejects.
  let envOverride = $state<{ id: string; worktree: boolean } | null>(null);
  const isWorktree = $derived(
    envOverride && envOverride.id === thread.id
      ? envOverride.worktree
      : thread.worktreeDir != null,
  );
  $effect(() => {
    if (
      envOverride &&
      envOverride.id === thread.id &&
      (thread.worktreeDir != null) === envOverride.worktree
    ) {
      envOverride = null;
    }
  });
  async function toggleEnvironment() {
    const target = !isWorktree;
    envOverride = { id: thread.id, worktree: target };
    playClick("down");
    try {
      await onSetEnvironment?.(thread.id, target);
    } catch {
      envOverride = null; // revert label on failure
    }
  }

  // ── In-thread find (⌘F) ─────────────────────────────────────────────
  let findOpen = $state(false);
  let findQuery = $state("");
  let findIndex = $state(0);
  let findBar = $state<FindBar | null>(null);

  // When a search-overlay body-match is clicked, open the FindBar with the
  // original search term so the user lands directly on the relevant text.
  $effect(() => {
    const pf = pendingFind;
    if (pf) {
      skipNextReset = true;
      findQuery = pf;
      findOpen = true;
      // findMatches is a derived that re-computes when accessed; length is
      // already up-to-date because this effect runs after findQuery changed.
      findIndex = Math.max(0, findMatches.length - 1);
      onFindConsumed?.();
    }
  });

  function onKeydown(e: KeyboardEvent) {
    // ⌃` toggles the integrated terminal (VS Code muscle memory).
    if (e.ctrlKey && e.key === "`") {
      e.preventDefault();
      terminal.toggle();
      return;
    }
    // Escape closes the find bar even when the input isn't focused.
    if (e.key === "Escape" && findOpen) {
      e.preventDefault();
      closeFind();
      return;
    }
    // ⌘F opens a thread-scoped find bar (not the global ⌘K palette).
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault();
      if (findOpen) {
        findBar?.focus();
      } else {
        findOpen = true;
      }
      return;
    }
  }

  // Text of a transcript item, flattened across its searchable fields.
  /** Compact token count for the compaction card: 1234 → "1k", 950 → "950". */
  function fmtTokens(n: number): string {
    return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
  }

  function itemText(it: unknown): string {
    const i = it as Record<string, unknown>;
    return [i.text, i.thinking, i.output, i.summary, i.argsSummary]
      .filter((v): v is string => typeof v === "string")
      .join(" ")
      .toLowerCase();
  }

  // pi-subagents injects a completion steer message into the parent
  // conversation when a child finishes. These contain session paths and
  // resume commands that are noise in the GUI — the SubagentCard already
  // shows the result in its journey timeline. Detect and suppress them.
  const STEER_RE = /^Sub-agent ".+?" completed/;
  function isSteerMessage(item: { kind: string; text?: string }): boolean {
    // Steer/result messages arrive as role=system, recorded as kind "notice",
    // not "assistant". Match by text pattern regardless of kind.
    return typeof item.text === "string" && STEER_RE.test(item.text);
  }

  const findMatches = $derived.by(() => {
    const q = findQuery.trim().toLowerCase();
    if (!findOpen || !q) return [] as string[];
    return items.filter((it) => itemText(it).includes(q)).map((it) => it.id);
  });

  const currentMatchId = $derived(findMatches[findIndex] ?? null);

  // Clamp findIndex if matches change (e.g. items loaded after pendingFind
  // set the index based on an empty list). Keeps the orange highlight correct.
  $effect(() => {
    const len = findMatches.length;
    if (len > 0 && findIndex >= len) findIndex = len - 1;
  });

  // Reset to the first match whenever the query changes, UNLESS a pending-find
  // from ⌘K is in flight (it sets findIndex to the last match itself).
  let skipNextReset = false;
  $effect(() => {
    void findQuery;
    if (skipNextReset) {
      skipNextReset = false;
    } else {
      findIndex = 0;
    }
  });

  // Scroll the active match into view, expanding any collapsed <details>
  // (thinking / tool / compaction blocks) so the matched text is visible.
  // Force-open only — never force-closed — so manual toggles are preserved.
  $effect(() => {
    const id = currentMatchId;
    if (!id || !scrollEl) return;
    const el = scrollEl.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.querySelectorAll("details").forEach((d) => (d.open = true));
    // Reveal collapsed ancestors too (e.g. a folded tool-call group).
    let p = el.parentElement;
    while (p && p !== scrollEl) {
      if (p instanceof HTMLDetailsElement) p.open = true;
      p = p.parentElement;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  // Highlight the matched term itself via the CSS Custom Highlight API. This
  // paints over Range objects without mutating the DOM, so it survives the
  // {@html}/per-word-span rebuilds in Markdown/StreamingText. Two registers:
  // every hit in dim, the current block's hits brighter.
  const HL = "thread-find";
  const HL_CUR = "thread-find-current";
  function clearHighlights() {
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    reg?.delete(HL);
    reg?.delete(HL_CUR);
  }
  function addRanges(root: Element, needle: string, hl: { add: (r: Range) => void }) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue?.toLowerCase();
      if (!text) continue;
      let from = 0;
      let idx = text.indexOf(needle, from);
      while (idx !== -1) {
        const range = new Range();
        range.setStart(node, idx);
        range.setEnd(node, idx + needle.length);
        hl.add(range);
        from = idx + needle.length;
        idx = text.indexOf(needle, from);
      }
    }
  }
  $effect(() => {
    const q = findQuery.trim().toLowerCase();
    void currentMatchId;
    void items; // re-scan as streamed content / matches change
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const Hl = (globalThis as unknown as { Highlight?: new () => { add: (r: Range) => void } })
      .Highlight;
    if (!reg || !Hl || !findOpen || !q || !scrollEl) {
      clearHighlights();
      return;
    }
    // Wait a frame so the latest transcript DOM is in place.
    const raf = requestAnimationFrame(() => {
      const all = new Hl();
      const cur = new Hl();
      for (const id of findMatches) {
        const el = scrollEl!.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
        if (!el) continue;
        addRanges(el, q, id === currentMatchId ? cur : all);
      }
      reg.set(HL, all);
      reg.set(HL_CUR, cur);
    });
    return () => cancelAnimationFrame(raf);
  });
  onDestroy(clearHighlights);

  function findNext() {
    if (findMatches.length === 0) return;
    findIndex = (findIndex + 1) % findMatches.length;
  }
  function findPrev() {
    if (findMatches.length === 0) return;
    findIndex = (findIndex - 1 + findMatches.length) % findMatches.length;
  }
  function closeFind() {
    findOpen = false;
    findQuery = "";
    clearHighlights();
  }

  let scrollEl = $state<HTMLElement | null>(null);
  let didInitialScroll = $state(false);

  const items = $derived(transcripts.itemsFor(thread.id));
  // The composer centres (and the transcript hides) until the first message.
  // Title-based check distinguishes a genuinely-new thread from an existing
  // thread whose history is still loading asynchronously (items briefly []):
  // a resumed thread has a real title from frame 1, so it never centres/flips
  // and never triggers the dock animation.
  const isEmpty = $derived(items.length === 0 && isNewThread(thread.title));

  // ── Composer docking (FLIP) ─────────────────────────────────────────
  // The composer node is shared between the centred new-thread state and the
  // bottom-docked state. When the first message promotes the thread, FLIP the
  // composer from its old (centred) box down to its new (docked) box so it
  // glides into place: fast off the line, easing exponentially as it docks.
  let dockEl = $state<HTMLElement | null>(null);
  let dockFirstTop = 0;
  // undefined until the first observation. Only a genuinely-new thread (still
  // placeholder title) can trip isEmpty true→false, so resumed threads never
  // animate — and a real first message on a new thread animates exactly once.
  let prevEmpty: boolean | undefined;
  $effect.pre(() => {
    const empty = isEmpty;
    if (prevEmpty === true && !empty && dockEl) {
      dockFirstTop = dockEl.getBoundingClientRect().top;
    }
  });
  $effect(() => {
    const empty = isEmpty;
    if (prevEmpty === true && !empty && dockEl) {
      const dy = dockFirstTop - dockEl.getBoundingClientRect().top;
      if (dy !== 0) {
        dockEl.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
          // Sharp launch, extended decaying tail — composer drifts to rest.
          { duration: 1600, easing: "cubic-bezier(0.04, 0.9, 0.02, 1)" },
        );
      }
    }
    prevEmpty = empty;
  });
  // True when the user has scrolled away from the bottom of the transcript.
  let scrolledUp = $state(false);

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

  // Subagent cards: group every subagent launch in the transcript into one
  // persistent entity per agent name; the introducing call renders it.
  const agentTimeline = $derived(collectAgents(items));
  // Live progress, parsed from the pi-subagents "subagent-status" widget feed.
  const fleet = $derived.by(() => {
    const w = extensionUi.widgetsFor(thread.id).find((x) => x.key === FLEET_WIDGET_KEY);
    const parsed = w ? parseFleet(w.lines) : null;
    const map = new Map<string, FleetAgent>();
    for (const a of parsed?.agents ?? []) map.set(a.name, a);
    return map;
  });

  // Collapse runs of successful ("done") tool calls into a single foldable
  // group row. Running/error tools — and lone successes — stay as their own
  // rows so anything that needs eyes is never hidden.
  const rows = $derived.by(() => {
    const out: Row[] = [];
    let group: ToolItem[] = [];
    const flush = () => {
      if (group.length === 0) return;
      if (group.length === 1) out.push({ type: "item", item: group[0]! });
      else out.push({ type: "group", id: `toolgroup-${group[0]!.id}`, items: group });
      group = [];
    };
    for (const it of items) {
      if (it.kind === "tool" && it.status === "done") {
        group.push(it);
      } else {
        flush();
        out.push({ type: "item", item: it });
      }
    }
    flush();
    return out;
  });

  // ── Rewind (pi session tree + git file revert) ──────────────────────
  // pi keeps every turn as an append-only tree; rewinding moves the leaf to
  // before a turn (the abandoned turns stay in the file, but drop out of the
  // active branch). When the thread is git-backed, file changes made during
  // the rewound turns can also be reverted (destructive — see confirm copy).
  let turns = $state<{ entryId: string; text: string }[]>([]);
  // Greyed-out preview of the turns just rewound past, scoped to this thread.
  // Captured from the pre-rewind transcript; the dropped tail is derived once
  // the live transcript actually shrinks (the reset lands a tick after the
  // rewind call resolves), so the preview never flashes or vanishes early.
  let rewound = $state<{
    threadId: string;
    before: TranscriptItem[];
    beforeLen: number;
    settledLen: number | null;
  } | null>(null);
  // Two-click arm so a stray click can't silently drop a turn.
  // Revert file changes too (only offered on git-backed threads). Default on.
  let revertFiles = $state(true);
  const canRevert = $derived(thread.worktreeDir != null || thread.projectId != null);
  // Confirmation dialog state. pendingRewind holds the armed target.
  let rewindDialogOpen = $state(false);
  let pendingRewind = $state<{
    entryId: string;
    promptPreview: string;
    turnCount: number;
  } | null>(null);

  // Refetch the turn list (entry ids) whenever the conversation settles.
  $effect(() => {
    void items.length;
    const id = thread.id;
    if (thread.status === "running") return;
    void api.invoke("threads:listTurns", id).then((t) => {
      if (thread.id === id) turns = t;
    }).catch(() => {});
  });

  // Map the kth `user` transcript item to the kth fork entry id (pure helper),
  // so a rewind button can target the right session-tree node.
  const turnMap = $derived(mapTurns(items, turns));

  // Clear the greyed preview once it no longer matches the live transcript
  // (a new message extended the thread, or we switched threads).
  $effect(() => {
    const r = rewound;
    if (!r) return;
    if (r.threadId !== thread.id) {
      rewound = null;
    } else if (r.settledLen === null) {
      // The reset has landed once the transcript drops below its pre-rewind length.
      if (items.length < r.beforeLen) rewound = { ...r, settledLen: items.length };
    } else if (items.length !== r.settledLen) {
      // Thread moved on (new message) or switched away — drop the preview.
      rewound = null;
    }
  });

  // Arm the confirmation dialog for the turn that starts at `entryId`.
  function openRewindDialog(entryId: string): void {
    const turnIndex = turns.findIndex((t) => t.entryId === entryId);
    if (turnIndex < 0) return;
    pendingRewind = {
      entryId,
      promptPreview: turns[turnIndex]!.text,
      turnCount: turns.length - turnIndex,
    };
    rewindDialogOpen = true;
  }

  function confirmRewind(): void {
    const p = pendingRewind;
    if (!p) return;
    pendingRewind = null;
    rewindDialogOpen = false;
    void doRewind(p.entryId, canRevert && revertFiles);
  }

  async function doRewind(entryId: string, revert: boolean) {
    const before = items.slice();
    try {
      const { editorText } = await api.invoke("threads:rewind", thread.id, entryId, revert);
      rewound = { threadId: thread.id, before, beforeLen: before.length, settledLen: null };
      if (editorText) drafts.update(thread.id, { text: editorText });
    } catch (err) {
      console.error("rewind failed", err);
    }
  }

  // `/rewind [n]` from the composer — rewind the n-th turn from the end
  // (reverts files by default on git-backed threads).
  function rewindFromEnd(n: number): void {
    if (turns.length === 0) return;
    const target = turns[Math.max(0, turns.length - Math.max(1, n))];
    const keepCount = target ? turnMap.keepByEntry.get(target.entryId) : undefined;
    if (target && keepCount != null) openRewindDialog(target.entryId);
  }

  // "bash ×4 · read ×2" — ordered by first appearance.
  function toolBreakdown(group: ToolItem[]): string {
    const counts = new Map<string, number>();
    for (const it of group) {
      const name = it.toolName || "tool";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(" · ");
  }

  // Distance from the bottom we still treat as "following". Small: only a
  // genuine return to the bottom re-arms the pin.
  const NEAR_BOTTOM = 24;
  let lastScrollTop = 0;

  // Detect intent by DIRECTION, not distance-to-bottom. A distance test can't
  // tell "user nudged up 80px" from "near bottom", and streaming token growth
  // never moves scrollTop — so direction is unambiguous:
  //   • scrollTop decreased  → user scrolled up   → stop following.
  //   • within NEAR_BOTTOM    → at the bottom      → resume following.
  // Programmatic pins only ever increase scrollTop to the bottom, so they
  // land in the second case and never falsely trip scrolledUp.
  function onScroll() {
    const el = scrollEl;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Direction wins over distance: an upward nudge counts as intent even
    // inside the NEAR_BOTTOM band, otherwise a slow scroll up never escapes
    // the band — onScroll keeps re-arming the pin and snaps the user back.
    if (el.scrollTop < lastScrollTop) scrolledUp = true;
    else if (gap <= NEAR_BOTTOM) scrolledUp = false;
    lastScrollTop = el.scrollTop;
  }

  // Trackpad/wheel up is intent even before the scroll lands; set immediately
  // so a pin queued for this frame can't beat the user to it.
  function onWheel(e: WheelEvent) {
    if (e.deltaY < 0) scrolledUp = true;
  }

  function scrollToBottom() {
    const el = scrollEl;
    if (!el) return;
    scrolledUp = false;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  $effect(() => {
    void transcripts.ensure(thread.id);
  });

  // On open, jump to the very bottom; afterwards, only pin to bottom
  // while streaming if the user hasn't scrolled up to read history.
  $effect(() => {
    void items;
    const el = scrollEl;
    if (!el) return;
    if (!didInitialScroll) {
      // Wait for history to load before the initial jump.
      if (items.length === 0) return;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        didInitialScroll = true;
      });
      return;
    }
    if (!scrolledUp) {
      requestAnimationFrame(() => {
        // Re-check at fire time: the user may have scrolled up between the
        // effect run (which queued this frame) and now. Without this, a token
        // mid-scroll yanks them back to the bottom.
        if (!scrolledUp) el.scrollTop = el.scrollHeight;
      });
    }
  });

  // Keep the bottom pinned whenever content height changes (streaming text,
  // tool output, the working indicator) or the scroll area itself resizes
  // (e.g. the composer grows after attaching an image). The transcript's
  // box size stays fixed while messages stream, so we must observe the inner
  // content wrapper, whose height grows. Re-pin only if the user hasn't
  // scrolled up to read history.
  $effect(() => {
    const el = scrollEl;
    if (!el || !didInitialScroll) return;
    const content = el.firstElementChild;
    const pin = () => {
      if (!scrolledUp) el.scrollTop = el.scrollHeight;
    };
    const ro = new ResizeObserver(pin);
    ro.observe(el);
    if (content) ro.observe(content);
    return () => ro.disconnect();
  });

</script>

<div class="flex h-full flex-1 flex-col">
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
    {#each extensionUi.statusesFor(thread.id) as status (status)}
      <span class="shrink-0 rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[10px] text-muted">
        {status}
      </span>
    {/each}
    <div class="ml-auto flex items-center gap-1">
      <GitWidget {thread} />
      {#if thread.projectId}
        <DevTapWidget {thread} {onSelectThread} />
      {/if}
      {#if thread.projectId}
        <button
          class="rounded px-2 py-0.5 text-[11px] text-faint hover:bg-surface hover:text-fg-soft"
          onclick={onOpenGraph}
          title="Project knowledge graph"
          data-testid="graph-toggle"><Workflow size={14} /></button
        >
      {/if}
      <button
        class="rounded px-2 py-0.5 text-faint hover:bg-surface hover:text-fg-soft"
        onclick={() => api.invoke('app:openFolder', thread.id)}
        title="Open folder in Finder"
        data-testid="open-folder"
      ><FolderOpen size={14} /></button
      >
      <button
        class="rounded px-2 py-0.5 font-mono text-[11px] {terminal.visible
          ? 'bg-surface-2 text-fg'
          : 'text-faint hover:bg-surface hover:text-fg-soft'}"
        onclick={() => terminal.toggle()}
        title="Toggle terminal (⌃`)"
        data-testid="terminal-toggle">&gt;_</button
      >
    </div>
    {/if}
  </header>

  {#if !isEmpty}
  <div class="relative flex min-h-0 flex-1 flex-col">
    {#if findOpen}
      <FindBar
        bind:this={findBar}
        bind:query={findQuery}
        current={findMatches.length ? findIndex + 1 : 0}
        total={findMatches.length}
        onNext={findNext}
        onPrev={findPrev}
        onClose={closeFind}
      />
    {/if}
    <div
      bind:this={scrollEl}
      class="flex flex-1 flex-col overflow-y-auto px-6 py-5"
      data-testid="transcript"
      onscroll={onScroll}
      onwheel={onWheel}
    >
    <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3">
      {#if items.length === 0}
        <div class="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p class="text-[15px] font-medium text-muted">What are we building?</p>
          <p class="text-xs text-fainter">Enter to send · / for commands · ⌘P plan mode · ⌃` terminal</p>
        </div>
      {/if}
      {#snippet toolRow(item: ToolItem)}
        <details class="item-enter group -my-1.5 text-xs" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>
          <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors select-none hover:bg-surface">
            {#if item.status === "running"}
              <BrailleSpinner class="working-label__spinner shrink-0" />
            {:else if item.status === "error"}
              <span class="shrink-0 text-danger">✕</span>
            {:else}
              <span class="shrink-0 text-fainter">✓</span>
            {/if}
            <span class="shrink-0 font-mono font-medium text-muted">{item.toolName}</span>
            <span class="truncate font-mono text-fainter">{item.argsSummary}</span>
            <span class="ml-auto shrink-0 text-fainter transition-transform group-open:rotate-90">›</span>
          </summary>
          {#if item.output}
            <pre class="mx-2 mt-1 max-h-64 overflow-auto rounded-lg border border-border/80 bg-surface/60 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted select-text">{item.output}</pre>
          {/if}
        </details>
      {/snippet}
      {#each rows as row (row.type === "group" ? row.id : row.item.id)}
        {#if row.type === "group"}
          <details class="item-enter group/tools -my-1.5 text-xs" data-item-id={row.id}>
            <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors select-none hover:bg-surface">
              <span class="shrink-0 text-fainter">✓</span>
              <span class="shrink-0 font-mono font-medium text-muted">{row.items.length} tool calls</span>
              <span class="truncate font-mono text-fainter">{toolBreakdown(row.items)}</span>
              <span class="ml-auto shrink-0 text-fainter transition-transform group-open/tools:rotate-90">›</span>
            </summary>
            <div class="mt-1 flex flex-col border-l-2 border-border pl-1.5">
              {#each row.items as it (it.id)}
                {@render toolRow(it)}
              {/each}
            </div>
          </details>
        {:else}
          {@const item = row.item}
          {#if item.kind === "user"}
          <div class="item-enter flex max-w-[85%] flex-col gap-2 self-end" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>
            {#if item.images && item.images.length > 0}
              <div class="flex flex-wrap justify-end gap-2">
                {#each item.images as img, i (i)}
                  <button
                    type="button"
                    class="block cursor-zoom-in"
                    onclick={() => lightbox.open(`data:${img.mimeType};base64,${img.data}`)}
                    title="Click to enlarge"
                  >
                    <img
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt="Attached image"
                      class="h-28 w-28 rounded-lg border border-border-strong/40 object-cover"
                    />
                  </button>
                {/each}
              </div>
            {/if}
            {#if item.text}
              {@const skill = parseSkillInvocation(item.text)}
              {#if skill}
                <button
                  type="button"
                  class="skill-chip self-end"
                  onclick={() => skillViewer.open(skill)}
                  title="View skill"
                  data-testid="skill-chip"
                >
                  <BookOpen size={12} />
                  <span>{skill.name}</span>
                </button>
                {#if skill.args}
                  <div class="rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg select-text">
                    {skill.args}
                  </div>
                {/if}
              {:else}
                <div class="rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg select-text">
                  {item.text}
                </div>
              {/if}
            {/if}
          </div>
        {:else if item.kind === "assistant" && !isSteerMessage(item)}
          <!-- Guard against a stuck cursor: a dropped/late message_end leaves
               item.streaming true forever. The thread can only have one open
               assistant message, so once the thread is no longer running no
               item is genuinely streaming. -->
          {@const isStreaming = item.streaming && thread.status === "running"}
          <!-- Thinking phase: still streaming with reasoning but no answer text
               yet. The cursor belongs next to whatever is actively growing, so
               it sits inside the thinking block here and after the answer once
               text begins. -->
          {@const inThinking = isStreaming && !!item.thinking && !item.text}
          <div class="item-enter assistant-message group/assistant text-[13.5px] leading-relaxed text-fg select-text" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId} use:codeCopy={!isStreaming}>
            {#if item.thinking}
              <details class="group mb-1 text-xs text-faint" open={isStreaming && !item.text}>
                <summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-fg-soft">
                  <span class="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Thinking
                </summary>
                <div class="mt-1.5 border-l-2 border-border pl-3 leading-relaxed text-faint">
                  <StreamingText text={item.thinking} streaming={isStreaming} plain revealKey={`${item.id}:thinking`} />{#if inThinking}<span class="cursor-blink ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] rounded-full bg-faint"></span>{/if}
                </div>
              </details>
            {/if}
            <StreamingText text={item.text} streaming={isStreaming} revealKey={`${item.id}:text`} />{#if isStreaming && !inThinking}<span class="cursor-blink ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] rounded-full bg-fg-soft"></span>{/if}
            {#if item.error}
              <p class="mt-2 rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-1.5 text-xs text-danger">{item.error}</p>
            {/if}
            {#if !isStreaming && item.text}
              <div class="assistant-actions">
                <CopyButton text={item.text} />
                {#if thread.status !== "running" && turnMap.endById.has(item.id)}
                  {@const t = turnMap.endById.get(item.id)!}
                  <button
                    type="button"
                    class="copy-btn"
                    onclick={() => openRewindDialog(t.entryId)}
                    title="Rewind the conversation to before this turn"
                    data-testid="rewind-turn"
                  >
                    <Undo2 size={13} /> <span>Rewind</span>
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {:else if item.kind === "tool"}
          {@render toolRow(item)}
        {:else if item.kind === "subagent"}
          {#each agentTimeline.primaryNamesByCall.get(item.id) ?? [] as name (name)}
            {@const entity = agentTimeline.entities.get(name)}
            {#if entity}
              <div class="item-enter" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>
                <SubagentCard {entity} live={fleet.get(name)} />
              </div>
            {/if}
          {/each}
        {:else if item.kind === "compaction"}
          {#if item.running}
            <div class="item-enter w-full rounded-2xl border border-border-strong/40 bg-surface-2/40 px-4 py-3" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>
              <div class="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                <BrailleSpinner class="working-label__spinner shrink-0" />
                {item.reason === "manual" ? "Compacting…" : "Auto-compacting…"}
              </div>
              <p class="mt-1 text-xs text-faint italic">Summarising the conversation to free up context…</p>
            </div>
          {:else}
            {@const compacted = !item.error && !item.aborted}
            <details class="item-enter group w-full" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>
              <summary
                class="flex cursor-pointer items-center gap-2 rounded-lg border bg-surface/60 px-3 py-2 text-xs font-semibold text-muted transition-colors select-none hover:bg-surface {compacted
                  ? ''
                  : 'border-border-strong/30'}"
                style={compacted ? "border-color: oklch(0.6 0.16 52 / 0.45)" : ""}
              >
                <span class="shrink-0 opacity-70" style={compacted ? "color: oklch(0.6 0.16 52)" : ""}>⌘</span>
                <span
                  class="font-semibold {item.error ? 'text-danger' : ''}"
                  style={compacted ? "color: oklch(0.6 0.16 52)" : ""}
                >
                  {item.aborted
                    ? "Compaction aborted"
                    : item.error
                      ? "Compaction failed"
                      : item.reason === "manual"
                        ? "Context compacted"
                        : "Context compacted automatically"}
                </span>
                {#if item.tokensBefore && item.tokensAfter}
                  <span class="font-medium text-faint">· {fmtTokens(item.tokensBefore)} → {fmtTokens(item.tokensAfter)} tokens</span>
                {:else if item.tokensBefore}
                  <span class="font-medium text-faint">· {fmtTokens(item.tokensBefore)} summarised</span>
                {/if}
                {#if item.summary || item.error}
                  <span class="ml-auto shrink-0 text-fainter transition-transform group-open:rotate-90">›</span>
                {/if}
              </summary>
              {#if item.error}
                <p class="mx-1 mt-1.5 rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-2 text-xs text-danger">{item.error}</p>
              {:else if item.summary}
                <div class="mx-1 mt-1.5 rounded-lg border border-border/80 bg-surface/40 px-3 py-2 text-xs leading-relaxed text-fg-soft">
                  <Markdown text={item.summary} />
                </div>
              {/if}
            </details>
          {/if}
          {:else if isSteerMessage(item)}
            <!-- steer messages already surfaced in SubagentCard journey — skip -->
          {:else}
            <p class="item-enter text-center text-xs text-faint italic" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>{item.text}</p>
          {/if}
        {/if}
      {/each}
      {#if rewound && rewound.settledLen !== null && rewound.threadId === thread.id}
        {@const tail = rewound.before.slice(rewound.settledLen)}
        {#if tail.length > 0}
          <div class="rewound-divider"><span>Rewound · {tail.length} item{tail.length === 1 ? "" : "s"} dropped from context</span></div>
          <div class="rewound-tail" aria-hidden="true">
            {#each tail as it (it.id)}
              <div class="rewound-item">{itemText(it).slice(0, 280) || "(…)"}</div>
            {/each}
          </div>
        {/if}
      {/if}
      {#if thread.status === "running" && !items.some((i) => i.kind === "assistant" && i.streaming)}
        <div class="item-enter text-[13px]">
          <WorkingLabel label="Working…" />
        </div>
      {/if}
    </div>
    </div>
    {#if scrolledUp && didInitialScroll}
      <button
        type="button"
        class="absolute bottom-2 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-strong bg-surface text-muted shadow-lg transition-colors hover:bg-surface-2 hover:text-fg-soft"
        onclick={scrollToBottom}
        title="Scroll to bottom"
        data-testid="scroll-to-bottom"
      >
        <ArrowDownToDot size={18} />
      </button>
    {/if}
  </div>

  {#each extensionUi.widgetsFor(thread.id).filter((w) => w.key !== FLEET_WIDGET_KEY) as widget (widget.key)}
    <div class="mx-6 mb-1 shrink-0 rounded-lg border border-border bg-surface/60 px-3 py-2" data-testid="extension-widget">
      <pre class="overflow-x-auto font-mono text-[10px] leading-relaxed text-muted">{widget.lines.join("\n")}</pre>
    </div>
  {/each}
  {/if}

  <div bind:this={dockEl} class="composer-dock" class:composer-dock--centered={isEmpty}>
    {#if isEmpty && thread.projectId}
      <div class="composer-device new-thread__bar">
        <button
          type="button"
          class="new-thread__environment"
          aria-pressed={isWorktree}
          onmousedown={(e) => e.preventDefault()}
          onclick={toggleEnvironment}
          data-testid="environment-toggle"
          title={isWorktree
            ? "Working in an isolated git worktree"
            : "Working in the project directory"}
        >
          {isWorktree ? "⎇ Worktree" : "◈ Local"}
        </button>
        <button
          type="button"
          class="new-thread__record"
          onclick={() => recording.start(thread.id)}
          data-testid="start-recording"
          title="Record a desktop task → synthesize a skill in this chat"
          aria-label="Start recording"
        >
          <Circle size={11} class="fill-red-500 text-red-500" />
          <span>Record</span>
        </button>
      </div>
    {/if}
    <Composer {thread} onRewind={rewindFromEnd} {onNewThread} centered={isEmpty} />
  </div>
  <RewindDialog
    bind:open={rewindDialogOpen}
    bind:revertFiles
    {canRevert}
    turnCount={pendingRewind?.turnCount ?? 1}
    promptPreview={pendingRewind?.promptPreview ?? ""}
    onConfirm={confirmRewind}
  />
</div>

<svelte:window onkeydown={onKeydown} />

<style>
  /* The composer normally sits at the bottom of the column. While composing a
     brand-new thread the transcript is hidden, so margin-block:auto centres
     the composer (and its environment toggle) vertically. The draft→real
     promotion keeps this same node, so the FLIP transform docks it down. */
  .composer-dock {
    flex-shrink: 0;
    will-change: transform;
  }
  .composer-dock--centered {
    margin-block: auto;
  }
  .new-thread__bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.75rem;
  }
  .new-thread__record {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    font-size: 11px;
    font-weight: 500;
    color: var(--color-faint);
    border: 1px solid var(--color-border-strong);
    border-radius: 0.375rem;
    background: var(--color-surface);
    transition: color 120ms ease, background 120ms ease;
  }
  .new-thread__record:hover {
    background: var(--color-surface-2);
    color: var(--color-fg);
  }

  :global(.thread-find-hit) {
    outline: 2px solid oklch(0.6 0.16 52 / 0.7);
    outline-offset: 3px;
    border-radius: 0.5rem;
  }
  .rewound-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0.75rem 0 0.25rem;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-fainter, oklch(0.6 0 0));
  }
  .rewound-tail {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    opacity: 0.4;
    filter: grayscale(0.6);
    pointer-events: none;
  }
  .rewound-item {
    font-size: 12px;
    line-height: 1.4;
    color: var(--color-faint, oklch(0.65 0 0));
    white-space: pre-wrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .animate-fade-in {
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
