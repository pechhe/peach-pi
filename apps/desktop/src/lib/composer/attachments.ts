/** Ported from peche-pi composer-attachments.ts — image detection, clipboard
 *  paste, drag-drop extraction, base64 encoding. Path bridge adapted to
 *  window.peachPi.getPathForFile. */

export interface ComposerImageAttachment {
  id: string;
  kind: "image";
  name: string;
  mimeType: string;
  data: string; // base64, no data: prefix
}

export interface ComposerFileAttachment {
  id: string;
  kind: "file";
  name: string;
  mimeType: string;
  fsPath: string;
  sizeBytes?: number;
}

/** Large pasted text held in-memory; inlined back into the message on submit. */
export interface ComposerTextAttachment {
  id: string;
  kind: "text";
  name: string;
  content: string;
}

export type ComposerAttachment =
  | ComposerImageAttachment
  | ComposerFileAttachment
  | ComposerTextAttachment;

/**
 * Paste a text blob this big (or this many lines) as an attachment chip instead
 * of dumping raw text into the composer (ChatGPT-style).
 */
export const PASTE_AS_ATTACHMENT_MIN_CHARS = 2000;
export const PASTE_AS_ATTACHMENT_MIN_LINES = 15;

export function shouldPasteAsAttachment(text: string): boolean {
  return (
    text.length >= PASTE_AS_ATTACHMENT_MIN_CHARS ||
    text.split(/\r\n|\r|\n/).length >= PASTE_AS_ATTACHMENT_MIN_LINES
  );
}

/** First non-empty line (or a type label) as a chip label. */
export function makeTextAttachment(content: string): ComposerTextAttachment {
  return { id: crypto.randomUUID(), kind: "text", name: textAttachmentLabel(content), content };
}

function textAttachmentLabel(content: string): string {
  if (/^\s*<(?:!doctype html|html[\s>]|\?xml)/i.test(content)) return "Pasted HTML";
  const firstLine = content.split(/\r\n|\r|\n/).find((l) => l.trim().length > 0)?.trim() ?? "";
  const stripped = firstLine.replace(/^#+\s*/, "");
  return stripped.length > 40 ? `${stripped.slice(0, 40)}…` : stripped || "Pasted text";
}

export const SUPPORTED_COMPOSER_IMAGE_TYPES = [
  { extension: "png", mimeType: "image/png" },
  { extension: "jpg", mimeType: "image/jpeg" },
  { extension: "jpeg", mimeType: "image/jpeg" },
  { extension: "gif", mimeType: "image/gif" },
  { extension: "webp", mimeType: "image/webp" },
] as const;

type ComposerImageMimeType = (typeof SUPPORTED_COMPOSER_IMAGE_TYPES)[number]["mimeType"];

const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>(
  SUPPORTED_COMPOSER_IMAGE_TYPES.map((t) => t.mimeType),
);
const IMAGE_MIME_TYPE_BY_EXTENSION = new Map(
  SUPPORTED_COMPOSER_IMAGE_TYPES.map((t) => [t.extension as string, t.mimeType] as const),
);

function inferImageMimeType(file: Pick<File, "name" | "type">): ComposerImageMimeType | undefined {
  if (SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) return file.type as ComposerImageMimeType;
  const extension = file.name.split(".").pop()?.trim().toLowerCase();
  return extension ? IMAGE_MIME_TYPE_BY_EXTENSION.get(extension) : undefined;
}

function isImageFile(file: Pick<File, "name" | "type">): boolean {
  return Boolean(inferImageMimeType(file));
}

function fileSignature(file: File): string {
  // Intentionally excludes lastModified: a single pasted image surfaces through
  // both DataTransfer.items (getAsFile) and DataTransfer.files, and the browser
  // often stamps those two File objects with different lastModified values.
  // Including it here would let the same image dedupe through and be attached twice.
  return `${file.name}:${file.type}:${file.size}`;
}

function dedupeFiles(files: readonly File[]): File[] {
  const seen = new Set<string>();
  const unique: File[] = [];
  for (const file of files) {
    const sig = fileSignature(file);
    if (seen.has(sig)) continue;
    seen.add(sig);
    unique.push(file);
  }
  return unique;
}

export function hasFilesInDataTransfer(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  if (Array.from(dt.types ?? []).includes("Files")) return true;
  if (Array.from(dt.items ?? []).some((i) => i.kind === "file")) return true;
  return (dt.files?.length ?? 0) > 0;
}

export function extractImageFilesFromClipboardData(cd: DataTransfer | null | undefined): File[] {
  if (!cd) return [];
  const itemFiles = Array.from(cd.items ?? [])
    .filter((i) => i.kind === "file")
    .map((i) => i.getAsFile())
    .filter((f): f is File => Boolean(f))
    .filter(isImageFile);
  const clipboardFiles = Array.from(cd.files ?? []).filter(isImageFile);
  return dedupeFiles([...itemFiles, ...clipboardFiles]);
}

/** Normalize one clipboard line into an absolute local path, or null. */
function normalizeLocalPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null; // uri-list comment
  let p = trimmed;
  if (p.startsWith("file://")) {
    try {
      p = decodeURIComponent(new URL(p).pathname);
    } catch {
      return null;
    }
  }
  return p.startsWith("/") ? p : null;
}

