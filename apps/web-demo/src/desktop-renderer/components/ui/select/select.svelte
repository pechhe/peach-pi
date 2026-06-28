<script lang="ts">
  import { Select } from "bits-ui";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { cn } from "../../../lib/utils";

  type Option = { value: string; label: string; group?: string };

  let {
    value = $bindable(""),
    items,
    placeholder = "Select…",
    disabled = false,
    class: className,
    contentClass,
    onValueChange,
    ...restProps
  }: {
    value?: string;
    items: Option[];
    placeholder?: string;
    disabled?: boolean;
    class?: string;
    contentClass?: string;
    onValueChange?: (value: string) => void;
  } & Record<string, unknown> = $props();

  const selectedLabel = $derived(items.find((i) => i.value === value)?.label);

  // Group items by their optional `group` key, preserving first-seen order.
  // Ungrouped items collapse under a single headingless bucket (key "").
  const sections = $derived.by(() => {
    const order: string[] = [];
    const map = new Map<string, Option[]>();
    for (const item of items) {
      const key = item.group ?? "";
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(item);
    }
    return order.map((key) => ({ key, items: map.get(key)! }));
  });
</script>

{#snippet option(item: Option)}
  <Select.Item
    value={item.value}
    label={item.label}
    class="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-fg-soft outline-none select-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg data-[disabled]:opacity-40"
  >
    {#snippet children({ selected })}
      <span class="truncate">{item.label}</span>
      {#if selected}
        <Check class="size-4 shrink-0 text-fg" />
      {/if}
    {/snippet}
  </Select.Item>
{/snippet}

<Select.Root type="single" bind:value {items} {onValueChange} {disabled}>
  <Select.Trigger
    {...restProps}
    data-slot="select-trigger"
    class={cn(
      "flex items-center justify-between gap-2 rounded-lg border border-border-strong bg-bg px-3 py-1.5 text-sm outline-none transition-colors hover:border-border-focus focus:border-border-focus disabled:opacity-40 data-[state=open]:border-border-focus",
      className,
    )}
  >
    <span class={cn("truncate", selectedLabel ? "text-fg" : "text-faint")}>
      {selectedLabel ?? placeholder}
    </span>
    <ChevronDown class="size-4 shrink-0 text-faint" />
  </Select.Trigger>

  <Select.Portal>
    <Select.Content
      data-slot="select-content"
      sideOffset={4}
      class={cn(
        "z-50 max-h-72 min-w-(--bits-select-anchor-width) overflow-y-auto rounded-lg border border-border-strong bg-surface p-1 shadow-lg outline-none",
        contentClass,
      )}
    >
      <Select.Viewport>
        {#each sections as section (section.key)}
          {#if section.key}
            <Select.Group>
              <Select.GroupHeading class="px-2 py-1 text-xs font-medium text-faint">
                {section.key}
              </Select.GroupHeading>
              {#each section.items as item (item.value)}
                {@render option(item)}
              {/each}
            </Select.Group>
          {:else}
            {#each section.items as item (item.value)}
              {@render option(item)}
            {/each}
          {/if}
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
