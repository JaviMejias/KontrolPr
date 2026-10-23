import { z } from "zod";
import type { BitbucketApiClient } from "./contracts";
import { createPaginatedSchema } from "./api-client";

const commentSchema = z.object({ id: z.number(), created_on: z.string(), updated_on: z.string().optional(), content: z.object({ raw: z.string() }), user: z.object({ account_id: z.string().optional(), uuid: z.string().optional(), display_name: z.string().optional() }), parent: z.object({ id: z.number() }).optional(), inline: z.record(z.string(), z.unknown()).optional(), deleted: z.boolean().optional(), links: z.object({ html: z.object({ href: z.string() }) }) });

export async function listPullRequestComments(client: BitbucketApiClient, workspace: string, repository: string, pullRequestId: number) {
  return client.get(`/repositories/${workspace}/${repository}/pullrequests/${pullRequestId}/comments?pagelen=100`, createPaginatedSchema(commentSchema));
}
