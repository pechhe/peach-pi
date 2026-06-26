import { test } from "node:test";
import assert from "node:assert/strict";
import { ConnectorToolRoutes } from "@peach-pi/shared-types";
import { ConnectorResolver } from "../../electron/services/connector-resolver.ts";

test("ConnectorResolver route table matches ConnectorToolRoutes exactly", () => {
  // The constructor builds its route table from ConnectorToolRoutes; service
  // methods are only invoked at request time, so stub services suffice here.
  const resolver = new ConnectorResolver({} as never, {} as never, {} as never);

  const expected = Object.entries(ConnectorToolRoutes)
    .map(([name, spec]) => ({ name, method: spec.method, path: spec.path }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const actual = [...resolver.routeSpecs].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  assert.deepEqual(actual, expected, "resolver must register every ConnectorToolRoutes route and no others");
});

test("every ConnectorToolRoutes entry has a matching resolver route", () => {
  const resolver = new ConnectorResolver({} as never, {} as never, {} as never);
  const specs = new Map(resolver.routeSpecs.map((r) => [r.name, r]));

  for (const [name, spec] of Object.entries(ConnectorToolRoutes)) {
    const route = specs.get(name);
    assert.ok(route, `resolver missing route for ${name}`);
    assert.equal(route!.method, spec.method, `method mismatch for ${name}`);
    assert.equal(route!.path, spec.path, `path mismatch for ${name}`);
  }
});
