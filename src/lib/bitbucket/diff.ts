import { z } from "zod";
import type { BitbucketApiClient } from "./contracts";

const diffstatSchema = z.object({ values: z.array(z.object({ status: z.string(), lines_added: z.number().default(0), lines_removed: z.number().default(0) })), next: z.string().optional() });

export async function getPullRequestDiffstat(client: BitbucketApiClient, workspace: string, repository: string, pullRequestId: number) {
  return client.get(`/repositories/${workspace}/${repository}/pullrequests/${pullRequestId}/diffstat?pagelen=500`, diffstatSchema);
}
