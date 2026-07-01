<script lang="ts">
  import { Separator } from "bits-ui";
  import { cn } from "../../../lib/utils";

  let {
    ref = $bindable(null),
    class: className,
    orientation = "horizontal",
    decorative = true,
    ...restProps
  }: Separator.RootProps = $props();
</script>

<Separator.Root
  bind:ref
  {orientation}
  {decorative}
  class={cn(
    "shrink-0 bg-border",
    orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
    className,
  )}
  {...restProps}
/>
