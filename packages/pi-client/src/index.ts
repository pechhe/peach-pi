export { PiSession, type PiSessionCallbacks, type PiSessionMeta } from "./pi-session.ts";
export { extractSessionText } from "./session-search.ts";
export { TranscriptRecorder, type RecorderEvent } from "./transcript-recorder.ts";
export { inspectResources } from "./inspect-resources.ts";
export { inspectCommandToggle } from "./inspect-command.ts";
export { generateCommitMessage } from "./commit-message.ts";
export { generateTitleAndTag, type ThreadTitleAndTag } from "./thread-title.ts";
export {
  resolveUtilityModel,
  resolveSpecificModel,
  completeUtility,
  completeVision,
  listAvailableModels,
  type UtilityModelConfig,
  type UtilityCompletionOptions,
  type VisionCompletionOptions,
  type UtilityImage,
} from "./utility-model.ts";
export { streamSideChat, type SideChatRequest, type SideChatTurn } from "./side-chat.ts";
export {
  runConnectionSetupTurn,
  buildSetupSystemPrompt,
  type ConnSetupCallbacks,
  type ProbeArgs,
  type ProposedConfig,
} from "./connection-setup.ts";
export { scopeModels, THINKING_SUFFIXES } from "./scope-models.ts";
export {
  listScopedModels,
  setModelScoped,
  type ScopedModel,
} from "./scoped-models-service.ts";
export { createUiBridge, type UiBridgeCallbacks } from "./extension-ui-bridge.ts";
