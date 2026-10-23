import { z } from "zod";
import type { PullRequestSnapshot, RepositorySyncStatistics } from "../../types/domain";
export type { RepositorySyncStatistics } from "../../types/domain";

export const fullReconciliationIntervalMs = 60 * 60 * 1000;
export const incrementalOverlapMs = 2 * 60 * 1000;
export const closedRetentionMs = 30 * 86400000;

export const repositoryCheckpointSchema = z.object({
  version: z.literal(1),
  repository: z.string().min(1),
  cursor: z.number().finite().nonnegative(),
  fullSyncedAt: z.number().finite().nonnegative(),
  qaSignature: z.string(),
  pullRequestIds: z.array(z.number().int().nonnegative()),
}).refine((value) => value.fullSyncedAt <= value.cursor && new Set(value.pullRequestIds).size === value.pullRequestIds.length);

export type RepositoryCheckpoint = z.infer<typeof repositoryCheckpointSchema>;

export interface RepositoryReadOptions {
  checkpoint?: RepositoryCheckpoint;
  forceFull?: boolean;
  now?: number;
  onComplete?: (checkpoint: RepositoryCheckpoint, statistics: RepositorySyncStatistics) => void;
}

export function matchesInventory(checkpoint: RepositoryCheckpoint, snapshots: PullRequestSnapshot[]): boolean {
  const ids = new Set(snapshots.map((pr) => pr.id));
  return ids.size === snapshots.length && ids.size === checkpoint.pullRequestIds.length && checkpoint.pullRequestIds.every((id) => ids.has(id));
}

export function canReadIncrementally(checkpoint: RepositoryCheckpoint | undefined, repository: string, previous: PullRequestSnapshot[], signature: string, now: number): checkpoint is RepositoryCheckpoint {
  return Boolean(checkpoint && repositoryCheckpointSchema.safeParse(checkpoint).success && checkpoint.repository === repository && checkpoint.qaSignature === signature && checkpoint.cursor <= now && checkpoint.fullSyncedAt <= now && now - checkpoint.fullSyncedAt < fullReconciliationIntervalMs && matchesInventory(checkpoint, previous));
}
