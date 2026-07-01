<script lang="ts">
  // shadcn-svelte Kbd.Group — clusters adjacent keys (e.g. ⌘ + B).
  import { cn } from "../../../lib/utils";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  class={cn("inline-flex items-center gap-0.5", className)}
  {...restProps}
>
  {@render children?.()}
</div>
