/**
 * Run async work over `items` with at most `concurrency` in flight.
 * Avoids firing hundreds of parallel HTTP requests (browser + server overload).
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.floor(concurrency) || 8);

  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await mapper(items[i]!, i);
    }
  }

  const poolSize = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}
