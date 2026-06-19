<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import X from "@lucide/svelte/icons/x";
  import SheetOverlay from "./sheet-overlay.svelte";
  import { cn } from "../../../lib/utils";

  let {
    ref = $bindable(null),
    class: className,
    side = "right",
    portalProps,
    showClose = true,
    children,
    ...restProps
  }: SheetPrimitive.ContentProps & {
    portalProps?: SheetPrimitive.PortalProps;
    side?: "top" | "bottom" | "left" | "right";
    showClose?: boolean;
    children: Snippet;
  } = $props();
</script>

<SheetPrimitive.Portal {...portalProps}>
  <SheetOverlay />
  <SheetPrimitive.Content
    bind:ref
    data-slot="sheet-content"
    class={cn(
      "bg-surface text-fg fixed z-50 flex flex-col gap-0 border-border-strong shadow-2xl transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
      side === "right" &&
        "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-[28rem] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      side === "left" &&
        "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-[28rem] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
      side === "top" &&
        "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
      side === "bottom" &&
        "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
      className,
    )}
    {...restProps}
  >
    {@render children?.()}
    {#if showClose}
      <SheetPrimitive.Close
        class="ring-offset-bg focus:ring-border-focus absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none"
      >
        <X class="size-4" />
        <span class="sr-only">Close</span>
      </SheetPrimitive.Close>
    {/if}
  </SheetPrimitive.Content>
</SheetPrimitive.Portal>
