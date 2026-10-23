import { z } from "zod";
import type { BitbucketApiClient } from "./contracts";

export async function readAllPages<T>(client: BitbucketApiClient, path: string, item: z.ZodType<T>, onPage?: () => void, signal?: AbortSignal): Promise<T[]> {
  const values: T[] = [];
  const visited = new Set<string>();
  let next: string | undefined = path;
  while (next) {
    signal?.throwIfAborted();
    if (visited.has(next)) throw new Error("Repeated pagination URL");
    visited.add(next);
    const schema = z.object({ values: z.array(item), next: z.string().optional() });
    const page: { values: T[]; next?: string } = await (signal ? client.get(next, schema, signal) : client.get(next, schema));
    values.push(...page.values);
    onPage?.();
    next = page.next;
  }
  return values;
}
