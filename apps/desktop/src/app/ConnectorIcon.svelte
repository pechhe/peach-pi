<script lang="ts">
  // Brand icon for a connector catalog tile. Renders a simple-icons silhouette
  // tinted with the brand hex when we have one; otherwise a deterministic
  // monogram tile (so a provider needs no icon to be listed).
  import {
    siNotion,
    siLinear,
    siGithub,
    siGoogledrive,
    siGmail,
    siGooglecalendar,
    siAtlassian,
    siFigma,
    siBox,
    siHubspot,
    siAsana,
    siIntercom,
    siXero,
  } from "simple-icons";

  type SimpleIcon = { path: string; hex: string; title: string };

  // slug (from the catalog entry) → simple-icons icon. Add a line here only
  // when a new provider ships a brand icon; everything else falls back.
  const ICONS: Record<string, SimpleIcon> = {
    notion: siNotion,
    linear: siLinear,
    github: siGithub,
    googledrive: siGoogledrive,
    gmail: siGmail,
    googlecalendar: siGooglecalendar,
    atlassian: siAtlassian,
    figma: siFigma,
    box: siBox,
    hubspot: siHubspot,
    asana: siAsana,
    intercom: siIntercom,
    xero: siXero,
  };

  let {
    slug = null,
    hex = null,
    label,
    size = 20,
  }: { slug?: string | null; hex?: string | null; label: string; size?: number } = $props();

  const icon = $derived(slug ? (ICONS[slug] ?? null) : null);
  const tint = $derived(hex ?? icon?.hex ?? null);

  // Monogram: first alphanumeric of the label, on a hue derived from the label.
  const monogram = $derived((label.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase());
  const hue = $derived(
    [...label].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7),
  );
</script>

{#if icon}
  <svg
    role="img"
    aria-label={icon.title}
    viewBox="0 0 24 24"
    width={size}
    height={size}
    style={tint ? `color:#${tint}` : undefined}
    fill="currentColor"
  >
    <path d={icon.path} />
  </svg>
{:else}
  <span
    class="flex shrink-0 items-center justify-center rounded-md font-semibold text-white"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.5)}px;background:hsl({hue} 55% 45%)"
    aria-label={label}
  >{monogram}</span>
{/if}
