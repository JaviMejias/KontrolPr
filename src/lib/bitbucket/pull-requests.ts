import { z } from "zod";
import type { BitbucketApiClient } from "./contracts";
import { createPaginatedSchema } from "./api-client";

const userSchema = z.object({ account_id: z.string().optional(), uuid: z.string().optional(), display_name: z.string().optional(), nickname: z.string().optional() });
const pullRequestSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().default(""),
  state: z.string(),
  draft: z.boolean().default(false),
  queued: z.boolean().default(false),
  created_on: z.string(),
  updated_on: z.string(),
  author: userSchema,
  source: z.object({ branch: z.object({ name: z.string() }), commit: z.object({ hash: z.string() }) }),
  destination: z.object({ branch: z.object({ name: z.string() }), commit: z.object({ hash: z.string() }) }),
  links: z.object({ html: z.object({ href: z.string() }) }),
  comment_count: z.number().default(0),
  task_count: z.number().default(0),
});

export async function listPullRequests(client: BitbucketApiClient, workspace: string, repository: string, state = "ALL") {
  return client.get(`/repositories/${workspace}/${repository}/pullrequests?state=${state}&pagelen=50`, createPaginatedSchema(pullRequestSchema));
}
