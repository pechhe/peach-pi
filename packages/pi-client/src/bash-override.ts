// Bash tool override: wraps pi's built-in bash so a per-command default
// timeout is applied when the agent omits one. Prevents a runaway command
// (e.g. `find /`) wedging an agent turn for 20+ minutes until the user
// manually aborts.
//
// Approach: `createBashToolDefinition` accepts a `BashOperations` (the raw
// exec backend), and `createLocalBashOperations()` is pi's own backend for
// local shell execution. We wrap the backend with `withDefaultTimeout`,
// which substitutes `DEFAULT_BASH_TIMEOUT_S` whenever the caller supplies no
// `timeout`, then pass the resulting `ToolDefinition` via
// `createAgentSession({ customTools })`. The SDK's tool registry lets custom
// tools shadow built-ins by name, so this overrides the built-in `bash`
// while inheriting all of pi's render/truncation/handling logic.

import type {
  BashOperations,
  BashToolOptions,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

/**
 * Default per-command timeout in seconds, applied when the agent omits a
 * `timeout` arg. Ten minutes is long enough for legitimate long-running
 * commands (full `pnpm install`, packaging, slow test suites) but catches a
 * genuinely hung command (filesystem walks, blocked prompts) well before a
 * user notices the stuck turn. The agent can still pass its own `timeout`
 * to override this for known-long commands.
 */
export const DEFAULT_BASH_TIMEOUT_S = 600;

/**
 * Wrap a `BashOperations` so any `exec` call with no caller-supplied
 * `timeout` gets the default. Only `exec` is replaced; shell resolution, env,
 * signal handling, and `killProcessTree` on abort stay in the underlying
 * implementation.
 */
export function withDefaultTimeout(
  ops: BashOperations,
  defaultTimeoutS: number = DEFAULT_BASH_TIMEOUT_S,
): BashOperations {
  return {
    exec: (command, cwd, opts) => {
      const appliedDefault =
        opts.timeout === undefined || opts.timeout <= 0;
      const nextOpts = appliedDefault
        ? { ...opts, timeout: defaultTimeoutS }
        : opts;
      return ops.exec(command, cwd, nextOpts);
    },
  };
}

/**
 * Build the custom bash `ToolDefinition` that shadows the built-in `bash`
 * tool. `createBashToolDefinition` and `createLocalBashOperations` are the
 * SDK's own factories, so we inherit stock shell handling and only swap the
 * exec backend for the timeout-wrapped variant.
 *
 * Both SDK functions are passed in (rather than imported here) so the file
 * stays import-side-effect-free for the CJS Electron main process; the caller
 * resolves them from its dynamic `await import("@earendil-works/pi-coding-agent")`.
 */
export function createBashOverrideDefinition(
  cwd: string,
  // Widened to `ToolDefinition<any, any, any>` so the SDK's concretely-
  // parameterised factory is assignable; the override only needs the name +
  // execute path, not the render generics.
  createBashToolDefinition: (cwd: string, options?: BashToolOptions) => ToolDefinition<any, any, any>,
  createLocalBashOperations: (options?: { shellPath?: string }) => BashOperations,
  options?: BashToolOptions & { defaultTimeoutS?: number },
): ToolDefinition<any, any, any> {
  const localOps = createLocalBashOperations(
    options?.shellPath ? { shellPath: options.shellPath } : {},
  );
  const operations = withDefaultTimeout(
    localOps,
    options?.defaultTimeoutS ?? DEFAULT_BASH_TIMEOUT_S,
  );
  return createBashToolDefinition(cwd, {
    ...(options?.shellPath ? { shellPath: options.shellPath } : {}),
    ...(options?.commandPrefix
      ? { commandPrefix: options.commandPrefix }
      : {}),
    operations,
  });
}

export type { BashOperations, BashToolOptions };
