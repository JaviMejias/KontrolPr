import { z } from "zod";
import type { BitbucketApiClient } from "./contracts";
import { createPaginatedSchema } from "./api-client";

const commitSchema = z.object({ hash: z.string(), message: z.string(), date: z.string(), author: z.object({ raw: z.string() }), parents: z.array(z.object({ hash: z.string() })).default([]) });

export async function listPullRequestCommits(client: BitbucketApiClient, workspace: string, repository: string, pullRequestId: number) {
  return client.get(`/repositories/${workspace}/${repository}/pullrequests/${pullRequestId}/commits?pagelen=100`, createPaginatedSchema(commitSchema));
}
