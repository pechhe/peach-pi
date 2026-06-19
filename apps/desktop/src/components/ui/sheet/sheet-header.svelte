<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "../../../lib/utils";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  bind:this={ref}
  data-slot="sheet-header"
  class={cn("flex flex-col gap-1 border-b border-border px-4 py-3", className)}
  {...restProps}
></div>
