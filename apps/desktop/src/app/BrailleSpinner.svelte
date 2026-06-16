<script lang="ts">
  // Braille spinner ported from peche-pi: 10 frames @ 80ms, tinted with the
  // theme accent. Used standalone (sidebar) and inside <WorkingLabel>.
  const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const FRAME_INTERVAL_MS = 80;

  let { class: klass = "", title }: { class?: string; title?: string } = $props();

  let frame = $state(0);

  $effect(() => {
    const id = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  });
</script>

<span
  class="working-spinner {klass}"
  role={title ? "img" : undefined}
  aria-label={title}
  aria-hidden={title ? undefined : true}>{FRAMES[frame]}</span>
