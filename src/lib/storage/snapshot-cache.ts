import { z } from "zod";
import type { PullRequestSnapshot, RepositoryConfig } from "../../types/domain";
import { repositoryKey } from "../../features/settings/services/tracking";
import { deleteValue, readValue, writeValue } from "./indexed-db";
import { matchesInventory, repositoryCheckpointSchema, type RepositoryCheckpoint } from "../bitbucket/repository-sync";

export const syncIntervalMs = 10 * 60 * 1000;
const cacheKey = "session-snapshot.v1";
const person = z.object({ accountId: z.string(), displayName: z.string(), nickname: z.string().optional(), uuid: z.string().optional(), atlassianAccountId: z.string().optional() });
const repository = z.object({ workspace: z.string(), slug: z.string(), name: z.string(), label: z.string() });
const snapshot: z.ZodType<PullRequestSnapshot> = z.object({
  key: z.string(), repository, id: z.number(), title: z.string(), description: z.string(), author: person,
  sourceBranch: z.string(), destinationBranch: z.string(), state: z.enum(["OPEN", "MERGED", "DECLINED", "SUPERSEDED", "UNKNOWN"]),
  draft: z.boolean(), queued: z.boolean(), createdAt: z.string(), updatedAt: z.string(), htmlUrl: z.string(), rawState: z.string(),
  participants: z.array(person).optional(),
  comments: z.array(z.object({ id: z.number(), author: person, createdAt: z.string(), updatedAt: z.string().optional(), content: z.string(), mentions: z.record(z.string(), z.string()).optional(), parentId: z.number().optional(), inline: z.boolean(), resolved: z.boolean().optional(), link: z.string() })),
  commits: z.array(z.object({ hash: z.string(), message: z.string(), author: person, authoredAt: z.string(), committedAt: z.string(), parents: z.array(z.string()), effectiveDiffFingerprint: z.string(), changedFiles: z.number() })),
  activity: z.array(z.object({ id: z.string(), kind: z.enum(["pull_request_created", "metadata_updated", "commit_added", "comment_added", "approval_added", "change_requested"]), actor: person, createdAt: z.string(), commentId: z.number().optional(), commitHash: z.string().optional(), content: z.string().optional(), link: z.string(), sourceHash: z.string().optional(), destinationHash: z.string().optional(), approvalActive: z.boolean().optional() })),
  diffFingerprint: z.string(), reviewedDiffFingerprint: z.string().optional(), reviewEvidenceLimited: z.boolean().optional(), diffFileCount: z.number().optional(),
  sourceHash: z.string().optional(), destinationHash: z.string().optional(),
  reviewEvidence: z.object({ version: z.union([z.literal(1), z.literal(2)]), qaSignature: z.string(), historyComplete: z.boolean(), revisions: z.array(z.object({ sourceHash: z.string(), destinationHash: z.string(), at: z.string(), fingerprint: z.string().optional(), contentFingerprint: z.string().optional(), changedFiles: z.number().optional() })) }).optional(),
});
const cacheSchema = z.object({ version: z.literal(1), owner: z.string(), sessionCreatedAt: z.number().finite(), expiresAt: z.number().finite(), repositories: z.array(z.string()), baselinedRepositories: z.array(z.string()), syncedAt: z.number().finite(), message: z.string(), snapshots: z.array(snapshot), checkpoints: z.unknown().optional() });
export type SnapshotCache = Omit<z.infer<typeof cacheSchema>, "checkpoints"> & { checkpoints?: Record<string, RepositoryCheckpoint> };
let memory: SnapshotCache | undefined;

export function repositorySignature(repositories: RepositoryConfig[]): string[] {
  return [...new Set(repositories.map(repositoryKey))].sort();
}

export async function clearSnapshotCache(): Promise<void> {
  memory = undefined;
  if (typeof indexedDB !== "undefined") await deleteValue(cacheKey).catch(() => {});
}

export async function loadSnapshotCache(owner: string, sessionCreatedAt: number, expiresAt: number, repositories: RepositoryConfig[], now = Date.now()): Promise<SnapshotCache | undefined> {
  const raw = typeof indexedDB === "undefined" ? memory : await readValue<unknown>(cacheKey).catch(() => memory);
  if (!raw) return;
  const result = cacheSchema.safeParse(raw);
  if (!result.success) { await clearSnapshotCache(); return; }
  const { checkpoints: rawCheckpoints, ...cache } = result.data;
  if (cache.owner !== owner || cache.sessionCreatedAt !== sessionCreatedAt || cache.expiresAt !== expiresAt || expiresAt <= now || cache.syncedAt > now || cache.syncedAt < sessionCreatedAt || JSON.stringify(cache.repositories) !== JSON.stringify(repositorySignature(repositories))) return;
  const allowed = new Map(repositories.map((repo) => [repositoryKey(repo), repo]));
  if (cache.snapshots.some((pr) => !allowed.has(repositoryKey(pr.repository)) || pr.key !== `${repositoryKey(pr.repository)}#${pr.id}`)) return;
  const snapshots = [...new Map(cache.snapshots.map((pr) => [pr.key, { ...pr, repository: allowed.get(repositoryKey(pr.repository))! }])).values()];
  const checkpoints: Record<string, RepositoryCheckpoint> = {};
  if (rawCheckpoints && typeof rawCheckpoints === "object" && !Array.isArray(rawCheckpoints)) {
    for (const [key, rawCheckpoint] of Object.entries(rawCheckpoints)) {
      const checkpoint = repositoryCheckpointSchema.safeParse(rawCheckpoint);
      if (!checkpoint.success) continue;
      const value = checkpoint.data;
      if (allowed.has(key) && value.repository === key && value.cursor >= sessionCreatedAt && value.cursor <= cache.syncedAt && value.fullSyncedAt >= sessionCreatedAt && matchesInventory(value, snapshots.filter((pr) => repositoryKey(pr.repository) === key))) checkpoints[key] = value;
    }
  }
  const restored = { ...cache, snapshots, ...(rawCheckpoints === undefined ? {} : { checkpoints }) };
  memory = restored;
  return restored;
}

export async function saveSnapshotCache(cache: SnapshotCache): Promise<boolean> {
  memory = cache;
  if (typeof indexedDB === "undefined") return false;
  try { await writeValue(cacheKey, cache); return true; } catch { return false; }
}
