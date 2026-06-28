import {
  applyTranscriptOps,
  type TranscriptItem,
  type TranscriptOp,
} from "@peach-pi/shared-types";
import { SvelteMap } from "svelte/reactivity";
import { api } from "../lib/ipc";
import { snapshot } from "./snapshot.svelte";

/** Per-thread transcript views, fed by main-process ops. */
class TranscriptStore {
  private byThread = new SvelteMap<string, TranscriptItem[]>();
  private loaded = new Set<string>();
  /** Deltas captured while a backfill fetch is in flight, keyed by thread, so
   *  they can be replayed on top of the authoritative snapshot. */
  private buffering = new Map<string, { seq: number; ops: TranscriptOp[] }[]>();
  /** The remote thread currently attached to the (single) remote tap, so
   *  `event:remoteTap` frames (keyed by the master's threadId) fold into the
   *  right composite-id transcript. */
  private activeRemote: { compositeId: string; remoteThreadId: string } | null = null;
  private started = false;

  init(): void {
    // Idempotent: the preload `on` forwards to ipcRenderer.on (additive), so a
    // second registration (e.g. HMR remounting App) would apply every append
    // delta twice — duplicating streamed text ("DoneDone…").
    if (this.started) return;
    this.started = true;
    api.on("event:transcript", ({ threadId, ops, seq }) => {
      // Record deltas that race the initial backfill fetch so `ensure()` can
      // replay only the ones the snapshot did not already include.
      this.buffering.get(threadId)?.push({ seq, ops });
      this.byThread.set(threadId, applyTranscriptOps(this.byThread.get(threadId) ?? [], ops));
    });
    // Remote master threads stream over a distinct channel; fold them into the
    // composite-id transcript so they render in the normal ThreadView.
    api.on("event:remoteTap", (frame) => {
      const ar = this.activeRemote;
      if (!ar || frame.threadId !== ar.remoteThreadId) return;
      if (frame.kind === "backfill") {
        this.byThread.set(ar.compositeId, [...frame.items]);
      } else if (frame.kind === "transcript") {
        this.byThread.set(
          ar.compositeId,
          applyTranscriptOps(this.byThread.get(ar.compositeId) ?? [], frame.ops),
        );
      }
      // checkpoint/status/queue/bye carry no transcript ops — ignored here.
    });
  }

  itemsFor(threadId: string): TranscriptItem[] {
    return this.byThread.get(threadId) ?? [];
  }

  /** Ensure full history is loaded once per thread (resume / mid-run view).
   *  The snapshot is authoritative; live deltas that raced the fetch are
   *  replayed on top by flush seq, so nothing is dropped or double-applied. */
  async ensure(threadId: string): Promise<void> {
    // Remote thread: (re)point the single remote tap at it. The backfill +
    // transcript frames fold into byThread via the event:remoteTap handler.
    const thread = snapshot.current?.threads.find((t) => t.id === threadId);
    if (thread?.remoteHostId && thread.remoteThreadId) {
      if (this.activeRemote?.compositeId === threadId) return;
      this.activeRemote = { compositeId: threadId, remoteThreadId: thread.remoteThreadId };
      await api.invoke("remote:attach", thread.remoteHostId, thread.remoteThreadId);
      return;
    }
    if (this.loaded.has(threadId)) return;
    this.loaded.add(threadId);
    const buffered: { seq: number; ops: TranscriptOp[] }[] = [];
    this.buffering.set(threadId, buffered);
    try {
      const { items, seq } = await api.invoke("threads:getTranscript", threadId);
      let next = items;
      for (const d of buffered) {
        if (d.seq > seq) next = applyTranscriptOps(next, d.ops);
      }
      this.byThread.set(threadId, next);
    } finally {
      this.buffering.delete(threadId);
    }
  }
}

export const transcripts = new TranscriptStore();
