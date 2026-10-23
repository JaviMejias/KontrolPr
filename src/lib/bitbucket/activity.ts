import { z } from "zod";
import type { BitbucketApiClient } from "./contracts";
import { createPaginatedSchema } from "./api-client";

const activitySchema = z.object({
  update: z.object({ date: z.string(), author: z.object({ display_name: z.string().optional(), account_id: z.string().optional() }) }).optional(),
  comment: z.object({ id: z.number(), created_on: z.string() }).optional(),
  approval: z.object({ date: z.string(), user: z.object({ display_name: z.string().optional(), account_id: z.string().optional() }) }).optional(),
});

export async function listPullRequestActivity(client: BitbucketApiClient, workspace: string, repository: string, pullRequestId: number) {
  return client.get(`/repositories/${workspace}/${repository}/pullrequests/${pullRequestId}/activity`, createPaginatedSchema(activitySchema));
}
