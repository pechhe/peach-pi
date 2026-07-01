<script lang="ts">
  import type { SkillInfo, CommandInfo } from "@peach-pi/shared-types";
  import { api } from "../lib/ipc";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import MessageSquareText from "@lucide/svelte/icons/message-square-text";

  let {
    value = $bindable(""),
    projectId = null,
    placeholder = "",
  }: {
    value?: string;
    projectId?: string | null;
    placeholder?: string;
  } = $props();

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let cursor = $state(0);
  let selIndex = $state(0);
  let dismissed = $state(false);

  // Lazy-loaded slash catalog (skills/prompts per project).
  type SlashItem = { name: string; description: string; kind: "skill" | "prompt" };
  let slashCatalog = $state<SlashItem[]>([]);
  let slashLoaded = $state(false);

  function syncCursor() {
    cursor = textareaEl?.selectionStart ?? 0;
  }

  // Active `/token` immediately left of the caret: must start the
  // line or follow whitespace, and contain no whitespace itself.
  function tokenContext(trigger: "/" | "@") {
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf(trigger);
    if (at === -1) return null;
    if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
    const token = before.slice(at + 1);
    if (/\s/.test(token)) return null;
    return { start: at, query: token.toLowerCase() };
  }

  const slashContext = $derived(tokenContext("/"));
  const query = $derived(slashContext?.query ?? null);

  const slashMatches = $derived.by(() => {
    if (query === null) return [];
    return slashCatalog
      .filter((c) => c.name.toLowerCase().includes(query))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(query)) - Number(!b.name.toLowerCase().startsWith(query)))
      .slice(0, 20);
  });
  const matchCount = $derived(slashMatches.length);
  const menuOpen = $derived(query !== null && !dismissed && matchCount > 0);

  // ── Effects (declared after every derived they read) ───────────────────
  $effect(() => {
    if (query !== null && !slashLoaded) {
      slashLoaded = true;
      void api.invoke("resources:inspect", projectId).then((r) => {
        const skills = (r.skills as SkillInfo[]).map((s) => ({
          name: s.name,
          description: s.description,
          kind: "skill" as const,
        }));
        const prompts = (r.prompts as CommandInfo[]).map((p) => ({
          name: p.name,
          description: p.description,
          kind: "prompt" as const,
        }));
        slashCatalog = [...skills, ...prompts];
      });
    }
  });
  // Reset selection + dismissal whenever the live query changes.
  $effect(() => {
    void query;
    void matchCount;
    selIndex = 0;
    dismissed = false;
  });

  // Reload skills/prompts when the project changes (catalog is project-scoped).
  $effect(() => {
    void projectId;
    slashLoaded = false;
    slashCatalog = [];
  });

  // Replace the active `/query` token in the text.
  function replaceToken(replacement: string) {
    const ctx = slashContext;
    if (!ctx) return;
    const before = value.slice(0, ctx.start);
    const after = value.slice(cursor);
    value = before + replacement + after;
    const pos = (before + replacement).length;
    requestAnimationFrame(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(pos, pos);
      cursor = pos;
    });
  }

  function pickSlash(item: SlashItem) {
    // pi resolves `/name` to its skill/prompt/extension command at fire time.
    replaceToken(`/${item.name} `);
  }

  function pickActive(i: number) {
    if (query !== null) pickSlash(slashMatches[i]!);
  }

  function onKeydown(e: KeyboardEvent) {
    if (!menuOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selIndex = (selIndex + 1) % matchCount;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selIndex = (selIndex - 1 + matchCount) % matchCount;
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickActive(selIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      dismissed = true;
    }
  }
</script>

<div class="relative flex flex-col gap-2">
  <textarea
    bind:this={textareaEl}
    class="min-h-24 resize-none rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm outline-none focus:border-border-focus"
    {placeholder}
    bind:value
    onkeydown={onKeydown}
    oninput={syncCursor}
    onkeyup={syncCursor}
    onclick={syncCursor}
    data-testid="automation-prompt"
  ></textarea>

  {#if menuOpen}
    <div
      class="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border-strong bg-surface p-1 shadow-lg"
      data-testid="automation-prompt-menu"
    >
      {#each slashMatches as item, i (item.kind + item.name)}
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm {i === selIndex
            ? 'bg-surface-2 text-fg'
            : 'text-fg-soft'}"
          onmouseenter={() => (selIndex = i)}
          onclick={() => pickActive(i)}
        >
          {#if item.kind === "skill"}<BookOpen size={14} class="shrink-0 text-faint" />{:else}<MessageSquareText size={14} class="shrink-0 text-faint" />{/if}
          <span class="shrink-0 font-medium">/{item.name}</span>
          <span class="truncate text-[12px] text-faint">{item.description}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
