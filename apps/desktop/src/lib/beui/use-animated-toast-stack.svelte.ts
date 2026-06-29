// Ported from beui-svelte (MIT; Copyright (c) 2026 Saurabh / Henry Petch).
// Verbatim (runes-based). Auto-dismiss timers are reconciled whenever a
// toast's createdAt/duration signature changes.
import type { Snippet } from "svelte";

export type ToastStatus = "neutral" | "info" | "loading" | "success" | "error";
export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
export type AnimatedToastAction = {
  label: Snippet;
  onClick: (toast: AnimatedToast) => void;
};
export type AnimatedToast = {
  id: string;
  title: Snippet;
  description?: Snippet;
  status?: ToastStatus;
  icon?: Snippet;
  action?: AnimatedToastAction;
  duration?: number;
  dismissible?: boolean;
  createdAt?: number;
};
export type ToastInput = Omit<AnimatedToast, "id" | "createdAt"> & { id?: string };
export type ToastClassNames = {
  root?: string;
  item?: string;
  surface?: string;
  iconWrap?: string;
  content?: string;
  title?: string;
  description?: string;
  action?: string;
  close?: string;
};

let idSeed = 0;
function createToast(input: ToastInput, defaultDuration: number): AnimatedToast {
  return {
    duration: defaultDuration,
    dismissible: true,
    ...input,
    id: input.id ?? `toast-${Date.now()}-${idSeed++}`,
    createdAt: Date.now(),
  };
}

export interface UseAnimatedToastStackOptions {
  initialToasts?: ToastInput[];
  defaultDuration?: number;
  limit?: number;
}

/**
 * Svelte port of the React useAnimatedToastStack hook. Runes-based.
 *
 * Auto-dismiss timers are recreated whenever a toast's createdAt/duration
 * signature changes (e.g. a duration bump on update), mirroring the React
 * effect that reconciles timers against the current toast set.
 */
function useAnimatedToastStack({
  initialToasts = [],
  defaultDuration = 4200,
  limit,
}: UseAnimatedToastStackOptions = {}) {
  let toasts = $state(initialToasts.map((t) => createToast(t, defaultDuration)));

  // Map of id -> { timer, signature } so we only reset a timer when the toast
  // identity meaningfully changes.
  const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; signature: string }>();

  const dismissToast = (id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
  };

  const clearToasts = () => {
    toasts = [];
  };

  const showToast = (input: ToastInput) => {
    const toast = createToast(input, defaultDuration);
    toasts = typeof limit === "number" ? [...toasts, toast].slice(-limit) : [...toasts, toast];
    return toast.id;
  };

  const updateToast = (id: string, patch: Partial<ToastInput>) => {
    toasts = toasts.map((t) =>
      t.id === id
        ? {
            ...t,
            ...patch,
            id,
            createdAt: patch.duration === undefined ? t.createdAt : Date.now(),
          }
        : t,
    );
  };

  // Reconcile timers whenever toasts change.
  $effect(() => {
    const activeIds = new Set(toasts.map((t) => t.id));
    timers.forEach((entry, id) => {
      if (!activeIds.has(id)) {
        clearTimeout(entry.timer);
        timers.delete(id);
      }
    });

    for (const toast of toasts) {
      const duration = toast.duration ?? defaultDuration;
      const existing = timers.get(toast.id);
      if (duration <= 0) {
        if (existing) {
          clearTimeout(existing.timer);
          timers.delete(toast.id);
        }
        continue;
      }
      const createdAt = toast.createdAt ?? Date.now();
      const signature = `${createdAt}:${duration}`;
      if (existing?.signature === signature) continue;
      if (existing) clearTimeout(existing.timer);
      const elapsed = Date.now() - createdAt;
      const remaining = Math.max(duration - elapsed, 0);
      const timer = setTimeout(() => {
        timers.delete(toast.id);
        dismissToast(toast.id);
      }, remaining);
      timers.set(toast.id, { timer, signature });
    }
  });

  // Clear all timers on teardown.
  $effect(() => {
    return () => {
      timers.forEach((entry) => clearTimeout(entry.timer));
      timers.clear();
    };
  });

  return {
    get toasts() {
      return toasts;
    },
    showToast,
    updateToast,
    dismissToast,
    clearToasts,
  };
}
