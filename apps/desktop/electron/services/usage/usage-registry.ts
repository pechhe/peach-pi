import type { UsageProvider } from "./usage-shared.ts";
import { AnthropicUsageProvider } from "./providers/anthropic.ts";
import { ZaiUsageProvider } from "./providers/zai.ts";
import { XiaomiMiMoProvider } from "./providers/mimo.ts";
import { OpenRouterUsageProvider } from "./providers/openrouter.ts";
import { NeuralWattUsageProvider } from "./providers/neuralwatt.ts";

/** Registered usage providers, in display order. Each entry constructs its
 *  own CredentialSource internally (so the source is co-located with the
 *  provider that needs it); the registry only lists factories here so
 *  `usage-service.ts` stays inert (cache + emit only). Adding a provider
 *  touches only its file + one line here — never the service. */
export const usageProviders: UsageProvider[] = [
  Object.freeze(new AnthropicUsageProvider()),
  Object.freeze(new ZaiUsageProvider()),
  Object.freeze(new XiaomiMiMoProvider()),
  Object.freeze(new OpenRouterUsageProvider()),
  Object.freeze(new NeuralWattUsageProvider()),
];
