<script lang="ts" module>
  // Ported from beui-svelte (MIT; Copyright (c) 2026 Saurabh / Henry Petch).
  // Adapted: lucide `alert-circle` (no .svelte in lucide v1) → `circle-alert`.
  import type { Component } from "svelte";
  import Bell from "@lucide/svelte/icons/bell";
  import Info from "@lucide/svelte/icons/info";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Check from "@lucide/svelte/icons/check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import X from "@lucide/svelte/icons/x";
  import type { ToastStatus } from "./use-animated-toast-stack.svelte";

  export const STATUS_ICON: Record<ToastStatus, Component> = {
    neutral: Bell,
    info: Info,
    loading: LoaderCircle,
    success: Check,
    error: CircleAlert,
  };

  // peach-pi tokens: muted→text-muted/faint; info/loading→accent; success→success;
  // error→danger. Mirrors the app's toast level colors.
  export const STATUS_CLASS: Record<ToastStatus, string> = {
    neutral: "text-muted bg-surface-2",
    info: "text-accent bg-accent/10",
    loading: "text-accent bg-accent/10",
    success: "text-success bg-success/10",
    error: "text-danger bg-danger/10",
  };

  export { X };
  export type { ToastStatus };
</script>
