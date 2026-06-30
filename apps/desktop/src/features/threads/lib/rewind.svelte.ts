import type { Thread, TranscriptItem } from "@peach-pi/shared-types";
import { api } from "../../../lib/ipc";
import { drafts } from "../../../stores/composer.svelte";
import { mapTurns, type ForkTurn, type TurnMap } from "../../../lib/transcript/turns";

interface RewoundPreview {
  threadId: string;
  before: TranscriptItem[];
  beforeLen: number;
  settledLen: number | null;
}

interface PendingRewind {
  entryId: string;
  promptPreview: string;
  turnCount: number;
}

/**
 * Rewind (pi session tree + git file revert) and fork state for one thread.
 *
 * pi keeps every turn as an append-only tree; rewinding moves the leaf to
 * before a turn (abandoned turns stay in the file but drop out of the active
 * branch). When git-backed, file changes made during the rewound turns can
 * also be reverted (destructive — see the confirm dialog). The greyed-out
 * preview of dropped turns is captured from the pre-rewind transcript.
 */
export class RewindState {
  turns = $state<ForkTurn[]>([]);
  rewound = $state<RewoundPreview | null>(null);
  revertFiles = $state(true);
  rewindDialogOpen = $state(false);
  pendingRewind = $state<PendingRewind | null>(null);
  forkPickerOpen = $state(false);

  // Lazy getters: parameter properties above initialize in the constructor
  // body, which runs after field initializers, so $derived-from-param fields
  // would be TS2729. These recompute on access and stay reactive because they
  // read $state (turns/revertFiles) and the shell's items() closure.
  get turnMap(): TurnMap { return mapTurns(this.items(), this.turns); }
  get canRevert(): boolean {
    const t = this.thread();
    return t.worktreeDir != null || t.projectId != null;
  }

  constructor(
    private readonly thread: () => Thread,
    private readonly items: () => readonly TranscriptItem[],
    private readonly onForkThread?: (entryId: string) => void | Promise<void>,
  ) {}

  openForkPicker(): void {
    if (this.turns.length === 0) return;
    this.forkPickerOpen = true;
  }

  pickFork(entryId: string): void {
    void this.onForkThread?.(entryId);
  }

  // Arm the confirmation dialog for the turn that starts at `entryId`.
  openRewindDialog(entryId: string): void {
    const turnIndex = this.turns.findIndex((t) => t.entryId === entryId);
    if (turnIndex < 0) return;
    this.pendingRewind = {
      entryId,
      promptPreview: this.turns[turnIndex]!.text,
      turnCount: this.turns.length - turnIndex,
    };
    this.rewindDialogOpen = true;
  }

  confirmRewind(): void {
    const p = this.pendingRewind;
    if (!p) return;
    this.pendingRewind = null;
    this.rewindDialogOpen = false;
    void this.doRewind(p.entryId, this.canRevert && this.revertFiles);
  }

  async doRewind(entryId: string, revert: boolean): Promise<void> {
    const before = this.items().slice();
    try {
      const { editorText } = await api.invoke("threads:rewind", this.thread().id, entryId, revert);
      this.rewound = {
        threadId: this.thread().id,
        before,
        beforeLen: before.length,
        settledLen: null,
      };
      if (editorText) drafts.update(this.thread().id, { text: editorText });
    } catch (err) {
      console.error("rewind failed", err);
    }
  }

  // `/rewind [n]` from the composer — rewind the n-th turn from the end
  // (reverts files by default on git-backed threads).
  rewindFromEnd(n: number): void {
    if (this.turns.length === 0) return;
    const target = this.turns[Math.max(0, this.turns.length - Math.max(1, n))];
    const keepCount = target ? this.turnMap.keepByEntry.get(target.entryId) : undefined;
    if (target && keepCount != null) this.openRewindDialog(target.entryId);
  }

  // Clear the greyed preview once it no longer matches the live transcript
  // (a new message extended the thread, or we switched threads). Returns the
  // new value so the component's effect can re-render consistently.
  syncPreview(): void {
    const r = this.rewound;
    if (!r) return;
    if (r.threadId !== this.thread().id) {
      this.rewound = null;
    } else if (r.settledLen === null) {
      if (this.items().length < r.beforeLen) this.rewound = { ...r, settledLen: this.items().length };
    } else if (this.items().length !== r.settledLen) {
      this.rewound = null;
    }
  }
}
