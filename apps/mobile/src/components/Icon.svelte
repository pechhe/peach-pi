<script lang="ts">
  // Inline SVG primitives, drawn in currentColor so callers theme them with a
  // `text-*` utility. Stroke width is per-icon to match the prototype weights.
  type Name =
    | "chevron-left"
    | "chevron-right"
    | "plus"
    | "refresh"
    | "shield"
    | "git-branch"
    | "git-commit"
    | "check"
    | "spinner"
    | "dot"
    | "alert-circle"
    | "laptop"
    | "wifi-off"
    | "face-id"
    | "reconnect"
    | "trash";

  let { name, size = 16, sw = 1.8 }: { name: Name; size?: number; sw?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={sw}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === "chevron-left"}
    <path d="M15 4 7 12l8 8" />
  {:else if name === "chevron-right"}
    <path d="M9 4l8 8-8 8" />
  {:else if name === "plus"}
    <path d="M12 5v14M5 12h14" />
  {:else if name === "refresh"}
    <path d="M3 12a9 9 0 0 1 14-7.2M21 5v4h-4M21 12a9 9 0 0 1-14 7.2M3 19v-4h4" />
  {:else if name === "shield"}
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
  {:else if name === "git-branch"}
    <path d="M6 3v12a3 3 0 0 0 3 3h6M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
  {:else if name === "git-commit"}
    <path d="M6 3v12a3 3 0 0 0 3 3h6M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
  {:else if name === "check"}
    <path d="M5 13l4 4L19 7" stroke-width={sw + 0.6} />
  {:else if name === "spinner"}
    <circle cx="12" cy="12" r="9" stroke="color-mix(in srgb, currentColor 22%, transparent)" stroke-width="3" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke-width="3" />
  {:else if name === "dot"}
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  {:else if name === "alert-circle"}
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16v.4" stroke-width={sw + 0.4} />
  {:else if name === "laptop"}
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  {:else if name === "wifi-off"}
    <path d="M4 7a8 8 0 0 1 16 0M7 11a4 4 0 0 1 8 0M11 15h2" />
  {:else if name === "face-id"}
    <rect x="4" y="4" width="16" height="16" rx="4" stroke-width="1.6" />
    <path d="M8 9v1.5M16 9v1.5M9 15c1 1 5 1 6 0" stroke-width="1.6" />
  {:else if name === "reconnect"}
    <path d="M3 12a9 9 0 0 1 14-7.5M21 5v4h-4M21 12a9 9 0 0 1-14 7.5M3 19v-4h4" />
  {:else if name === "trash"}
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  {/if}
</svg>
