<script lang="ts">
  /**
   * Theme import dialog. Three modes, all powered by the configured vision
   * proxy model (Settings → Vision proxy):
   *
   *   - "name":  describe an iTerm2 scheme by name ("Dracula", "Tokyo Night");
   *              the model recalls the palette from memory.
   *   - "url":   paste a remote URL. The main process fetches it (renderer is
   *              `file://` origin) — an image response becomes vision content,
   *              a text response (plist/json color-scheme file) is interpreted
   *              from its ANSI codes.
   *   - "paste": drop/paste a screenshot; the model reads the colors.
   *
   * On success the result is handed to `theme.addImportedTheme`, which
   * normalizes every hex, saves it as a saved theme alongside the existing
   * saved themes, and activates it. No separate "community themes" store —
   * an imported theme is just a saved theme the model produced.
   */
  import { Dialog } from "bits-ui";
  import X from "@lucide/svelte/icons/x";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Link from "@lucide/svelte/icons/link";
  import Type from "@lucide/svelte/icons/type";
  import Image from "@lucide/svelte/icons/image";
  import { api } from "../lib/ipc";
  import { theme } from "../lib/theme.svelte";
  import { visionProxy } from "../stores/vision-proxy.svelte";
  import type { ThemeImportInput, ThemeImportResult } from "@peach-pi/shared-types";
  import { captureEvent } from "../lib/telemetry";

  let {
    open = $bindable(false),
  }: {
    open?: boolean;
  } = $props();

  const MODES = [
    { id: "name", label: "Name", icon: Type, hint: "iTerm2 scheme name (e.g. Dracula)" },
    { id: "url", label: "URL", icon: Link, hint: "Link to a color-scheme file or screenshot" },
    { id: "paste", label: "Screenshot", icon: Image, hint: "Paste an image from the clipboard" },
  ] as const;
  type Mode = (typeof MODES)[number]["id"];

  let mode = $state<Mode>("name");
  let nameText = $state("");
  let urlText = $state("");
  let pastedImage = $state<{ data: string; mimeType: string; name: string } | null>(null);
  let busy = $state(false);
  let error = $state("");
  // Last successful import — cleared on reopen. Used to show an inline
  // confirmation + quick-delete link until the user closes the dialog.
  let lastImportedId = $state("");

  // Lazy-load the vision proxy config so the UI can report which model it'll use
  // and disable the screenshot/image mode when no vision proxy is set up.
  let modelReady = $state(false);
  $effect(() => {
    if (open && !modelReady) {
      void visionProxy.load().then(() => {
        modelReady = true;
      });
    }
  });

  function reset(): void {
    mode = "name";
    nameText = "";
    urlText = "";
    pastedImage = null;
    busy = false;
    error = "";
    lastImportedId = "";
  }

  /** Model display label. Empty until visionProxy.load() resolves. */
  const modelLabel = $derived(
    `${visionProxy.provider}/${visionProxy.modelId}`,
  );

  /** Can the user submit the current mode? */
  const canSubmit = $derived(
    !busy && (
      (mode === "name" && nameText.trim().length > 0) ||
      (mode === "url" && urlText.trim().length > 0) ||
      (mode === "paste" && pastedImage !== null)
    ),
  );

  function onImageDrop(e: DragEvent): void {
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      void readImage(file);
    }
  }

  function onImagePaste(e: ClipboardEvent): void {
    const file = e.clipboardData?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      void readImage(file);
    }
  }

  async function readImage(file: File): Promise<void> {
    const data = await fileToBase64(file);
    pastedImage = {
      data,
      mimeType: file.type || "image/png",
      name: file.name || "pasted-image.png",
    };
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the `data:<mime>;base64,` prefix.
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function runImport(): Promise<void> {
    error = "";
    busy = true;
    try {
      const input: ThemeImportInput = {};
      if (mode === "name") {
        input.prompt = `Create a color palette for the iTerm2 color scheme named "${nameText.trim()}".`;
      } else if (mode === "url") {
        input.url = urlText.trim();
      } else if (mode === "paste" && pastedImage) {
        input.imageData = pastedImage.data;
        input.imageMimeType = pastedImage.mimeType;
      }

      const result: ThemeImportResult = await api.invoke("theme:import", input);
      if (!result.ok || !result.theme) {
        error = result.error || "The model couldn't produce a theme from that input.";
        return;
      }
      const id = theme.addImportedTheme(result.theme);
      if (!id) {
        error = "The model returned an empty theme (no colors and no name).";
        return;
      }
      lastImportedId = id;
      captureEvent("theme_imported", { mode });
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  /** Drop the just-imported theme and let the user retry. */
  function undoImport(): void {
    if (lastImportedId) theme.deleteSaved(lastImportedId);
    lastImportedId = "";
  }
</script>

<Dialog.Root
  bind:open
  onOpenChange={(o) => { if (!o) reset(); }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 flex w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border-strong bg-surface p-5 shadow-2xl"
      data-testid="theme-import-dialog"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <Dialog.Title class="text-sm font-semibold text-fg">Import a theme</Dialog.Title>
          <Dialog.Description class="mt-0.5 text-[12px] text-faint">
            Name a scheme, paste a URL, or drop a screenshot — the vision model reads the colors.
          </Dialog.Description>
        </div>
        <Dialog.Close
          class="rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X size={16} />
        </Dialog.Close>
      </div>

      <!-- Mode tabs -->
      <div class="flex gap-1.5" role="tablist" aria-label="Import source">
        {#each MODES as m}
          {@const active = mode === m.id}
          <button
            type="button"
            role="tab"
            aria-selected={active}
            class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
            class:bg-surface-3={active}
            class:text-fg={active}
            class:bg-surface-2={!active}
            class:text-muted={!active}
            onclick={() => { mode = m.id; error = ""; }}
            data-testid={`theme-import-mode-${m.id}`}
          >
            <m.icon class="size-3.5" />
            {m.label}
          </button>
        {/each}
      </div>

      <!-- Mode body -->
      <div class="min-h-[5rem]">
        {#if mode === "name"}
          <input
            type="text"
            class="w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-border-focus"
            placeholder="e.g. Dracula, Tokyo Night, Gruvbox"
            bind:value={nameText}
            onkeydown={(e) => { if (e.key === "Enter" && canSubmit) void runImport(); }}
            aria-label="iTerm2 scheme name"
            data-testid="theme-import-name"
          />
        {:else if mode === "url"}
          <input
            type="url"
            class="w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-border-focus"
            placeholder="https://…/colors.json or https://…/screenshot.png"
            bind:value={urlText}
            onkeydown={(e) => { if (e.key === "Enter" && canSubmit) void runImport(); }}
            aria-label="Theme URL"
            data-testid="theme-import-url"
          />
        {:else if mode === "paste"}
          <div
            class="flex min-h-[5rem] cursor-default flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center"
            role="button"
            tabindex="0"
            aria-label="Paste or drop an image here. Press to focus, then paste."
            ondragover={(e) => e.preventDefault()}
            ondrop={(e) => { e.preventDefault(); onImageDrop(e); }}
            onpaste={onImagePaste}
            onkeydown={(e) => { if (e.key === "Backspace" || e.key === "Delete") pastedImage = null; }}
            data-testid="theme-import-dropzone"
          >
            {#if pastedImage}
              <img
                src="data:{pastedImage.mimeType};base64,{pastedImage.data}"
                alt="Pasted screenshot"
                class="max-h-32 rounded border border-border"
              />
              <button
                type="button"
                class="text-xs text-faint transition-colors hover:text-fg"
                onclick={() => { pastedImage = null; }}
              >Remove</button>
            {:else}
              <Image class="size-6 text-faint" />
              <p class="text-xs text-muted">Paste (⌘V) or drop an image here</p>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Status row -->
      {#if error}
        <p class="text-xs text-danger" data-testid="theme-import-error">{error}</p>
      {:else if lastImportedId}
        <div class="flex items-center justify-between gap-2 text-xs text-fg-soft">
          <span>Imported as “{theme.savedThemes.find((t) => t.id === lastImportedId)?.name ?? "theme"}” and applied.</span>
          <button
            type="button"
            class="text-faint transition-colors hover:text-fg"
            onclick={undoImport}
          >Undo</button>
        </div>
      {/if}

      <div class="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
        <span class="text-[11px] text-faint" data-testid="theme-import-model-label">
          Using {modelReady ? modelLabel : "vision proxy model"}
        </span>
        <div class="flex items-center gap-2">
          {#if lastImportedId}
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              onclick={() => { open = false; }}
            >Done</button>
          {:else}
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-xs text-faint transition-colors hover:bg-surface-2 hover:text-fg"
              onclick={() => { open = false; }}
            >Cancel</button>
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
              disabled={!canSubmit}
              onclick={() => void runImport()}
              data-testid="theme-import-run"
            >
              <Sparkles class="size-3.5" />
              {busy ? "Reading…" : "Generate"}
            </button>
          {/if}
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
