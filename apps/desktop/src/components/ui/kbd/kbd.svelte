<script lang="ts">
  // shadcn-svelte Kbd.Root, styled to the app's tokens.
  import { cn } from "../../../lib/utils";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLElement> = $props();
</script>

<kbd
  class={cn(
    "inline-flex select-none items-center rounded border border-border-strong bg-bg px-1.5 py-0.5 text-[11px] font-medium text-fg shadow-sm",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</kbd>
