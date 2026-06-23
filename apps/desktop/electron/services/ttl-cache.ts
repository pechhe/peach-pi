/**
 * Tiny async TTL memo for expensive read fan-out (CLI spawns, cloud
 * round-trips). Re-opening a page re-mounts its view and re-fires its loads,
 * so without this every visit re-pays the full latency. `run` returns a fresh
 * value at most once per `ttlMs`, collapses concurrent callers onto one
 * in-flight promise, and never caches rejections. Mutations call `clear()` to
 * force the next read fresh.
 */
export class AsyncTtl<T> {
  private inflight: Promise<T> | null = null;
  private at = 0;
  private has = false;
  private value!: T;
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  run(fn: () => Promise<T>): Promise<T> {
    if (this.has && Date.now() - this.at < this.ttlMs) return Promise.resolve(this.value);
    if (this.inflight) return this.inflight;
    const p = fn()
      .then((v) => {
        this.value = v;
        this.at = Date.now();
        this.has = true;
        this.inflight = null;
        return v;
      })
      .catch((e) => {
        this.inflight = null;
        throw e;
      });
    this.inflight = p;
    return p;
  }

  clear(): void {
    this.has = false;
    this.inflight = null;
  }
}

/** Keyed variant — one {@link AsyncTtl} per key (e.g. catalogue query, project id). */
export class KeyedAsyncTtl<T> {
  private map = new Map<string, AsyncTtl<T>>();
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  run(key: string, fn: () => Promise<T>): Promise<T> {
    let c = this.map.get(key);
    if (!c) {
      c = new AsyncTtl<T>(this.ttlMs);
      this.map.set(key, c);
    }
    return c.run(fn);
  }

  clear(): void {
    this.map.clear();
  }
}
