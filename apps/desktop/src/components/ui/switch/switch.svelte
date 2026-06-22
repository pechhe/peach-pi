<script lang="ts">
  import { Switch } from "bits-ui";
  import { cn } from "../../../lib/utils";

  let {
    checked = $bindable(false),
    disabled = false,
    class: className,
    onCheckedChange,
    ...restProps
  }: {
    checked?: boolean;
    disabled?: boolean;
    class?: string;
    onCheckedChange?: (checked: boolean) => void;
  } & Record<string, unknown> = $props();
</script>

<Switch.Root
  bind:checked
  {disabled}
  {onCheckedChange}
  {...restProps}
  class={cn(
    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-success data-[state=unchecked]:bg-surface-3",
    className,
  )}
>
  <Switch.Thumb
    class="pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[1.125rem] data-[state=unchecked]:translate-x-0.5"
  />
</Switch.Root>
