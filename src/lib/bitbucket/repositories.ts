import { z } from "zod";
import type { BitbucketApiClient } from "./contracts";
import { createPaginatedSchema } from "./api-client";

const repositorySchema = z.object({ slug: z.string(), name: z.string(), full_name: z.string() });

export async function listRepositories(client: BitbucketApiClient, workspace: string) {
  return client.get(`/repositories/${workspace}?pagelen=100`, createPaginatedSchema(repositorySchema));
}
