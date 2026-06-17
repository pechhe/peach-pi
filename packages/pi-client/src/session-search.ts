import { TranscriptRecorder } from "./transcript-recorder.ts";

/**
 * Read a pi JSONL session file and return its user/assistant text as a single
 * searchable string. Used for in-thread search (the search bar searches inside
 * thread bodies, not just titles).
 *
 * Reuses TranscriptRecorder so the extracted text matches what the renderer
 * renders (same content-block → text mapping). Tool output and compaction
 * cards are skipped: they're noisy and not what users search for.
 *
 * Returns an empty string if the file can't be read or has no message entries;
 * callers treat that as "no match".
 */
export async function extractSessionText(filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { parseSessionEntries, buildSessionContext } = await import(
    "@earendil-works/pi-coding-agent"
  );
  const entries = parseSessionEntries(await readFile(filePath, "utf8")).filter(
    (e): e is import("@earendil-works/pi-coding-agent").SessionEntry => e.type !== "session",
  );
  const { messages } = buildSessionContext(entries);
  const recorder = new TranscriptRecorder();
  recorder.load(messages);
  return recorder
    .transcript()
    .map((i) => (i.kind === "user" || i.kind === "assistant" || i.kind === "notice" ? i.text : ""))
    .filter(Boolean)
    .join("\n");
}
