import type { PeachPiApi } from "@peach-pi/shared-types";

/** Typed access to the preload bridge. Single import point for the renderer. */
export const api: PeachPiApi = window.peachPi;
