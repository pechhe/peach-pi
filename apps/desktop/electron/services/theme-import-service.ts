/**
 * Theme import service: turns an iTerm2 name, a URL, or a screenshot into a
 * palette of hex colors using the configured vision-proxy model.
 *
 * The renderer hands over a `ThemeImportInput` (one of: free-text name, URL,
 * or base64 image). This service:
 *   1. Reads the vision-proxy config to pick the model (provider + modelId).
 *   2. If a URL is given, fetches it (the renderer is `file://` origin and can't
 *      `fetch()` remote URLs in the packaged app). Image responses become vision
 *      content; text responses are folded into the prose prompt.
 *   3. Runs `completeVision` with a strict JSON system prompt.
 *   4. Parses + returns the colors; the renderer validates each hex before
 *      saving. We do light validation here so a malformed model reply is reported
 *      as an error rather than a silent empty theme.
 *
 * This mirrors how `pi-vision-proxy.ts` treats `~/.pi/agent/vision-proxy.json`
 * as the model source and how `connection-setup-service.ts` runs a one-shot
 * utility completion from the main process.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  ImportedTheme,
  ThemeImportInput,
  ThemeImportResult,
} from "@peach-pi/shared-types";

const AGENT_DIR = path.join(homedir(), ".pi", "agent");
const CONFIG_PATH = path.join(AGENT_DIR, "vision-proxy.json");

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL_ID = "claude-sonnet-4-5";

interface RawVisionConfig {
  provider?: string;
  modelId?: string;
  [key: string]: unknown;
}

/** Read just the model selection from vision-proxy.json (provider + modelId).
 *  Falls back to the extension defaults if the file is missing or partial. */
async function readVisionModel(): Promise<UtilityModelConfig> {
  try {
    const raw = JSON.parse(
      await readFile(CONFIG_PATH, "utf8"),
    ) as RawVisionConfig;
    const provider =
      typeof raw.provider === "string" && raw.provider
        ? raw.provider
        : DEFAULT_PROVIDER;
    const modelId =
      typeof raw.modelId === "string" && raw.modelId
        ? raw.modelId
        : DEFAULT_MODEL_ID;
    return { provider, id: modelId };
  } catch {
    return { provider: DEFAULT_PROVIDER, id: DEFAULT_MODEL_ID };
  }
}

// Local view of the pi-client utility model config type — avoids importing the
// type across the workspace boundary just to mirror two fields.
type UtilityModelConfig = { provider: string; id: string };

const SYSTEM_PROMPT = `You design color themes for a desktop coding app. Given a description, URL contents, or screenshot of a color scheme (often an iTerm2 / terminal theme), extract a palette as JSON.

Respond with ONLY a JSON object on a single line, no prose, no markdown fences. The shape is:
{"name": string, "scheme": "dark" | "light", "primaries": {"bg": "#hex", "fg": "#hex", "accent": "#hex", "warning": "#hex", "danger": "#hex", "metalDye": "#hex", "screen": "#hex", "screenText": "#hex", "engraveActive": "#hex"}}

Rules:
- Every color is a 6-digit hex (e.g. "#1e1e2e"). Include the leading #.
- "bg" is the app background; "fg" is the main text color; "accent" is the highlight color (links, active states, selection).
- "warning" is amber/yellow; "danger" is red/pink.
- "metalDye" tints brushed-metal surfaces (subtle, often a muted version of accent or bg).
- "screen" is the composer's recessed display background; "screenText" is its ink.
- "engraveActive" is the color of the lit sidebar nav item.
- "scheme": "dark" if the background is dark, "light" if the background is light.
- "name": a short human label (e.g. "Dracula", "Tokyo Night"). Omit if no obvious name.
- Include only the keys you can confidently assign; missing keys are fine.
- Output nothing except the JSON object.`;

/** Fetch a URL via the main process (renderer is `file://` and can't `fetch()`
 *  remote hosts). Returns either an image (base64 + mime) or text. */
