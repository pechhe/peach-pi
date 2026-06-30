<script lang="ts">
  import { Select } from "../../../components/ui/select";
  import { theme, type ComposerStyle } from "../../../lib/theme.svelte";
</script>

<div class="flex items-center justify-between gap-4">
  <div>
    <h2 class="text-sm text-fg">Composer</h2>
    <p class="text-xs text-faint">Light (silver) or dark (anodized) chassis. Auto follows your theme.</p>
  </div>
  <Select
    class="rounded-md bg-surface-2"
    value={theme.composer}
    onValueChange={(v) => theme.setComposer(v as ComposerStyle)}
    items={theme.composerOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
    data-testid="composer-style-select"
    aria-label="Composer appearance"
  />
</div>
