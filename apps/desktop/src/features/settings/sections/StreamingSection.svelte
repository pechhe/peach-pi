<script lang="ts">
  import { Select } from "../../../components/ui/select";
  import {
    STREAM_LOOKS,
    STREAM_SPEEDS,
    streamReveal,
    type StreamLook,
    type StreamSpeed,
  } from "../../../lib/stream-reveal.svelte";
</script>

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">Streaming text</h2>
    <p class="text-xs text-faint">How assistant replies reveal as they stream in.</p>
  </div>
  <div class="flex flex-col items-end gap-2">
    <Select
      class="rounded-md bg-surface-2"
      value={streamReveal.look}
      onValueChange={(v) => streamReveal.setLook(v as StreamLook)}
      items={STREAM_LOOKS.map((l) => ({ value: l.id, label: l.label }))}
      data-testid="stream-look-select"
      aria-label="Reveal look"
    />
    <Select
      class="rounded-md bg-surface-2"
      value={streamReveal.speed}
      onValueChange={(v) => streamReveal.setSpeed(v as StreamSpeed)}
      items={STREAM_SPEEDS.map((s) => ({ value: s.id, label: s.label }))}
      data-testid="stream-speed-select"
      aria-label="Reveal speed"
    />
  </div>
</div>
