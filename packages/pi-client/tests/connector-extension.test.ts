import { test } from "node:test";
import assert from "node:assert/strict";
import { ConnectorToolRoutes } from "@peach-pi/shared-types";
// Direct import of the type-checked extension source (real .ts, in the type
// graph). strip-types erases the type-only `@peach-pi/shared-types` import; the
// runtime `typebox` import resolves against the SDK's hoisted dependency.
import extensionFactory from "../src/extensions/peach-connectors.ts";

/** Minimal ExtensionAPI stub that records registerTool calls. */
function createRecordingApi() {
  const tools = new Map<string, { name: string }>();
  return {
    tools,
    api: {
      registerTool(tool: { name: string }) {
        tools.set(tool.name, tool);
      },
      on() {},
      registerCommand() {},
      registerShortcut() {},
      registerFlag() {},
      getFlag() {
        return undefined;
      },
      registerMessageRenderer() {},
      sendMessage() {},
      sendUserMessage() {},
      appendEntry() {},
      setSessionName() {},
      getSessionName() {
        return undefined;
      },
      setLabel() {},
      exec() {
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
      },
      getActiveTools() {
        return [];
      },
      getAllTools() {
        return [];
      },
      setActiveTools() {},
      getCommands() {
        return [];
      },
      setModel() {
        return Promise.resolve();
      },
      getThinkingLevel() {
        return "low" as const;
      },
      setThinkingLevel() {},
      registerProvider() {},
      unregisterProvider() {},
      events: { on() {}, emit() {}, off() {} },
    },
  };
}

test("peach-connectors extension registers exactly the ConnectorToolRoutes tools", async () => {
  const { tools, api } = createRecordingApi();
  await extensionFactory(api as never);

  const expected = Object.keys(ConnectorToolRoutes).sort();
  const registered = [...tools.keys()].sort();

  assert.deepEqual(registered, expected, "extension must register every ConnectorToolRoutes tool and no others");
});

test("each registered tool name is a key of ConnectorToolRoutes", async () => {
  const { tools, api } = createRecordingApi();
  await extensionFactory(api as never);
  const routeNames = new Set(Object.keys(ConnectorToolRoutes));
  for (const name of tools.keys()) {
    assert.ok(routeNames.has(name), `tool ${name} is not in ConnectorToolRoutes`);
  }
});
