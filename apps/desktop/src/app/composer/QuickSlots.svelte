<script lang="ts">
  import type { CommandInfo, SlotToggleSpec } from "@peach-pi/shared-types";
  import { quickSlots, SLOT_COUNT, type QuickSlot } from "../../stores/quick-slots.svelte";

  let {
    commands,
    cavemanEnabled,
    onToggleCaveman,
    onInjectSkill,
    onRunCommand,
    onRunSystem,
    onRunRaw,
    onRequestCommands,
    onAutoDetect,
  }: {
    /** All assignable commands (system + skills + extensions + prompts). */
    commands: CommandInfo[];
    cavemanEnabled: boolean;
    onToggleCaveman: () => void;
    onInjectSkill: (cmd: CommandInfo) => void;
    onRunCommand: (cmd: CommandInfo) => void;
    onRunSystem: (name: string) => void;
    onRunRaw: (raw: string) => void;
    /** Ask the host to lazy-load the slash command list before the picker shows. */
    onRequestCommands: () => void;
    /** Probe a command with a helper LLM to propose toggle behavior. */
    onAutoDetect: (kind: CommandInfo["kind"], name: string) => Promise<SlotToggleSpec | null>;
  } = $props();

  quickSlots.init();

  const kindBadge: Record<CommandInfo["kind"], string> = {
    skill: "bg-emerald-500/15 text-emerald-700",
    extension: "bg-sky-500/15 text-sky-700",
    prompt: "bg-violet-500/15 text-violet-700",
    system: "bg-amber-500/15 text-amber-700",
  };

  function cmdFor(ref: { kind: CommandInfo["kind"]; name: string }): CommandInfo {
    return (
      commands.find((c) => c.kind === ref.kind && c.name === ref.name) ?? {
        name: ref.name,
        kind: ref.kind,
        description: "",
      }
    );
  }

  function isToggle(slot: QuickSlot): boolean {
    return slot.behavior.type !== "fire";
  }

  function ledOn(index: number, slot: QuickSlot): boolean {
    if (slot.behavior.type === "bound") return cavemanEnabled;
    if (slot.behavior.type === "toggle") return quickSlots.toggles[index] ?? false;
    return false;
  }

  function activate(index: number): void {
    const slot = quickSlots.slots[index];
    if (!slot) {
      openPicker(index);
      return;
    }
    const b = slot.behavior;
    if (b.type === "bound" && b.binding === "caveman") {
      onToggleCaveman();
      return;
    }
    if (b.type === "toggle") {
      const on = quickSlots.flipToggle(index);
      onRunRaw(on ? b.on : b.off);
      return;
    }
    // fire
    if (slot.ref.kind === "skill") onInjectSkill(cmdFor(slot.ref));
    else if (slot.ref.kind === "system") onRunSystem(slot.ref.name);
    else onRunCommand(cmdFor(slot.ref));
  }

  // ── Picker ──────────────────────────────────────────────────────────────
  let pickerIndex = $state<number | null>(null);
  let query = $state("");
  let picked = $state<CommandInfo | null>(null);
  let mode = $state<"fire" | "toggle">("fire");
  let onCmd = $state("");
  let offCmd = $state("");
  let label = $state("");
  let detecting = $state(false);
  let detectNote = $state("");

  const matches = $derived(
    pickerIndex === null
      ? []
      : commands
          .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 40),
  );

  function openPicker(index: number): void {
    onRequestCommands();
    pickerIndex = index;
    query = "";
    const existing = quickSlots.slots[index];
    detectNote = "";
    if (existing && existing.behavior.type !== "bound") {
      picked = cmdFor(existing.ref);
      mode = existing.behavior.type;
      label = existing.label;
      onCmd = existing.behavior.type === "toggle" ? existing.behavior.on : `/${existing.ref.name}`;
      offCmd = existing.behavior.type === "toggle" ? existing.behavior.off : `/${existing.ref.name} off`;
    } else {
      picked = null;
      mode = "fire";
      label = "";
      onCmd = "";
      offCmd = "";
    }
  }

  function closePicker(): void {
    pickerIndex = null;
    picked = null;
  }

  function choose(cmd: CommandInfo): void {
    picked = cmd;
    mode = "fire";
    label = cmd.name;
    onCmd = `/${cmd.name}`;
    offCmd = `/${cmd.name} off`;
    detectNote = "";
  }

  async function autoDetect(): Promise<void> {
    if (!picked || detecting) return;
    detecting = true;
    detectNote = "";
    try {
      const spec = await onAutoDetect(picked.kind, picked.name);
      if (!spec) {
        detectNote = "Couldn't inspect — enter commands manually.";
        return;
      }
      if (spec.isToggle && spec.on && spec.off) {
        mode = "toggle";
        onCmd = spec.on;
        offCmd = spec.off;
        label = spec.label;
        detectNote = spec.reason || "Detected as a toggle.";
      } else {
        mode = "fire";
        label = spec.label || picked.name;
        detectNote = spec.reason || "Reads as a one-shot action — use Press.";
      }
    } finally {
      detecting = false;
    }
  }

  function save(): void {
    if (pickerIndex === null || !picked) return;
    const ref = { kind: picked.kind, name: picked.name };
    const slotLabel = label.trim() || picked.name;
    const slot: QuickSlot =
      mode === "toggle"
        ? { ref, label: slotLabel, behavior: { type: "toggle", on: onCmd.trim(), off: offCmd.trim() } }
        : { ref, label: slotLabel, behavior: { type: "fire" } };
    quickSlots.assign(pickerIndex, slot);
    closePicker();
  }

  function clearSlot(): void {
    if (pickerIndex === null) return;
    quickSlots.clear(pickerIndex);
    closePicker();
  }