/**
 * Extract local image file paths pasted as text (text/uri-list or text/plain).
 * Clipboard managers (Raycast, screenshot history) often paste an image as a
 * file-path string instead of a File blob; without this the raw path leaks
 * into the composer as text.
 */
export function extractImageFilePathsFromClipboardData(
  cd: DataTransfer | null | undefined,
): string[] {
  if (!cd) return [];
  const blobs = [cd.getData?.("text/uri-list") ?? "", cd.getData?.("text/plain") ?? ""];
  const paths = new Set<string>();
  for (const blob of blobs) {
    for (const line of blob.split(/[\r\n]+/)) {
      const p = normalizeLocalPath(line);
      if (p && isImageFile({ name: p, type: "" })) paths.add(p);
    }
  }
  return Array.from(paths);
}

/** Read local image paths into image attachments via the main-process file reader. */
export async function readImageAttachmentsFromPaths(
  paths: readonly string[],
): Promise<ComposerImageAttachment[]> {
  const results = await Promise.all(paths.map(readImageAttachmentFromPath));
  return results.filter((a): a is ComposerImageAttachment => Boolean(a));
}

async function readImageAttachmentFromPath(
  filePath: string,
): Promise<ComposerImageAttachment | null> {
  const read = await window.peachPi.invoke("files:readImage", filePath).catch(() => null);
  if (!read) return null;
  return {
    id: crypto.randomUUID(),
    kind: "image",
    name: filePath.split(/[/\\]+/).pop() || "pasted-image.png",
    mimeType: read.mimeType,
    data: read.data,
  };
}

export function extractFilesFromDataTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const itemFiles = Array.from(dt.items ?? [])
    .filter((i) => i.kind === "file")
    .map((i) => i.getAsFile())
    .filter((f): f is File => Boolean(f));
  return dedupeFiles([...itemFiles, ...Array.from(dt.files ?? [])]);
}

export async function readComposerAttachmentsFromFiles(
  files: readonly File[],
): Promise<ComposerAttachment[]> {
  const attachments = await Promise.all(dedupeFiles(files).map(readAttachment));
  return attachments.filter((a): a is ComposerAttachment => Boolean(a));
}

async function readAttachment(file: File): Promise<ComposerAttachment | null> {
  return isImageFile(file) ? readImageAttachment(file) : readFileAttachment(file);
}

function readImageAttachment(file: File): Promise<ComposerImageAttachment | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({
        id: crypto.randomUUID(),
        kind: "image",
        name: file.name || "pasted-image.png",
        mimeType: inferImageMimeType(file) ?? "image/png",
        data: dataUrl.slice(dataUrl.indexOf(",") + 1),
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function readFileAttachment(file: File): ComposerFileAttachment | null {
  let fsPath = "";
  try {
    fsPath = window.peachPi.getPathForFile(file)?.trim() ?? "";
  } catch {
    fsPath = "";
  }
  if (!fsPath) return null;
  return {
    id: crypto.randomUUID(),
    kind: "file",
    name: file.name || fsPath.split(/[/\\]+/).pop() || "attached-file",
    mimeType: file.type || "application/octet-stream",
    fsPath,
    ...(typeof file.size === "number" ? { sizeBytes: file.size } : {}),
  };
}
