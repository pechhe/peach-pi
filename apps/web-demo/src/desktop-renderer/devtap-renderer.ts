// DevTap renderer-side error capture.
//
// Additive listeners only (no window.onerror override). Errors are forwarded
// to main over the typed IPC seam, where the tap decides whether DEV_TAP=1.
// Wired only under `import.meta.env.DEV`, so production builds attach nothing.

function toErrorInfo(value: unknown): { name: string; message: string; stack?: string } {
  const e = value instanceof Error ? value : new Error(String(value));
  return { name: e.name, message: e.message, stack: e.stack };
}

export function initDevTapRenderer(): void {
  const report = (event: string, error: { name: string; message: string; stack?: string }, payload?: unknown) => {
    try {
      void window.peachPi.invoke("devtap:report", { event, error, payload });
    } catch {
      /* best-effort */
    }
  };

  window.addEventListener("error", (e) => {
    report("error.window", toErrorInfo(e.error ?? e.message), {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    report("error.unhandledrejection", toErrorInfo(e.reason));
  });
}
