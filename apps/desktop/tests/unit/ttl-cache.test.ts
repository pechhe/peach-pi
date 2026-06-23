import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncTtl, KeyedAsyncTtl } from "../../electron/services/ttl-cache.ts";

test("AsyncTtl: serves cached value within TTL", async () => {
  let calls = 0;
  const c = new AsyncTtl<number>(10_000);
  const fn = () => Promise.resolve(++calls);
  assert.equal(await c.run(fn), 1);
  assert.equal(await c.run(fn), 1);
  assert.equal(calls, 1);
});

test("AsyncTtl: collapses concurrent callers onto one in-flight promise", async () => {
  let calls = 0;
  const c = new AsyncTtl<number>(10_000);
  const fn = () => new Promise<number>((r) => setTimeout(() => r(++calls), 5));
  const [a, b] = await Promise.all([c.run(fn), c.run(fn)]);
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.equal(calls, 1);
});

test("AsyncTtl: refetches after expiry", async () => {
  let calls = 0;
  const c = new AsyncTtl<number>(1);
  const fn = () => Promise.resolve(++calls);
  assert.equal(await c.run(fn), 1);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await c.run(fn), 2);
});

test("AsyncTtl: clear() forces a refetch", async () => {
  let calls = 0;
  const c = new AsyncTtl<number>(10_000);
  const fn = () => Promise.resolve(++calls);
  await c.run(fn);
  c.clear();
  assert.equal(await c.run(fn), 2);
});

test("AsyncTtl: does not cache rejections", async () => {
  let calls = 0;
  const c = new AsyncTtl<number>(10_000);
  await assert.rejects(
    c.run(() => {
      calls++;
      return Promise.reject(new Error("boom"));
    }),
  );
  assert.equal(await c.run(() => Promise.resolve(++calls)), 2);
});

test("KeyedAsyncTtl: caches per key", async () => {
  let calls = 0;
  const c = new KeyedAsyncTtl<string>(10_000);
  const make = (k: string) => () => Promise.resolve(`${k}:${++calls}`);
  assert.equal(await c.run("a", make("a")), "a:1");
  assert.equal(await c.run("b", make("b")), "b:2");
  assert.equal(await c.run("a", make("a")), "a:1");
  assert.equal(calls, 2);
});
