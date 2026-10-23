import { beforeEach, describe, expect, it } from "vitest";
import { demoDataset } from "../../features/pull-requests/services/fixtures";
import { sessionExpiresAt } from "../../features/auth/services/session-storage";
import { clearSnapshotCache, loadSnapshotCache, repositorySignature, saveSnapshotCache, type SnapshotCache } from "./snapshot-cache";
import type { RepositoryCheckpoint } from "../bitbucket/repository-sync";
import { repositoryKey } from "../../features/settings/services/tracking";

const createdAt = Date.parse("2026-10-22T12:00:00Z");
const repositories = [...new Map(demoDataset.pullRequests.map((pr) => [pr.repository.slug, pr.repository])).values()];
const snapshots = demoDataset.pullRequests.map((pr) => ({ ...pr, key: `${pr.repository.workspace}/${pr.repository.slug}#${pr.id}` }));
const cache: SnapshotCache = { version: 1, owner: "owner", sessionCreatedAt: createdAt, expiresAt: sessionExpiresAt(createdAt), syncedAt: createdAt + 1000, message: "", repositories: repositorySignature(repositories), baselinedRepositories: repositorySignature(repositories), snapshots };
beforeEach(clearSnapshotCache);

describe("session snapshot cache", () => {
  it("restores an intact snapshot including comments and commits", async () => {
    await saveSnapshotCache(cache);
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.syncedAt)).toEqual(cache);
  });
  it("preserves discovered participants while accepting old snapshots without a participant directory", async () => {
    const withParticipants = { ...cache, snapshots: [{ ...snapshots[0], participants: [{ accountId: "qa-reviewer", displayName: "QA Reviewer", nickname: "reviewer" }] }] };
    await saveSnapshotCache(withParticipants);
    expect((await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.syncedAt))?.snapshots[0].participants).toEqual(withParticipants.snapshots[0].participants);
    await saveSnapshotCache(cache);
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.syncedAt)).toEqual(cache);
  });
  it("never crosses account, login, expiry or repository boundaries", async () => {
    await saveSnapshotCache(cache);
    expect(await loadSnapshotCache("other", createdAt, cache.expiresAt, repositories, cache.syncedAt)).toBeUndefined();
    expect(await loadSnapshotCache("owner", createdAt + 1, cache.expiresAt, repositories, cache.syncedAt)).toBeUndefined();
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.expiresAt)).toBeUndefined();
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories.slice(0, 1), cache.syncedAt)).toBeUndefined();
  });
  it("accepts repository ordering/label changes without retaining outdated labels", async () => {
    await saveSnapshotCache(cache);
    const renamed = [...repositories].reverse().map((repo) => ({ ...repo, label: "Nuevo nombre" }));
    const restored = await loadSnapshotCache("owner", createdAt, cache.expiresAt, renamed, cache.syncedAt);
    expect(restored?.snapshots).toHaveLength(snapshots.length);
    expect(restored?.snapshots.every((pr) => pr.repository.label === "Nuevo nombre")).toBe(true);
  });
  it("rejects malformed content, out-of-scope PR and future timestamps", async () => {
    await saveSnapshotCache({ ...cache, snapshots: [{ ...snapshots[0], comments: null }] } as unknown as SnapshotCache);
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.syncedAt)).toBeUndefined();
    await saveSnapshotCache({ ...cache, snapshots: [{ ...snapshots[0], key: "other#42" }] });
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.syncedAt)).toBeUndefined();
    await saveSnapshotCache(cache);
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, createdAt)).toBeUndefined();
  });
  it("clears cached content without touching preferences", async () => {
    await saveSnapshotCache(cache); await clearSnapshotCache();
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.syncedAt)).toBeUndefined();
  });
  it("restores per-repository cursors atomically with their exact inventories", async () => {
    const key = repositoryKey(repositories[0]);
    const checkpoint: RepositoryCheckpoint = { version: 1, repository: key, cursor: cache.syncedAt, fullSyncedAt: cache.syncedAt, qaSignature: "qa", pullRequestIds: snapshots.filter((pr) => repositoryKey(pr.repository) === key).map((pr) => pr.id) };
    const stored = { ...cache, checkpoints: { [key]: checkpoint } };
    await saveSnapshotCache(stored);
    expect(await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.syncedAt)).toEqual(stored);
    expect(await loadSnapshotCache("another", createdAt, cache.expiresAt, repositories, cache.syncedAt)).toBeUndefined();
  });
  it("drops malformed, future, foreign or mismatched cursors without erasing valid PR content", async () => {
    const key = repositoryKey(repositories[0]);
    const valid: RepositoryCheckpoint = { version: 1, repository: key, cursor: cache.syncedAt, fullSyncedAt: createdAt, qaSignature: "qa", pullRequestIds: snapshots.filter((pr) => repositoryKey(pr.repository) === key).map((pr) => pr.id) };
    for (const broken of [
      { ...valid, version: 99 }, { ...valid, cursor: cache.syncedAt + 1 }, { ...valid, cursor: createdAt - 1 },
      { ...valid, fullSyncedAt: createdAt - 1 }, { ...valid, repository: "foreign/repo" },
      { ...valid, pullRequestIds: [] }, { ...valid, pullRequestIds: [1, 1] },
    ]) {
      await saveSnapshotCache({ ...cache, checkpoints: { [key]: broken as RepositoryCheckpoint } });
      const restored = await loadSnapshotCache("owner", createdAt, cache.expiresAt, repositories, cache.syncedAt);
      expect(restored?.snapshots).toEqual(snapshots);
      expect(restored?.checkpoints).toEqual({});
    }
  });
});
