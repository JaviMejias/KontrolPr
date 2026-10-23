export async function mapConcurrent<T, R>(items: T[], limit: number, transform: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try { results[index] = await transform(items[index], index); }
      catch (error) { failed = true; throw error; }
    }
  }));
  return results;
}
