<script lang="ts">
  import { onDestroy } from "svelte";
  import { isNewThread, type Thread, type TranscriptItem } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;
  type Row =
    | { type: "item"; item: TranscriptItem }
    | { type: "group"; id: string; items: TranscriptItem[]; hasThinking: boolean };

  /** Summary for a folded prep run. Thinking present → "Reasoning"; tools
   *  only → tool-name breakdown like the old tool group. */
  function groupSummary(items: readonly TranscriptItem[]): string {
    const tools = items.filter((it): it is ToolItem => it.kind === "tool");
    const hasThinking = items.some((it) => it.kind === "assistant");
    if (hasThinking) return tools.length ? `Reasoning · ${tools.length} tool calls` : "Reasoning";
    if (tools.length === 1) return tools[0]!.toolName || tools[0]!.argsSummary || "tool";
    return toolBreakdown(tools);
  }

  /** Collapse runs of successful ("done") tool calls AND thinking-only
   *  assistant items into one foldable reasoning card. Anything with real
   *  answer content (assistant-with-text, user, subagent, compaction, retry,
   *  notice, steer, running/error tools) flushes the run and stands alone. */
  function groupPrepRuns(all: readonly TranscriptItem[]): Row[] {
    const out: Row[] = [];
    let group: TranscriptItem[] = [];
    const flush = () => {
      if (group.length === 0) return;
      if (group.length === 1) {
        // A lone foldable item keeps its existing standalone render.
        out.push({ type: "item", item: group[0]! });
      } else {
        out.push({
          type: "group",
          id: `group-${group[0]!.id}`,
          items: group,
          hasThinking: group.some((it) => it.kind === "assistant"),
        });
      }
      group = [];
    };
    for (const it of all) {
      const foldable =
        (it.kind === "tool" && it.status === "done") ||
        (it.kind === "assistant" && !it.text.trim() && !it.error && !!it.thinking);
      if (foldable) group.push(it);
      else { flush(); out.push({ type: "item", item: it }); }
    }
    flush();
    return out;
  }
  import { transcripts } from "../stores/transcripts.svelte";
  import { sendAnim } from "../stores/send-anim.svelte";
  import { remoteClient } from "../stores/remote-client.svelte";
  import { drafts, queues } from "../stores/composer.svelte";
  import { mapTurns } from "../lib/transcript/turns";
  import { playClick } from "../lib/sound/button-click-sound";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import type { CompactionItem } from "./CompactionDialog.svelte";
  import CompactionDialog from "./CompactionDialog.svelte";
  import Composer from "./Composer.svelte";
  import GitWidget from "./GitWidget.svelte";
  import Tooltip from "./Tooltip.svelte";
  import DevTapWidget from "./DevTapWidget.svelte";
  import ArrowDownToDot from "@lucide/svelte/icons/arrow-down-to-dot";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Play from "@lucide/svelte/icons/play";
  import GitPullRequest from "@lucide/svelte/icons/git-pull-request";
  import Circle from "@lucide/svelte/icons/circle";
  import X from "@lucide/svelte/icons/x";
  import { parseSkillInvocation } from "../lib/composer/skill-message";
  import MessageBadges from "./MessageBadges.svelte";
  import { skillViewer } from "../stores/skill-viewer.svelte";
  import Markdown from "./Markdown.svelte";
  import StreamingText from "./StreamingText.svelte";
  import ThinkingBlock from "./ThinkingBlock.svelte";
  import CopyButton from "./CopyButton.svelte";
  import RewindDialog from "./RewindDialog.svelte";
  import ForkPickerDialog from "./ForkPickerDialog.svelte";
  import { codeCopy, clickCopy } from "../lib/code-copy";
  import WorkingLabel from "./WorkingLabel.svelte";
  import BrailleSpinner from "./BrailleSpinner.svelte";
  import SubagentCard from "./SubagentCard.svelte";
  import { collectAgents } from "../lib/subagent/journey.svelte";
  import { FLEET_WIDGET_KEY, parseFleet, type FleetAgent } from "../lib/subagent/fleet";
  import { extensionUi } from "../stores/extension-ui.svelte";
  import { recording } from "../stores/recording.svelte";
  import { lightbox } from "../stores/lightbox.svelte";
  import { terminal } from "../stores/terminal.svelte";
  import { workQueue } from "../stores/work-queue.svelte";
  import FindBar from "./FindBar.svelte";

  let { thread, onSetEnvironment, onSelectThread, onNewThread, onCloneThread, onForkThread, pendingFind, onFindConsumed }: {
    thread: Thread;
    /** Flip a brand-new (unsent) thread between its project dir and a worktree. */
    onSetEnvironment?: (threadId: string, worktree: boolean) => void | Promise<void>;
    /** Navigate to a thread (used by the DevTap install action). */
    onSelectThread?: (threadId: string) => void;
    /** Start a new thread in the current project (`/new` system command). */
    onNewThread?: () => void;
    /** Clone the current thread's whole active branch into a new thread
     *  (pi `/clone`). */
    onCloneThread?: () => void | Promise<void>;
    /** Fork the current thread up to (excluding) a user-message entry (pi
     *  `/fork`). Pre-fills the new thread's composer with the prompt. */
    onForkThread?: (entryId: string) => void | Promise<void>;
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

  // Per-thread dev-server + merge affordances (issue-agent workflow).
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
      onSelectThread(thread.id);
    } catch (e) {
      mergeMsg = `Merge failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      merging = false;
    }
  }

  // Fetch this machine's client identity once (for the control indicator).
  $effect(() => { remoteClient.init(); });

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

  // ── Send animation ──────────────────────────────────────────────────
  // A freshly-sent user message pops up into the page from its bottom-right
  // corner (WhatsApp-style). One-shot imperative action rather than a reactive
  // class: transcript ids are positional (u0/a1/u2…) and a `reset` op can
  // renumber them, recreating these keyed nodes. The action runs once per node
  // creation and only pops when it can claim a *fresh* send mark — consumed
  // exactly once at send. So history-load and id-churn re-creations never pop.
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function sendPop(node: HTMLElement, threadId: string) {
    if (prefersReducedMotion || !sendAnim.claim(threadId)) return;
    node.style.animation = "none"; // suppress the default item-enter so they don't stack
    node.style.transformOrigin = "bottom right";
    node.animate(
      [
        { opacity: 0, transform: "translateY(10px) scale(0.72)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }

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

  // Fold runs of prep (successful tool calls + thinking-only assistant
  // items) into one expandable "Reasoning" card, Codex-style. Every
  // substantive assistant-with-text stays visible and standalone — so a turn
  // with several narration + answer blocks renders each answer outside the
  // fold, with only the recon/tool runs between them collapsed. Running/error
  // tools, subagents, compactions, retries, notices and steer messages also
  // flush the run and stay standalone (never hide things needing eyes).
  const rows = $derived.by(() => groupPrepRuns(items));

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
  // Compaction summary dialog state — animated (motion-sv) dialog instead of
  // expanding the compaction card inline in the chat surface.
  let compactionDialogItem = $state<CompactionItem | null>(null);

  // Confirmation dialog state. pendingRewind holds the armed target.
  let rewindDialogOpen = $state(false);
  let pendingRewind = $state<{
    entryId: string;
    promptPreview: string;
    turnCount: number;
  } | null>(null);

  // Fork picker (pi `/fork`). A message selector listing every user turn;
  // picking one calls `onForkThread` with that entry id, which branches the
  // source up to (but excluding) that user message and pre-fills the new
  // thread's composer with the selected prompt.
  let forkPickerOpen = $state(false);

  function openForkPicker(): void {
    if (turns.length === 0) return;
    forkPickerOpen = true;
  }

  function pickFork(entryId: string): void {
    void onForkThread?.(entryId);
  }

  async function doClone(): Promise<void> {
    await onCloneThread?.();
  }

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
      const name = it.toolName || it.argsSummary || "tool";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(" · ");
  }

  // Distance from the bottom we still treat as "following". Small: only a
  // genuine return to the bottom re-arms the pin.
  const NEAR_BOTTOM = 24;
  // Following only disengages once the user has scrolled up by at least this
  // many px CUMULATIVELY in one upward gesture. Trackpad inertia emits tiny
  // negative-deltaY events long after the finger lifts; without a threshold
  // those silently kill following with no user intent. ~3 lines is enough to
  // be intentional yet catch a real "scroll up to read" motion.
  const SCROLL_UP_THRESHOLD = 80;
  let lastScrollTop = 0;
  // Accumulated upward distance since the last downward/near-bottom motion.
  // Resets on any downward scroll or landing at the bottom.
  let upwardAccum = 0;

  // Intent-based following. A single tiny `scrollTop` dip during streaming
  // (layout shifts, composer resize, tool-block insert) used to flip
  // scrolledUp on and drop following for the rest of the turn. Instead, we
  // accumulate sustained upward motion and only disengage past a threshold.
  function onScroll() {
    const el = scrollEl;
    if (!el) return;
    // During the eased bottom-follow glide we set data-glide-scroll once at
    // glide start (see glideToBottom). Skip the layout-triggering math below
    // for those programmatic scrolls — otherwise every glide frame forces a
    // reflow via scrollHeight read and re-evaluates scrolledUp for no reason.
    if (el.dataset.glideScroll) {
      lastScrollTop = el.scrollTop;
      return;
    }
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const delta = el.scrollTop - lastScrollTop;
    lastScrollTop = el.scrollTop;
    if (delta < 0) {
      upwardAccum += -delta;
      if (upwardAccum >= SCROLL_UP_THRESHOLD) scrolledUp = true;
    } else {
      // Any downward motion cancels a pending upward-intent accumulation.
      upwardAccum = 0;
      if (gap <= NEAR_BOTTOM) scrolledUp = false;
    }
  }

  // Trackpad/wheel up signals intent; but a single inertia tick shouldn't
  // drop following. We arm a pending-intent that only commits once the
  // resulting onScroll (or sustained wheeling) clears the threshold.
  function onWheel(e: WheelEvent) {
    if (e.deltaY < 0) {
      upwardAccum += -e.deltaY;
      if (upwardAccum >= SCROLL_UP_THRESHOLD) scrolledUp = true;
    } else {
      upwardAccum = 0;
    }
  }

  // ── Eased bottom-follow ──────────────────────────────────────────
  // Streaming grows the content height in chunks; snapping scrollTop to the
  // bottom on every growth reads as a jerky page. Instead we ease scrollTop
  // toward the bottom across rAF frames. Because the lerp trails a growing
  // target, the revealing tail floats a little above the bottom edge while text
  // pours in (the "buffer below"), then settles once growth stops. Bails the
  // instant the user scrolls up to read history.
  //
  // Two things keep the glide from reading as jumpy despite chunked growth:
  //  - Time-based decay (not a per-frame fraction): `1 - exp(-dt / tau)` closes
  //    the same fraction of the remaining gap per unit time regardless of
  //    refresh rate, and decelerates continuously rather than in fixed steps.
  //  - The loop stays armed for the whole streaming run instead of ending at
  //    each `diff <= 0.5` and re-arming from rest on the next token burst.
  //    The old settle→restart-from-rest cycle was the main visible jank even
  //    though each individual lerp eased; keeping one continuous loop through
  //    bursts makes growth flow instead of lurch. The target is recomputed
  //    every frame, so mid-glide height jumps (new tokens, tool blocks) are
  //    followed live rather than chased from a stale bottom.
  const GLIDE_TAU = 0.14; // seconds; higher = gentler. ~140ms time constant.
  let glideRaf = 0;
  let gliding = false;
  let lastGlideTs = 0;
  function glideToBottom() {
    const el = scrollEl;
    if (!el || gliding) return;
    gliding = true;
    lastGlideTs = 0;
    // Tag the element once at glide start so the global auto-hide-scrollbar
    // listener (main.ts) skips every programmatic scroll while we follow a
    // streaming turn. Previously this was set+deleted EVERY frame (two DOM
    // attribute mutations per rAF tick — a major per-frame cost during long
    // streaming runs). Set once here, delete once at glide end.
    el.dataset.glideScroll = "1";
    const stop = () => {
      gliding = false;
      const e = scrollEl;
      if (e) delete e.dataset.glideScroll;
    };
    const step = (ts: number) => {
      const e = scrollEl;
      if (!e || scrolledUp) {
        stop();
        return;
      }
      if (!lastGlideTs) lastGlideTs = ts;
      // Clamp dt so a tab-throttled gap doesn't dump the whole backlog in one
      // frame (the rAF timestamp jumps after backgrounding).
      const dt = Math.min(0.05, (ts - lastGlideTs) / 1000);
      lastGlideTs = ts;
      const target = e.scrollHeight - e.clientHeight;
      const diff = target - e.scrollTop;
      // While the thread is still running, keep the loop armed even at a
      // momentary zero gap so the next burst continues the same motion
      // instead of restarting from rest. Idle (not running) settles out.
      const running = thread.status === "running";
      if (diff <= 0.5 && !running) {
        e.scrollTop = target;
        stop();
        return;
      }
      const factor = 1 - Math.exp(-dt / GLIDE_TAU);
      e.scrollTop = e.scrollTop + diff * factor;
      glideRaf = requestAnimationFrame(step);
    };
    glideRaf = requestAnimationFrame(step);
  }

  function scrollToBottom() {
    const el = scrollEl;
    if (!el) return;
    scrolledUp = false;
    upwardAccum = 0;
    glideToBottom();
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
    // Sticky re-arm: when a new item lands and the user is still near the
    // bottom, re-engage following. A transient trackpad-inertia tick can
    // otherwise leave scrolledUp=true with the user only a few px above the
    // bottom; without this, they silently stop following the new turn. Only
    // apply when actually near the bottom — a real "reading old history"
    // (scrolled far up) must keep its place.
    if (scrolledUp) {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (gap <= NEAR_BOTTOM) {
        scrolledUp = false;
        upwardAccum = 0;
      }
    }
    // glideToBottom re-checks scrolledUp every frame, so a mid-scroll token
    // can't yank the user back down.
    if (!scrolledUp) glideToBottom();
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
      if (!scrolledUp) glideToBottom();
    };
    const ro = new ResizeObserver(pin);
    ro.observe(el);
    if (content) ro.observe(content);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(glideRaf);
    };
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
        <DevTapWidget {thread} {onSelectThread} />
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
            onclick={openForkPicker}
            disabled={!thread.piSessionFile || thread.status === 'running' || turns.length === 0}
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
      class="transcript-scroll flex flex-1 flex-col overflow-y-auto px-6 pt-5 pb-26"
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
        <details class="collapse-anim tool-enter group text-xs" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>
          <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors select-none hover:bg-surface">
            <span class="w-3.5 shrink-0 text-center {item.status === 'error' ? 'text-danger' : 'text-fainter'}">{item.status === "error" ? "✕" : item.status !== "running" ? "✓" : ""}</span>
            <span
              class="font-mono font-medium {item.status === 'running' ? 'tool-name--running' : 'text-muted'} {item.toolName ? 'shrink-0' : 'min-w-0 shrink truncate'}"
              >{item.toolName || item.argsSummary || "tool"}</span>
            {#if item.toolName}
              <span class="truncate font-mono text-fainter">{item.argsSummary}</span>
            {/if}
            <span class="ml-auto shrink-0 text-fainter transition-transform duration-200 ease-out group-open:rotate-90">›</span>
          </summary>
          {#if item.output}
            <pre class="mx-2 mt-1 max-h-64 overflow-auto rounded-lg border border-border/80 bg-surface/60 px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted select-text">{item.output}</pre>
          {/if}
        </details>
      {/snippet}
      {#snippet renderRow(row: Row)}
        {#if row.type === "group"}
          {@const live = row.items.some((it) => (it.kind === "assistant" && it.streaming) || (it.kind === "tool" && it.status === "running"))}
          <details class="collapse-anim tool-enter group/tools -mb-1.5 mt-2 text-xs" data-item-id={row.id} open={live && thread.status === "running"}>
            <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors select-none hover:bg-surface">
              <span class="shrink-0 text-fainter">✓</span>
              <span class="shrink-0 font-mono font-medium text-muted">{row.hasThinking ? "Reasoning" : `${row.items.length} tool calls`}</span>
              <span class="truncate font-mono text-fainter">{groupSummary(row.items)}</span>
              <span class="ml-auto shrink-0 text-fainter transition-transform duration-200 ease-out group-open/tools:rotate-90">›</span>
            </summary>
            <div class="mt-1 flex flex-col gap-1 border-l-2 border-border pl-1.5">
              {#each row.items as it (it.id)}
                {#if it.kind === "assistant"}
                  {@const itStreaming = it.streaming && thread.status === "running"}
                  {@const itInThinking = itStreaming && !!it.thinking && !it.text}
                  <div class="item-enter assistant-message group/assistant text-[13.5px] leading-relaxed text-fg">
                    {#if it.thinking}
                      <details class="collapse-anim group mb-1 text-xs text-faint" open={itStreaming && !it.text}>
                        <summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-fg-soft">
                          <span class="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Thinking
                        </summary>
                        <ThinkingBlock text={it.thinking} streaming={itStreaming} cursor={itInThinking} revealKey={`${it.id}:thinking`} />
                      </details>
                    {/if}
                  </div>
                {:else if it.kind === "tool"}
                  {@render toolRow(it)}
                {/if}
              {/each}
            </div>
          </details>
        {:else}
          {@const item = row.item}
          {#if item.kind === "user"}
          <div class="item-enter flex max-w-[85%] flex-col gap-2 self-end" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId} use:sendPop={thread.id}>
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
              <MessageBadges text={item.text}>
                {#snippet children({ body })}
                  {@const skill = parseSkillInvocation(body)}
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
                  {:else if body}
                    <div class="rounded-2xl rounded-br-md border border-border-strong/40 bg-surface-2/80 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg select-text">
                      {body}
                    </div>
                  {/if}
                {/snippet}
              </MessageBadges>
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
              <details class="collapse-anim group mb-1 text-xs text-faint" open={isStreaming && !item.text}>
                <summary class="cursor-pointer rounded-md py-0.5 transition-colors select-none hover:text-fg-soft">
                  <span class="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Thinking
                </summary>
                <ThinkingBlock text={item.thinking} streaming={isStreaming} cursor={inThinking} revealKey={`${item.id}:thinking`} />
              </details>
            {/if}
            <StreamingText text={item.text} streaming={isStreaming} cursor={isStreaming && !inThinking} revealKey={`${item.id}:text`} />
            {#if item.error}
              <p class="mt-2 rounded-lg border border-danger-border/40 bg-danger-surface/30 px-3 py-1.5 text-xs text-danger" use:clickCopy={item.error}>{item.error}</p>
            {/if}
            {#if !isStreaming && item.text}
              <div class="assistant-actions">
                <CopyButton text={item.text} />
                {#if thread.status !== "running" && turnMap.endById.has(item.id) && !thread.remoteHostId}
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
                  <button
                    type="button"
                    class="copy-btn"
                    onclick={() => pickFork(t.entryId)}
                    title="Fork into a new thread at this point"
                    data-testid="fork-turn"
                  >
                    <GitBranch size={13} /> <span>Fork</span>
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
            <div class="item-enter w-full rounded-lg border border-border-strong/40 bg-surface-2/40 px-4 py-3" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>
              <div class="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                <BrailleSpinner class="working-label__spinner shrink-0" />
                {item.reason === "manual" ? "Compacting…" : "Auto-compacting…"}
              </div>
              <p class="mt-1 text-xs text-faint italic">Summarising the conversation to free up context…</p>
            </div>
          {:else}
            {@const compacted = !item.error && !item.aborted}
            <button
              type="button"
              class="item-enter flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-surface/60 px-3 py-2 text-xs font-semibold text-muted transition-colors select-none hover:bg-surface {compacted
                ? ''
                : 'border-border-strong/30'}"
              style={compacted ? "border-color: oklch(0.6 0.16 52 / 0.45)" : ""}
              data-item-id={item.id}
              class:thread-find-hit={item.id === currentMatchId}
              data-testid="compaction-card"
              onclick={() => (compactionDialogItem = item)}
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
                <span class="ml-auto shrink-0 text-fainter">⤢</span>
              {/if}
            </button>
          {/if}
          {:else if item.kind === "retry"}
            <div
              class="item-enter flex w-full items-center gap-2 rounded-lg border bg-surface/60 px-3 py-2 text-xs font-semibold text-muted transition-colors select-none {item.running ? 'border-border-strong/30' : 'border-danger-border/40'}"
              data-item-id={item.id}
              class:thread-find-hit={item.id === currentMatchId}
              data-testid="retry-card"
            >
              {#if item.running}
                <BrailleSpinner class="working-label__spinner shrink-0" shape="triangle" size={16} dotSize={2.5} />
                <span class="font-semibold text-danger">Connection failed</span>
                <span class="font-medium text-faint">· attempt {item.attempt}/{item.maxAttempts} — retrying…</span>
              {:else}
                <span class="shrink-0 text-danger" aria-hidden="true">⚠</span>
                <span class="font-semibold text-danger">Connection failed</span>
                <span class="font-medium text-faint">· attempt {item.attempt}/{item.maxAttempts} — gave up</span>
              {/if}
              <span class="ml-auto shrink-0 text-fainter truncate max-w-[60%]" title={item.error}>{item.error}</span>
            </div>
          {:else if isSteerMessage(item)}
            <!-- steer messages already surfaced in SubagentCard journey — skip -->
          {:else}
            <p class="item-enter text-center text-xs text-faint italic" data-item-id={item.id} class:thread-find-hit={item.id === currentMatchId}>{item.text}</p>
          {/if}
        {/if}
      {/snippet}
      {#each rows as row (row.type === "group" ? row.id : row.item.id)}
        {@render renderRow(row)}
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
      {#if thread.status === "running" && !items.some((i) => i.kind === "assistant" && i.streaming) && !items.some((i) => i.kind === "tool" && i.status === "running") && !items.some((i) => i.kind === "compaction" && i.running)}
        <div class="item-enter text-xs">
          <WorkingLabel label="Working…" />
        </div>
      {/if}
      {#each queues.for(thread.id).steering as steerText, i ("steer-pending-" + i)}
        <div class="item-enter flex max-w-[85%] flex-col gap-2 self-end" data-testid="pending-steer">
          <div class="group/steer relative rounded-2xl rounded-br-md border border-dashed border-border-strong/60 bg-surface-2/40 px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg-soft select-text">
            {steerText}
            <button
              type="button"
              class="absolute -top-2 -right-2 hidden size-5 items-center justify-center rounded-full border border-border-strong bg-surface text-muted group-hover/steer:flex hover:bg-danger hover:text-fg"
              onclick={() => api.invoke("threads:deleteSteer", thread.id, i).catch(console.error)}
              title="Cancel this steer"
              aria-label="Cancel steering message"
              data-testid="cancel-pending-steer"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      {/each}
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
    <Composer
      {thread}
      onRewind={rewindFromEnd}
      {onNewThread}
      onCloneThread={doClone}
      onForkPicker={openForkPicker}
      centered={isEmpty}
    />
  </div>
  <RewindDialog
    bind:open={rewindDialogOpen}
    bind:revertFiles
    {canRevert}
    turnCount={pendingRewind?.turnCount ?? 1}
    promptPreview={pendingRewind?.promptPreview ?? ""}
    onConfirm={confirmRewind}
  />
  <ForkPickerDialog
    bind:open={forkPickerOpen}
    {turns}
    onPick={pickFork}
  />
  <CompactionDialog
    bind:item={compactionDialogItem}
    onRetry={() => api.invoke("threads:retryCompact", thread.id).catch(console.error)}
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
  /* Soften the transcript's bottom edge so text dissolves into the composer
     instead of meeting it at a hard straight line that clashes with the
     composer's rounded top corners. */
  .transcript-scroll {
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent);
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
