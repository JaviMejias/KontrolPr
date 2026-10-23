import { z } from "zod";

export const paginatedResponseSchema = z.object({
  values: z.array(z.unknown()),
  next: z.string().optional(),
  previous: z.string().optional(),
  page: z.number().optional(),
  pagelen: z.number().optional(),
});

export type ApiErrorCode = "unauthorized" | "forbidden" | "rate_limited" | "network" | "unknown";

export class BitbucketApiError extends Error {
  constructor(public readonly status: number | undefined, message: string, public readonly code: ApiErrorCode) {
    super(message);
    this.name = "BitbucketApiError";
  }
}

export interface BitbucketApiClient {
  get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T>;
  getText?(path: string, signal?: AbortSignal): Promise<string>;
}
