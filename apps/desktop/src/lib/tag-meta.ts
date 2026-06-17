import type { ThreadTag } from "@peach-pi/shared-types";
import Sparkles from "@lucide/svelte/icons/sparkles";
import Bug from "@lucide/svelte/icons/bug";
import Wrench from "@lucide/svelte/icons/wrench";
import FileText from "@lucide/svelte/icons/file-text";
import Cog from "@lucide/svelte/icons/cog";
import Circle from "@lucide/svelte/icons/circle";

/** Lucide icon component shape (all icons share this signature). */
export type TagIcon = typeof Sparkles;

/** Tag → icon + human label. Shared by the sidebar rows and finish toasts. */
export const TAG_META: Record<ThreadTag, { icon: TagIcon; label: string }> = {
  feature: { icon: Sparkles, label: "New feature" },
  bugfix: { icon: Bug, label: "Bug fix" },
  refactor: { icon: Wrench, label: "Refactor" },
  docs: { icon: FileText, label: "Docs" },
  chore: { icon: Cog, label: "Chore" },
  other: { icon: Circle, label: "Other" },
};
