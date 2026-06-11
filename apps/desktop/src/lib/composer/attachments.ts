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

export type ComposerAttachment = ComposerImageAttachment | ComposerFileAttachment;

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
  return `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
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
