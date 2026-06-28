/**
 * Pure outgoing-prompt builder for the composer.
 *
 * Everything that builds the text/images/tool-mode payload + chooses the IPC
 * routing channel lives here, with zero IPC, zero store reads, and zero side
 * effects. `Composer.svelte`'s `submit()` keeps only the dispatch
 * (`api.invoke(...)`), the draft snapshot/restore on failure, and the
 * app-level system-command early returns (`/rewind`, `/btw`, `/model`, …).
 *
 * Routing matrix (the highest-risk renderer path, previously untested):
 *
 *   remoteHostId + remoteThreadId set (ADR-0010 relay write path):
 *     asSteer && running  →  remote:steer
 *     otherwise          →  remote:message
 *   local pi session:
 *     asSteer && running  →  threads:steer
 *     otherwise          →  threads:prompt
 *
 * Plan-mode rule: `toolMode` is `"readOnly"` only when plan mode is active AND
 * the outgoing isn't a slash command (slash commands always run with full
 * tools). Images + toolMode are local-only payloads — the remote path carries
 * text only today.
 */
import type {
  ImagePayload,
  ReferencedConnection,
  ReferencedSecret,
  Thread,
  ToolMode,
} from "@peach-pi/shared-types";
import type { ComposerAttachment } from "./attachments.ts";
import type { ComposerMode } from "./mode.ts";
import { buildConnectionsHint, buildSecretsHint } from "./hints.ts";
import { composeOutgoingPrompt } from "./mode.ts";

export type OutgoingChannel =
  | "threads:prompt"
  | "threads:steer"
  | "remote:message"
  | "remote:steer";

/**
 * Discriminated union of the four routing branches. Each `args` tuple matches
 * the corresponding `ipcContracts` channel signature exactly, so the caller
 * dispatches with `api.invoke(built.channel, ...built.args)`.
 */
export type BuiltOutgoing =
  | { channel: "threads:prompt"; args: [threadId: string, text: string, images: ImagePayload[], toolMode: ToolMode] }
  | { channel: "threads:steer"; args: [threadId: string, text: string] }
  | { channel: "remote:message"; args: [hostId: string, remoteThreadId: string, text: string] }
  | { channel: "remote:steer"; args: [hostId: string, remoteThreadId: string, text: string] };

/** Shape buildOutgoing reads from the draft. Structurally compatible with
 *  ComposerDraft so the live store passes straight through, but the builder
 *  stays decoupled from the store module at the type level. */
export interface OutgoingDraft {
  readonly text: string;
  readonly attachments: ComposerAttachment[];
  readonly mode: ComposerMode;
  readonly command: { name: string; kind: "skill" | "extension" | "prompt" | "system" } | null;
  readonly connections: ReferencedConnection[];
  readonly secrets: ReferencedSecret[];
  /** Plan-mode full instructions already sent once in this thread. */
  readonly planPromptSent: boolean;
}

/**
 * Build the outgoing prompt payload and resolve the IPC routing channel.
 *
 * @param draft   The composer draft (text, attachments, mode, pinned hints).
 * @param thread  The target thread (id, remote host/thread ids, status).
 * @param asSteer Caller-resolved steer intent (e.g. ⌘+Enter while running).
 *   Steer only fires when the thread is actually running; otherwise the call
 *   falls through to a normal message/prompt.
 * @returns `{ channel, args }` — pure; the caller performs the `api.invoke`.
 */
export function buildOutgoing(
  draft: OutgoingDraft,
  thread: Thread,
  asSteer: boolean,
): BuiltOutgoing {
  const raw = draft.text.trim();
  const isSlashCommand = !!draft.command || raw.startsWith("/");

  const fileRefs = draft.attachments
    .filter((a) => a.kind === "file")
    .map((a) => (a.kind === "file" ? `Attached file: ${a.fsPath}` : ""));
  const textBlocks = draft.attachments
    .filter((a) => a.kind === "text")
    .map((a) => (a.kind === "text" ? `${a.name}:\n\n${a.content}` : ""));
  const images: ImagePayload[] = draft.attachments
    .filter((a) => a.kind === "image")
    .map((a) => (a.kind === "image" ? { mimeType: a.mimeType, data: a.data } : null!))
    .filter(Boolean);

  const body = [raw, ...textBlocks, ...fileRefs].filter(Boolean).join("\n\n");
  const outgoing = draft.command
    ? [`/${draft.command.name}`, body].filter(Boolean).join(" ")
    : isSlashCommand
      ? body
      : composeOutgoingPrompt(body, {
          mode: draft.mode,
          isFirst: !draft.planPromptSent,
        });

  // @-connections + @-secrets hints prepend before anything else; orthogonal
  // to mode/slash-wrapping.
  const connectionsHint = buildConnectionsHint(draft.connections);
  const secretsHint = buildSecretsHint(draft.secrets);
  const hints = [connectionsHint, secretsHint].filter(Boolean).join("\n\n");
  const outgoingWithHints = hints ? `${hints}\n\n${outgoing}` : outgoing;

  const toolMode: ToolMode = draft.mode === "plan" && !isSlashCommand ? "readOnly" : "all";

  const steer = asSteer && thread.status === "running";
  const remote = !!(thread.remoteHostId && thread.remoteThreadId);

  if (remote) {
    const args = [thread.remoteHostId!, thread.remoteThreadId!, outgoingWithHints] as const;
    return steer
      ? { channel: "remote:steer", args: [...args] }
      : { channel: "remote:message", args: [...args] };
  }
  return steer
    ? { channel: "threads:steer", args: [thread.id, outgoingWithHints] }
    : { channel: "threads:prompt", args: [thread.id, outgoingWithHints, images, toolMode] };
}
