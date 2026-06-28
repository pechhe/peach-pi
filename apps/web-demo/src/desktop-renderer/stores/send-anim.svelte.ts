/**
 * Send-animation side-channel. The composer and the transcript live in
 * separate components, so when the user sends a message the composer drops a
 * short-lived "just sent" mark here; ThreadView claims it the moment the new
 * user bubble appears and plays the WhatsApp-style send pop on exactly that
 * item.
 *
 * Why a mark (not transcript diffing): a resumed thread loads its history
 * asynchronously (items briefly [] then a batch), which is indistinguishable
 * from a send by transcript shape alone. Only a real send leaves a mark, so
 * history-load never pops.
 *
 * Not reactive on purpose — ThreadView's effect is already re-run by the
 * transcript update that carries the new bubble, and it claims the mark there.
 */
class SendAnimStore {
  private marks = new Map<string, number>();

  /** Record that the user just sent a normal message on this thread. */
  mark(threadId: string): void {
    this.marks.set(threadId, Date.now());
  }

  /** True (and consumes the mark) if a fresh send mark exists for this thread. */
  claim(threadId: string, withinMs = 6000): boolean {
    const at = this.marks.get(threadId);
    if (at == null) return false;
    this.marks.delete(threadId);
    return Date.now() - at <= withinMs;
  }
}

export const sendAnim = new SendAnimStore();