async function fetchUrl(
  url: string,
): Promise<
  | { kind: "image"; data: string; mimeType: string }
  | { kind: "text"; text: string }
  | { kind: "error"; error: string }
> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return { kind: "error", error: `HTTP ${res.status}` };
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.startsWith("image/")) {
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        kind: "image",
        data: buf.toString("base64"),
        mimeType: (contentType.split(";")[0] ?? "image/png").trim(),
      };
    }
    const text = await res.text();
    return { kind: "text", text: text.slice(0, 8000) };
  } catch (err) {
    return { kind: "error", error: String(err) };
  }
}

/** Parse the model's reply into an ImportedTheme. Strips markdown fences and
 *  leading prose. Returns null if no JSON object can be located. */
function parseThemeJson(text: string): ImportedTheme | null {
  let candidate = text.trim();
  // Strip ```json … ``` fences if present.
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) candidate = fence[1].trim();
  // Grab the first {...} block (model may have leading prose).
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const jsonStr = candidate.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const out: ImportedTheme = {};
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      out.name = parsed.name.trim();
    }
    if (parsed.scheme === "dark" || parsed.scheme === "light") {
      out.scheme = parsed.scheme;
    }
    if (parsed.primaries && typeof parsed.primaries === "object") {
      const p = parsed.primaries as Record<string, unknown>;
      const primaries: ImportedTheme["primaries"] = {};
      const allowed = [
        "bg",
        "fg",
        "accent",
        "warning",
        "danger",
        "metalDye",
        "screen",
        "screenText",
        "engraveActive",
      ] as const;
      for (const k of allowed) {
        const v = p[k];
        if (typeof v === "string") primaries[k] = v;
      }
      out.primaries = primaries;
    }
    return out;
  } catch {
    return null;
  }
}

/** Run the import: resolve the vision model, fetch the URL (if any), and call
 *  `completeVision`. Returns the parsed theme colors. */
export async function importTheme(input: ThemeImportInput): Promise<ThemeImportResult> {
  const config = await readVisionModel();
  const { completeVision } = await import("@peach-pi/pi-client");

  const promptParts: string[] = [];
  if (input.prompt && input.prompt.trim()) promptParts.push(input.prompt.trim());

  let images: Array<{ data: string; mimeType: string }> | undefined;

  if (input.url) {
    const fetched = await fetchUrl(input.url);
    if (fetched.kind === "error") {
      return { ok: false, error: `Could not fetch URL: ${fetched.error}` };
    }
    if (fetched.kind === "image") {
      images = [{ data: fetched.data, mimeType: fetched.mimeType }];
      if (!promptParts.length) {
        promptParts.push("Extract the color palette from this image.");
      }
    } else {
      promptParts.push(
        `The URL ${input.url} returned this color-scheme definition. Interpret the ANSI color codes (e.g. Ansi 0 = background, Ansi 7/8 = foreground, Ansi 1-6 = accents/status) into the theme palette:\n\n${fetched.text}`,
      );
    }
  }

  if (input.imageData) {
    images = [
      {
        data: input.imageData,
        mimeType: input.imageMimeType || "image/png",
      },
    ];
    if (!promptParts.length) {
      promptParts.push("Extract the color palette from this screenshot.");
    }
  }

  if (!promptParts.length && !images) {
    return { ok: false, error: "Nothing to import — provide a name, URL, or screenshot." };
  }

  const userText = promptParts.join("\n\n");
  const text = await completeVision(config, {
    systemPrompt: SYSTEM_PROMPT,
    userText,
    images,
    temperature: 0.3,
    maxTokens: 400,
  });

  if (!text) {
    return {
      ok: false,
      error:
        "The vision model returned no response. Check that a vision-capable model is configured in Settings → Vision proxy.",
    };
  }

  const parsed = parseThemeJson(text);
  if (!parsed) {
    return { ok: false, error: "Could not parse the model's reply as a theme." };
  }
  if (!parsed.name && !parsed.primaries) {
    return {
      ok: false,
      error: "The model returned an empty theme.",
    };
  }
  return { ok: true, theme: parsed };
}