</script>

<div class="composer__slots-wrap">
  <div class="composer__slots" role="group" aria-label="Quick-access actions">
    {#each Array(SLOT_COUNT) as _, index (index)}
      {@const slot = quickSlots.slots[index]}
      {#if slot}
        <span class="devbtn">
          <button
            class="devbtn__switch {ledOn(index, slot) ? 'devbtn__switch--on' : ''}"
            aria-pressed={isToggle(slot) ? ledOn(index, slot) : undefined}
            onclick={() => activate(index)}
            oncontextmenu={(e) => {
              e.preventDefault();
              openPicker(index);
            }}
            data-testid={`quick-slot-${index}`}
            title={`${slot.label}${isToggle(slot) ? " (toggle)" : ""} — right-click to change`}
            aria-label={slot.label}
          >
            <span class="devbtn__led" aria-hidden="true"></span>
            <span class="devbtn__cap" aria-hidden="true"></span>
            <span class="devbtn__caption">{slot.label}</span>
          </button>
        </span>
      {:else}
        <span class="devbtn devbtn--empty">
          <button
            class="devbtn__switch"
            onclick={() => openPicker(index)}
            data-testid={`quick-slot-${index}`}
            title="Add a quick action"
            aria-label="Add a quick action"
          >
            <span class="devbtn__led" aria-hidden="true"></span>
            <span class="devbtn__cap" aria-hidden="true">+</span>
            <span class="devbtn__caption">Add</span>
          </button>
        </span>
      {/if}
    {/each}
  </div>

  {#if pickerIndex !== null}
    <!-- click-away backdrop -->
    <button
      class="fixed inset-0 z-40 cursor-default"
      aria-label="Close picker"
      onclick={closePicker}
    ></button>
    <div
      class="absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-lg border border-border-strong bg-surface p-2 shadow-xl"
      data-testid="quick-slot-picker"
    >
      {#if !picked}
        <input
          class="mb-2 w-full rounded border border-border-strong bg-surface-2 px-2 py-1 text-sm text-fg outline-none"
          placeholder="Search commands…"
          bind:value={query}
          autofocus
        />
        <div class="max-h-72 overflow-y-auto">
          {#each matches as cmd (cmd.kind + ":" + cmd.name)}
            <button
              class="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              onclick={() => choose(cmd)}
            >
              <span class="shrink-0 whitespace-nowrap font-mono text-fg">/{cmd.name}</span>
              <span class="min-w-0 truncate text-xs text-faint">{cmd.description}</span>
              <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide {kindBadge[cmd.kind]}">{cmd.kind}</span>
            </button>
          {:else}
            <div class="px-2 py-2 text-xs text-faint">No matching commands</div>
          {/each}
        </div>
        {#if quickSlots.slots[pickerIndex]}
          <button
            class="mt-2 w-full rounded px-2 py-1 text-xs text-red-600 hover:bg-surface-2"
            onclick={clearSlot}>Clear this slot</button
          >
        {/if}
      {:else}
        <div class="mb-2 flex items-baseline gap-2 px-1 text-sm">
          <span class="font-mono text-fg">/{picked.name}</span>
          <span class="ml-auto rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide {kindBadge[picked.kind]}">{picked.kind}</span>
        </div>
        <div class="mb-2 flex items-center gap-2">
          <div class="grid flex-1 grid-cols-2 gap-1 rounded bg-surface-2 p-0.5 text-xs">
            <button
              class="rounded px-2 py-1 {mode === 'fire' ? 'bg-surface text-fg shadow-sm' : 'text-faint'}"
              onclick={() => (mode = "fire")}>Press</button
            >
            <button
              class="rounded px-2 py-1 {mode === 'toggle' ? 'bg-surface text-fg shadow-sm' : 'text-faint'}"
              onclick={() => (mode = "toggle")}>Toggle</button
            >
          </div>
          <button
            class="shrink-0 rounded border border-border-strong px-2 py-1 text-xs text-faint hover:bg-surface-2 disabled:opacity-50"
            disabled={detecting}
            title="Inspect this command with a helper LLM"
            onclick={autoDetect}>{detecting ? "Detecting…" : "Auto-detect"}</button
          >
        </div>
        {#if detectNote}
          <p class="mb-2 px-1 text-[10px] text-faint">{detectNote}</p>
        {/if}
        {#if mode === "fire"}
          <p class="mb-2 px-1 text-xs text-faint">
            {picked.kind === "skill"
              ? "Injects the skill into the composer."
              : "Runs this command when pressed."}
          </p>
        {:else}
          <span class="mb-1 block px-1 text-[10px] uppercase tracking-wide text-faint">On command</span>
          <input
            aria-label="On command"
            class="mb-2 w-full rounded border border-border-strong bg-surface-2 px-2 py-1 font-mono text-xs text-fg outline-none"
            bind:value={onCmd}
          />
          <span class="mb-1 block px-1 text-[10px] uppercase tracking-wide text-faint">Off command</span>
          <input
            aria-label="Off command"
            class="mb-2 w-full rounded border border-border-strong bg-surface-2 px-2 py-1 font-mono text-xs text-fg outline-none"
            bind:value={offCmd}
          />
        {/if}
        <div class="flex gap-2">
          <button
            class="rounded px-2 py-1 text-xs text-faint hover:bg-surface-2"
            onclick={() => (picked = null)}>Back</button
          >
          <button
            class="ml-auto rounded bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
            disabled={mode === "toggle" && (!onCmd.trim() || !offCmd.trim())}
            onclick={save}>Save</button
          >
        </div>
      {/if}
    </div>
  {/if}
</div>
