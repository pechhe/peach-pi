/**
 * Thread-free reads/writes of pi's global `enabledModels` scope
 * (settings.json, shared with the pi TUI). Mirrors the session-bound
 * `PiSession.listModels` / `setModelScoped` logic exactly so the Settings
 * view and the composer dropdown stay consistent.
 */

import { scopeModels, stripThinkingSuffix } from "./scope-models.ts";

export interface ScopedModel {
  provider: string;
  id: string;
  name: string;
  scoped: boolean;
}

/**
 * All auth-configured models paired with their scope membership. An empty
 * `enabledModels` array scopes every model implicitly (matches pi `/model`).
 */
export async function listScopedModels(): Promise<ScopedModel[]> {
  try {
    const sdk = await import("@earendil-works/pi-coding-agent");
    const registry = sdk.ModelRegistry.create(sdk.AuthStorage.create());
    const available = registry.getAvailable();
    const settings = sdk.SettingsManager.create(process.cwd(), sdk.getAgentDir());
    const enabled = settings.getEnabledModels();
    const scopedSet = enabled && enabled.length > 0 ? scopeModels(available, enabled) : available;
    const scopedKeys = new Set(scopedSet.map((m) => `${m.provider}/${m.id}`));
    return available.map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      scoped: scopedKeys.has(`${m.provider}/${m.id}`),
    }));
  } catch {
    return [];
  }
}

/**
 * Toggle a model's membership in the global enabledModels scope. Same
 * semantics as `PiSession.setModelScoped`: when the scope is empty (every
 * model implicitly scoped) and the user unscopes one, we materialize the
 * scope as the full list minus that model.
 */
export async function setModelScoped(
  provider: string,
  modelId: string,
  scoped: boolean,
): Promise<ScopedModel[]> {
  const sdk = await import("@earendil-works/pi-coding-agent");
  const registry = sdk.ModelRegistry.create(sdk.AuthStorage.create());
  const settings = sdk.SettingsManager.create(process.cwd(), sdk.getAgentDir());

  const key = `${provider}/${modelId}`;
  const current = settings.getEnabledModels();
  let next: string[];
  if (current && current.length > 0) {
    if (scoped) {
      next = current.includes(key) ? current : [...current, key];
    } else {
      next = current.filter((p) => stripThinkingSuffix(p) !== key);
    }
  } else {
    // Empty scope means every model is implicitly scoped.
    if (scoped) return listScopedModels();
    next = registry
      .getAvailable()
      .map((m) => `${m.provider}/${m.id}`)
      .filter((k) => k !== key);
  }
  settings.setEnabledModels(next);
  await settings.flush();
  return listScopedModels();
}
