import type { PeachPiApi } from "@peach-pi/shared-types";

declare global {
  interface Window {
    peachPi: PeachPiApi;
  }
}

export {};
