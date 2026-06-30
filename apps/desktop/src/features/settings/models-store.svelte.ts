import type { ModelInfo } from "@peach-pi/shared-types";
import { api } from "../../lib/ipc";

/**
 * Shared model list + utility-model selection for the Settings view.
 *
 * Both the "Utility model" and "Vision proxy" sections render selects built
 * from the scoped model list (`app:listModels`), and the utility-model
 * selection may fall outside the scoped set. Keeping the list + the merged
 * `grouped`/`byKey` views in one place avoids a double fetch and keeps the
 * "surface the configured model even when out of scope" rule consistent
 * between the two sections.
 */
let models = $state<ModelInfo[]>([]);
let utilityModel = $state<ModelInfo | null>(null);
let selectedKey = $state("");
let loaded = false;

export const keyOf = (m: { provider: string; id: string }) => `${m.provider}:${m.id}`;

export const settingsModels = {
  get models(): ModelInfo[] {
    return models;
  },
  get utilityModel(): ModelInfo | null {
    return utilityModel;
  },
  get selectedKey(): string {
    return selectedKey;
  },
  get byKey(): Map<string, ModelInfo> {
    return new Map(models.map((m) => [keyOf(m), m]));
  },
  /** Scoped models ∪ the currently-configured utility model, grouped by provider. */
  get grouped(): { provider: string; items: ModelInfo[] }[] {
    const groups = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const arr = groups.get(m.provider);
      if (arr) arr.push(m);
      else groups.set(m.provider, [m]);
    }
    // Surface the configured utility model even when it isn't in the scoped
    // list, so the Select can display and re-select it.
    if (utilityModel && !this.byKey.has(keyOf(utilityModel))) {
      const arr = groups.get(utilityModel.provider);
      if (arr) arr.push(utilityModel);
      else groups.set(utilityModel.provider, [utilityModel]);
    }
    return [...groups.entries()].map(([provider, items]) => ({ provider, items }));
  },
  /** Idempotent: only the first caller fetches. */
  async load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    [models, utilityModel] = await Promise.all([
      api.invoke("app:listModels"),
      api.invoke("app:getUtilityModel"),
    ]);
    selectedKey = utilityModel ? keyOf(utilityModel) : "";
  },
  async pickUtilityModel(key: string): Promise<void> {
    selectedKey = key;
    // Resolve from the merged scoped ∪ persisted set so a selection that's
    // currently out of scope (but still configured) isn't silently nulled out.
    const merged = new Map(this.grouped.flatMap((g) => g.items).map((m) => [keyOf(m), m]));
    const model = key ? (merged.get(key) ?? this.byKey.get(key) ?? null) : null;
    utilityModel = await api.invoke("app:setUtilityModel", model);
    selectedKey = utilityModel ? keyOf(utilityModel) : "";
  },
};
