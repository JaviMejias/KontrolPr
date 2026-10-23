import { z } from "zod";
import { BitbucketApiError, type BitbucketApiClient } from "./contracts";
import { basicAuthorization } from "./authorization";

const apiBase = "https://api.bitbucket.org/2.0";
export const maxDiffBytes = 2 * 1024 * 1024;

export function createBitbucketApiClient(accessToken: string | { email: string; token: string }, session?: { signal: AbortSignal; expiresAt: number }): BitbucketApiClient {
  const authorization = typeof accessToken === "string"
    ? `Bearer ${accessToken}`
    : basicAuthorization(accessToken);
  async function request(path: string, accept: string, signal?: AbortSignal): Promise<Response> {
      if (session && Date.now() >= session.expiresAt) throw new BitbucketApiError(401, "Local session expired", "unauthorized");
      const url = new URL(path.startsWith("/") ? `${apiBase}${path}` : path, `${apiBase}/`);
      if (url.origin !== "https://api.bitbucket.org" || !url.pathname.startsWith("/2.0/") || url.username || url.password) {
        throw new BitbucketApiError(undefined, "Untrusted API URL", "unknown");
      }
      let response: Response;
      try {
        response = await fetch(url.href, {
          headers: { Authorization: authorization, Accept: accept },
          signal: AbortSignal.any([AbortSignal.timeout(30000), ...[signal, session?.signal].filter((item): item is AbortSignal => Boolean(item))]),
          credentials: "omit",
          redirect: "error",
        });
      } catch {
        throw new BitbucketApiError(undefined, "Network request failed", "network");
      }
      if (!response.ok) {
        const code = response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : response.status === 429 ? "rate_limited" : "unknown";
        throw new BitbucketApiError(response.status, `Bitbucket request failed with ${response.status}`, code);
      }
      return response;
  }
  return {
    async get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
      const response = await request(path, "application/json", signal);
      const payload: unknown = await response.json();
      const result = schema.safeParse(payload);
      if (!result.success) throw new BitbucketApiError(response.status, "Bitbucket response did not match the expected shape", "unknown");
      return result.data;
    },
    async getText(path: string, signal?: AbortSignal) {
      const response = await request(path, "text/plain", signal);
      if (!response.headers.get("content-type")?.startsWith("text/plain") || !response.body) throw new BitbucketApiError(undefined, "Expected a complete text diff", "unknown");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let bytes = 0;
      let text = "";
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxDiffBytes) throw new BitbucketApiError(undefined, "Diff exceeds the safe size limit", "unknown");
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text + decoder.decode();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    },
  };
}

export function createPaginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({ values: z.array(itemSchema), next: z.string().optional() });
}
