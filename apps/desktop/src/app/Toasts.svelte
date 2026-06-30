<script lang="ts">
  // Adapter: renders the ported beui AnimatedToastStack driven by the
  // existing `extensionUi` singleton store. The store API (notify / pushToast /
  // dismiss) and its 5000ms auto-dismiss timers are unchanged, so the 12+
  // call sites and the `event:notice` IPC path keep working untouched.
  // Each store toast is mapped to an AnimatedToast with:
  //   info→"info", warning→"neutral", error→"error" status
  // (peach-pi has no "warning" status; neutral renders muted.)
  // duration:0 disables the beui hook's own timers (store owns timing).
  import { extensionUi } from "../stores/extension-ui.svelte";
  import AnimatedToastStack from "../lib/beui/animated-toast-stack.svelte";
  import type { AnimatedToast } from "../lib/beui/use-animated-toast-stack.svelte";
  import type { ToastStatus } from "../lib/beui/use-animated-toast-stack.svelte";
  import { createRawSnippet } from "svelte";
  import { portal } from "../lib/portal";

  const LEVEL_TO_STATUS: Record<"info" | "warning" | "error", ToastStatus> = {
    info: "info",
    warning: "neutral",
    error: "error",
  };

  const text = (s: string) => createRawSnippet(() => ({ render: () => s }));

  const toasts = $derived<AnimatedToast[]>(
    extensionUi.toasts.map((t) => ({
      id: String(t.id),
      title: text(t.message),
      status: LEVEL_TO_STATUS[t.level],
      duration: 0,
      dismissible: true,
      action: t.action
        ? {
            label: text(t.action!.label),
            onClick: () => {
              t.action?.run();
              extensionUi.dismiss(t.id);
            },
          }
        : undefined,
    })),
  );

  const onDismiss = (id: string) => extensionUi.dismiss(Number(id));
</script>

{#if toasts.length > 0}
  <!-- Anchored bottom-right of the window (sidebar is on the left, so this is
       inside the content area). The wrapper is portaled to <body> so its z-index
       is resolved in the root stacking context — the App root (.sidebar-device)
       carries `isolation: isolate`, which would otherwise trap the toast's
       z-index below the floating /btw button (also portaled to <body>, z-50).
       z-[60] sits above that button but below modal dialogs (z-100). beui
       stack renders flex-col-reverse so newer toasts stack upward;
       enter/exit/drag animations are handled by beui. -->
  <div
    use:portal
    class="fixed bottom-6 right-4 z-[60] flex w-80 flex-col"
    style="-webkit-app-region: no-drag"
    data-testid="toasts"
  >
    <AnimatedToastStack {toasts} {onDismiss} placement="static" position="bottom-right" class="w-full max-w-none" />
  </div>
{/if}
