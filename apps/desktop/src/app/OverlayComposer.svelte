<script lang="ts">
  import type { AppSnapshot, Thread } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";

  let snapshot = $state<AppSnapshot | null>(null);
  let text = $state("");
  let sending = $state(false);
  let textarea = $state<HTMLTextAreaElement | null>(null);

  void api.invoke("app:getSnapshot").then((s) => (snapshot = s));
  api.on("event:snapshot", (s) => (snapshot = s));

  // Target = thread selected in the main window; otherwise a fresh chat.
  const target = $derived.by((): Thread | null => {
    const id = snapshot?.ui.selectedThreadId;
    return (id && snapshot?.threads.find((t) => t.id === id)) || null;
  });

  $effect(() => {
    textarea?.focus();
  });

  async function submit() {
    const body = text.trim();
    if (!body || sending) return;
    sending = true;
    try {
      const thread = target ?? (await api.invoke("threads:createChat"));
      await api.invoke("threads:prompt", thread.id, body);
      text = "";
      await api.invoke("overlay:hide");
    } finally {
      sending = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      void api.invoke("overlay:hide");
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }
</script>

<div
  class="flex h-screen flex-col gap-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-100"
  data-testid="overlay-composer"
>
  <div class="flex items-center justify-between text-xs text-zinc-500" style="-webkit-app-region: drag">
    <span class="truncate">
      {#if target}
        → {target.title || "Untitled thread"}
        {#if target.status === "running"}<span class="text-emerald-400">·&nbsp;running</span>{/if}
      {:else}
        → New chat
      {/if}
    </span>
    <span>⌘⇧Space · Esc to close</span>
  </div>
  <textarea
    bind:this={textarea}
    bind:value={text}
    onkeydown={onKeydown}
    placeholder={target ? "Send to thread… (Enter)" : "Start a chat… (Enter)"}
    class="flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-600"
    data-testid="overlay-input"
  ></textarea>
</div>
