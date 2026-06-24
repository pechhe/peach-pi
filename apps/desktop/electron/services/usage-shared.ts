import type { ProviderUsageSummary } from "@peach-pi/shared-types";

/** Shared between all usage adapters + the service, to avoid import cycles. */

export const FETCH_TIMEOUT_MS = 10_000;

/** A typed adapter turns a provider's credentials into a usage summary. */
export interface UsageAdapter {
  label: string;
  /** Whether the agent has configured the provider (key/cookie present). */
  configured(): Promise<boolean>;
  /** Fetch the live usage; returns null summary on unrecoverable failure and
   *  a state explaining why (unsupported / unknown / partial / ok). */
  fetch(): Promise<FetchResult>;
}

export type FetchResult = {
  summary: ProviderUsageSummary["summary"];
  state: ProviderUsageSummary["state"];
  note: string | null;
};

/** Short, non-sensitive note from a fetch failure (no key ever included). */
export function failureNote(e: unknown): string {
  if (e instanceof Error && e.message) return `Fetch failed: ${e.message.slice(0, 140)}`;
  return "Fetch failed — check your network and key.";
}

export type AdapterCtor = new () => UsageAdapter;
