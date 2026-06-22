/** Public surface of the record-replay package. Deep imports also work. */
export * from "./types.ts";
export * from "./store.ts";
export * from "./match.ts";
export * from "./synthesize.ts";
export {
  startCapture,
  stopCapture,
  killCapture,
  captureBinPath,
  processLine,
  type ActiveCapture,
} from "./capture.ts";
