import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractImageFilePathsFromClipboardData,
  extractImageFilesFromClipboardData,
} from "../../src/lib/composer/attachments.ts";

/** Minimal DataTransfer stub exposing only getData, as the extractor uses. */
function clipboard(data: Record<string, string>): DataTransfer {
  return { getData: (type: string) => data[type] ?? "" } as unknown as DataTransfer;
}

test("extracts plain absolute image path", () => {
  const paths = extractImageFilePathsFromClipboardData(
    clipboard({ "text/plain": "/var/folders/x/pi-clipboard-abc.png" }),
  );
  assert.deepEqual(paths, ["/var/folders/x/pi-clipboard-abc.png"]);
});

test("decodes file:// uri-list and ignores comment lines", () => {
  const paths = extractImageFilePathsFromClipboardData(
    clipboard({ "text/uri-list": "# comment\nfile:///Users/a/My%20Shot.png" }),
  );
  assert.deepEqual(paths, ["/Users/a/My Shot.png"]);
});

test("ignores non-image and relative/remote paths", () => {
  const paths = extractImageFilePathsFromClipboardData(
    clipboard({ "text/plain": "/tmp/notes.txt\nrelative/x.png\nhttps://e.com/a.png" }),
  );
  assert.deepEqual(paths, []);
});

test("dedupes paths across uri-list and plain", () => {
  const paths = extractImageFilePathsFromClipboardData(
    clipboard({ "text/uri-list": "file:///a/b.png", "text/plain": "/a/b.png" }),
  );
  assert.deepEqual(paths, ["/a/b.png"]);
});

test("returns empty for null clipboard", () => {
  assert.deepEqual(extractImageFilePathsFromClipboardData(null), []);
});

/**
 * A single pasted image appears in both DataTransfer.items (via getAsFile) and
 * DataTransfer.files. The browser may stamp those two File objects with
 * different lastModified values, so dedupe must ignore lastModified — otherwise
 * the image is attached twice.
 */
function imageClipboard(opts: {
  itemFile?: File;
  files?: File[];
}): DataTransfer {
  const items = opts.itemFile
    ? [{ kind: "file", getAsFile: () => opts.itemFile ?? null }]
    : [];
  return {
    items,
    files: opts.files ?? [],
    getData: () => "",
  } as unknown as DataTransfer;
}

test("dedupes the same pasted image across items and files despite differing lastModified", () => {
  const fromItems = new File([new Uint8Array([1, 2, 3])], "image.png", {
    type: "image/png",
    lastModified: 1000,
  });
  const fromFiles = new File([new Uint8Array([1, 2, 3])], "image.png", {
    type: "image/png",
    lastModified: 2000,
  });
  const result = extractImageFilesFromClipboardData(
    imageClipboard({ itemFile: fromItems, files: [fromFiles] }),
  );
  assert.equal(result.length, 1);
});
