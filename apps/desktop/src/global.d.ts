import type { PeachPiApi } from "@peach-pi/shared-types";

declare module "*.mp3?inline" {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    peachPi: PeachPiApi;
  }
}

export {};
