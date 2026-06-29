import { randomUUID } from "node:crypto";
import { shell } from "electron";
import type { AuthLoginEvent, AuthProviderStatus } from "@peach-pi/shared-types";
import type * as PiSdk from "@earendil-works/pi-coding-agent";

import type { Emit } from "../ipc/registry.ts";

type Sdk = typeof import("@earendil-works/pi-coding-agent");
/** pi's OAuth callback bag, derived from the SDK so it tracks pi releases. */
type LoginCallbacks = Parameters<PiSdk.AuthStorage["login"]>[1];

/**
 * Owns all provider auth state, backed by pi's `AuthStorage` (~/.pi/agent/
 * auth.json) — the same store the pi TUI's `/login` writes. Nothing here
 * reimplements OAuth: `startOAuthLogin` calls pi's `AuthStorage.login` and
 * bridges its callbacks (open URL, prompt, select, manual code) to the
 * renderer over IPC events. The provider catalogue, display names, and
 * OAuth-capability all come from pi (`ModelRegistry` + `getOAuthProviders`),
 * so new providers appear automatically.
 *
 * Credential values never cross to the renderer — only auth *status*.
 */
export class AuthService {
  private emit: Emit;
  private sdkPromise?: Promise<Sdk>;
  /** requestId → resolver for a pending renderer answer (prompt/select/code). */
  private pending = new Map<string, (value: string | undefined) => void>();
  private abort?: AbortController;

  constructor(emit: Emit) {
    this.emit = emit;
  }

  private sdk(): Promise<Sdk> {
    return (this.sdkPromise ??= import("@earendil-works/pi-coding-agent"));
  }

  /** Every provider pi knows about + its auth status. No secrets. */
  async listProviders(): Promise<AuthProviderStatus[]> {
    const sdk = await this.sdk();
    const auth = sdk.AuthStorage.create();
    const registry = sdk.ModelRegistry.create(auth);
    const oauthIds = new Set(auth.getOAuthProviders().map((p) => p.id));
    const ids = new Set<string>(oauthIds);
    for (const m of registry.getAll()) ids.add(m.provider);

    const out: AuthProviderStatus[] = [];
    for (const id of ids) {
      const status = registry.getProviderAuthStatus(id);
      out.push({
        id,
        name: registry.getProviderDisplayName(id),
        oauth: oauthIds.has(id),
        configured: status.configured,
        source: status.source,
        label: status.label,
      });
    }
    // Configured first, then alphabetical by display name.
    out.sort(
      (a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name),
    );
    return out;
  }

  /** Store an API key for a provider (the simple `/login` → API-key path). */
  async loginApiKey(providerId: string, key: string): Promise<AuthProviderStatus[]> {
    const sdk = await this.sdk();
    sdk.AuthStorage.create().set(providerId, { type: "api_key", key });
    this.emit("event:authProvidersChanged", undefined);
    return this.listProviders();
  }

  /** Clear a provider's stored credentials. */
  async logout(providerId: string): Promise<AuthProviderStatus[]> {
    const sdk = await this.sdk();
    sdk.AuthStorage.create().logout(providerId);
    this.emit("event:authProvidersChanged", undefined);
    return this.listProviders();
  }

  /** Renderer answer to a pending prompt/select/manual-code request. */
  respondLogin(requestId: string, value: string | undefined): void {
    const resolve = this.pending.get(requestId);
    if (!resolve) return;
    this.pending.delete(requestId);
    resolve(value);
  }

  /** Abort the in-flight login and release any waiting callbacks. */
  cancelLogin(): void {
    this.abort?.abort();
    for (const resolve of this.pending.values()) resolve(undefined);
    this.pending.clear();
  }

  /** Run pi's OAuth `/login` for a provider, bridging its callbacks to the UI. */
  async startOAuthLogin(providerId: string): Promise<void> {
    const sdk = await this.sdk();
    this.cancelLogin(); // drop any prior in-flight flow
    const abort = new AbortController();
    this.abort = abort;

    // Emit a request event and wait for the renderer's auth:respondLogin.
    const ask = (
      event: Extract<AuthLoginEvent, { requestId: string }>,
    ): Promise<string | undefined> =>
      new Promise((resolve) => {
        this.pending.set(event.requestId, resolve);
        this.emit("event:authLoginEvent", event);
      });

    const callbacks: LoginCallbacks = {
      onAuth: (info) => {
        void shell.openExternal(info.url);
        this.emit("event:authLoginEvent", {
          kind: "auth",
          url: info.url,
          instructions: info.instructions,
        });
      },
      onDeviceCode: (info) =>
        this.emit("event:authLoginEvent", {
          kind: "deviceCode",
          userCode: info.userCode,
          verificationUri: info.verificationUri,
          intervalSeconds: info.intervalSeconds,
          expiresInSeconds: info.expiresInSeconds,
        }),
      onProgress: (message) => this.emit("event:authLoginEvent", { kind: "progress", message }),
      onPrompt: async (prompt) =>
        (await ask({
          kind: "prompt",
          requestId: randomUUID(),
          message: prompt.message,
          placeholder: prompt.placeholder,
          allowEmpty: prompt.allowEmpty,
        })) ?? "",
      onSelect: (prompt) =>
        ask({
          kind: "select",
          requestId: randomUUID(),
          message: prompt.message,
          options: prompt.options,
        }),
      onManualCodeInput: async () =>
        (await ask({ kind: "manualCode", requestId: randomUUID() })) ?? "",
      signal: abort.signal,
    };

    try {
      await sdk.AuthStorage.create().login(providerId, callbacks);
      this.emit("event:authLoginEvent", { kind: "done", providerId });
      this.emit("event:authProvidersChanged", undefined);
    } catch (err) {
      this.emit("event:authLoginEvent", {
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.pending.clear();
      if (this.abort === abort) this.abort = undefined;
    }
  }
}
